# Hearth — Node.js Middleware & Frontend

Hearth is a home-services marketplace (conceptually similar to Urban Company). This repo is the **Node.js middleware + frontend**: an Express server that serves the static site under `public/` and fronts every REST call the browser makes, forwarding most of them to a separate **Vert.x (Java) backend** over mTLS. Node owns the session — it signs and validates its own JWTs — but it does not own the data; PostgreSQL sits behind the Vert.x service, not behind this repo.

There is no database and no build step in this repo. `src/data/*.json` is a legacy leftover from an earlier local-only version of this server and is no longer read by any route — every route here talks to the real Vert.x backend.

## Architecture

```
Browser (public/*.html + resources/js/*.js)
   │  HTTPS, cookie: _fks (JWT, httpOnly)
   ▼
Node / Express  (this repo — server.js, src/)
   │  mTLS, Authorization: Bearer <the same _fks JWT>
   ▼
Vert.x backend (Java)  →  PostgreSQL
```

- **Session cookie (`_fks`)**: an RS256 JWT that Node signs and verifies itself (`src/auth/jwt.js`, `src/auth/keystore.js`) — Node never relays a token minted by the Vert.x side, since `authenticate()` (`src/auth/auth.js`) only trusts this server's own keypair. Every authenticated route re-sends this same JWT to Vert.x as a bearer token.
- **mTLS to Vert.x**: `src/util/http_client.js` presents a client cert/key (`MTLS_CLIENT_*` in `.env`) and pins the Vert.x server's CA, so both sides authenticate each other on every call.
- **Service-to-service auth**: a few flows (e.g. checking whether a mobile/email is already registered during OTP login) need a token *before* any user is logged in. `src/auth/token_mgr.js` gets and caches one via OAuth2 client-credentials against `AUTH_TOKEN_URL`, using `SERVICE_CLIENT_ID` / `SERVICE_CLIENT_SECRET`.
- **Redis / Memurai**: used for OTP and cache state (`src/util/cache.js`). Memurai is the Windows-native build of Redis; either works.

## User types

| Type | How they log in | Where |
|---|---|---|
| **CUSTOMER** | Mobile OTP, via the login modal in every page's shared header | any page, e.g. `public/index.html` |
| **PROFESSIONAL** | Same mobile OTP flow as customers (role comes back from the backend) | same header modal |
| **ADMIN** | Username + password — a separate, unrelated flow | `public/admin-login.html` (see below) |

An admin's session JWT carries an extra claim, `priv: "admin"`, that admin-only routes check for server-side (`requireAdmin` in `src/auth/auth.js`). It's absent entirely from customer/professional tokens.

## Running it locally

**Prerequisites**
- Node.js ≥ 18 (`engines` in `package.json`; developed against newer Node as well)
- Redis or Memurai running and reachable at `REDIS_HOST:REDIS_PORT`
- The Vert.x backend running and reachable at `HEARTH_SERVER`
- TLS material already present under `cert/`, `ca/`, and `keystore/` (Node's own HTTPS listener cert, the mTLS client identity for talking to Vert.x, and the RS256 keypair Node uses to sign session JWTs). These are environment-specific — generate/obtain your own rather than reusing another environment's.

**Setup**

```bash
npm install
```

Create a `.env` in the repo root (never commit this — it's already in `.gitignore`) with at least:

Start Redis/Memurai (see below), make sure the Vert.x backend is up, then:

```bash
npm start        # node --env-file=.env server.js
npm run dev       # same, with --watch for auto-restart
```

Then open **https://localhost:8443**. The certificate is self-signed, so the browser will warn — accept it to proceed. Node's HTTPS listener always binds to **8443** (hardcoded in `server.js`); the `PORT` env var only appears in a startup log line, so changing it doesn't actually move the listener.

### Redis (macOS)

```bash
brew install redis
redis-server        # foreground; Ctrl-C to stop
redis-cli ping       # → PONG
```

### Memurai (Windows — Redis-compatible)

Install from https://www.memurai.com, then in `memurai.conf`:

```
dir %HOME%\Memurai\data
dbfilename dump.rdb
```

```
C:\Program Files\Memurai>memurai.exe        REM start the server
C:\Program Files\Memurai>memurai-cli.exe    REM start a CLI to test it
```

## Accessing the Admin Portal

The admin portal is a separate area of the site — it doesn't share the customer header/nav, and its session is cached under its own `localStorage` keys so it never mixes with a customer/professional session in the same browser.

1. Go to **`https://localhost:8443/admin-login.html`**.
2. Sign in with an admin username and password. This is checked against the Vert.x backend (`POST /api/v1/login`, form-urlencoded) — this repo has no admin accounts or credential store of its own, so ask whoever manages accounts on the Vert.x/PostgreSQL side for one, or create it there.
3. On success you're redirected to **`admin-dashboard.html`**, a left-nav shell with four tabs, each fetched on first open:
   - **Overview** — professionals applied (with a pending/approved breakdown), total customers, bookings by status.
   - **Professional Applications** — every application; a **PENDING** row shows Approve/Reject actions (confirmation required before either takes effect).
   - **Bookings** — every booking, filterable by status.
   - **Customers** — the full customer list.
4. **Log out** (bottom of the sidebar) clears the session cookie and the cached admin session, and returns you to the login screen.

Admin-only API routes (mounted under `BASE_PATH`, default `/gateway/v1`) are gated by `requireAdmin`, which checks the `_fks` cookie's `priv: "admin"` claim: `GET /professionals`, `GET /users`, plus the reporting endpoint `POST /admin/query` and the approve/reject endpoint `POST /admin/professionals`. A non-admin, or a request with no valid session at all, gets a 403/401 rather than any data.

> **Note:** as of this writing, `POST /admin/query` and `POST /admin/professionals` (`src/routes/query.js`, `src/routes/professionalMgmt.js`) import `requireAdmin` but don't yet apply it to their routes — worth closing before this goes anywhere but a trusted dev environment.

## Project structure

```
hearth-ui/
├── server.js                    entry point — Express app, HTTPS listener on :8443
├── package.json
├── .env                         local config (gitignored — see above)
├── cert/, ca/, keystore/        TLS material (Node's own cert, mTLS client identity, JWT signing keys)
├── routing/routing-config.json  legacy route-mapping config (superseded by src/gway — kept for reference)
├── public/                      the frontend — plain HTML/CSS/JS, no framework, no bundler
│   ├── index.html, categories.html, checkout.html, ...    customer-facing pages
│   ├── professional-dashboard.html                        professional's own account screen
│   ├── admin-login.html                                   admin sign-in (username/password)
│   ├── admin-dashboard.html                                admin portal shell (see above)
│   └── resources/
│       ├── css/styles.css        one stylesheet, design tokens + one section per feature
│       └── js/
│           ├── api.js                     all fetch() calls, exposed as window.HearthAPI
│           ├── script.js, layout.js       customer site behaviour + shared header/footer
│           ├── admin-session.js           admin session helpers (shared by both admin pages)
│           ├── admin-login.js             admin-login.html only
│           └── admin-dashboard.js         admin-dashboard.html only
└── src/
    ├── auth/
    │   ├── jwt.js            sign/verify the _fks session JWT (RS256)
    │   ├── auth.js           authenticate + requireAdmin middleware
    │   ├── keystore.js       loads Node's own signing keypair
    │   └── token_mgr.js      client-credentials token for service-to-service calls
    ├── routes/               one file per resource, thin proxies to the Vert.x backend
    │   ├── login.js          OTP login + admin login (POST /login/admin)
    │   ├── user.js, professional.js, booking.js, address.js, ...
    │   ├── professionalMgmt.js   admin approve/reject (POST /admin/professionals)
    │   └── query.js              admin reporting (POST /admin/query)
    ├── gway/                 backend gateway plumbing
    ├── util/                 http client (mTLS), logger, cache, cookies, misc
    └── data/                 legacy local JSON files — unused; a real backend answers every route now
```

## Known gaps

- The admin approve/reject and reporting routes aren't guarded by `requireAdmin` yet (see note above).
- No pagination on the admin dashboard's tables — each tab renders whatever one call returns.
- `src/data/*.json` and `routing/routing-config.json` are unused leftovers from an earlier iteration of this server; safe to remove once confirmed nothing still references them.
