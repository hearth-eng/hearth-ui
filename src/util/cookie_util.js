const {getLogger} = require('./../util/logger');
const log = getLogger(__filename);

class CookieUtil {
    
    static STD_COOKIE = '_fks';
    
    static CUSTOMER_COOKIE = '_fks_c';
    static PROFESSIONAL_COOKIE = '_fks_p';
    static ADMIN_COOKIE = '_fks_a';

    static COOKIE_OPTS = {
        httpOnly: true,                 // Protects against XSS attacks (not accessible via client JS)
        // Only sent over HTTPS. Defaults to true (secure); set COOKIE_SECURE=false
        // only for a plain-HTTP interim deployment (e.g. before an ACM cert is on
        // the ALB) - a Secure cookie is never sent back by the browser over HTTP,
        // which otherwise breaks every flow that relies on this cookie round-tripping.
        secure: (process.env.COOKIE_SECURE ?? 'true') !== 'false',
        sameSite: 'lax',                // Mitigates CSRF attacks
        path: (process.env.BASE_PATH || '/gateway/v1/')
    };

    static prepare(ttlMin, uri) {
        // Copy, don't mutate CookieUtil.COOKIE_OPTS directly - it's a single shared
        // static object, and this function runs concurrently across requests on one
        // Node process. Mutating it in place let a truthy `uri` on one call corrupt
        // `path` for every other call for the lifetime of the process.
        let cookieOpts = { ...CookieUtil.COOKIE_OPTS };

        cookieOpts.maxAge = ttlMin * 60 * 1000;     // maxAge is always in milliseconds
        if (uri) {
            cookieOpts.path = cookieOpts.path + 'uri';
        }
        if (log.isDebugEnabled()) {
            log.debug('Cookie options: %s', JSON.stringify(cookieOpts));
        }
        return cookieOpts;
    }

    /** Parses a `Cookie` request header into a plain object. */
    static parseCookies(cookieHeader) {
        const result = {};
        if (! cookieHeader)
            return result;

        cookieHeader.split(';').forEach((pair) => {
            const idx = pair.indexOf('=');
            if (idx === -1)
                return;
            const key = pair.slice(0, idx).trim();
            const value = pair.slice(idx + 1).trim();
            if (!key)
                return;
            try {
                result[key] = decodeURIComponent(value);
            } catch (err) {
                result[key] = value;
            }
        });

        return result;
    }

    /**
     * Builds a `Set-Cookie` header value.
     * @param {string} name
     * @param {string} value
     * @param {{ httpOnly?: boolean, path?: string, maxAgeSeconds?: number, sameSite?: 'Lax'|'Strict'|'None', secure?: boolean }} [options]
     */
    static serializeCookie(name, value, options = {}) {
        const {
            httpOnly = true,
            path = '/',
            maxAgeSeconds,
            sameSite = 'Lax',
            secure = false
        } = options;

        let cookie = `${name}=${encodeURIComponent(value)}`;
        if (path) {
            cookie += `; Path=${path}`;
        }
        if (typeof maxAgeSeconds === 'number') {
            cookie += `; Max-Age=${maxAgeSeconds}`;
        }
        if (httpOnly) {
            cookie += '; HttpOnly';
        }
        if (sameSite) {
            cookie += `; SameSite=${sameSite}`;
        }
        if (secure) {
            cookie += '; Secure';
        }
        return cookie;
    }

    /** Builds a `Set-Cookie` header value that immediately expires a cookie. */
    static serializeExpiredCookie(name, options = {}) {
        return serializeCookie(name, '', {...options, maxAgeSeconds: 0});
    }
}

module.exports = CookieUtil;
