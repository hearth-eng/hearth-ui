#!/bin/sh
# Writes cert/key material (injected by ECS from Secrets Manager as env vars), then
# starts the real process:
#   1. The mTLS CLIENT identity used by http_client.js to call hearth-app, written
#      to the paths given by MTLS_CA_CERT_PATH / MTLS_CLIENT_CERT_PATH / MTLS_CLIENT_KEY_PATH
#      (these path env vars are the exact names http_client.js already reads).
#   2. hearth-ui's own HTTPS SERVER identity (server.js's https.createServer),
#      written to the paths given by TLS_SERVER_CERT_PATH / TLS_SERVER_KEY_PATH.
#   3. The shared RS256 JWT key pair (src/auth/keystore.js), to the fixed path
#      keystore.js hardcodes - keystore/hearth_prv.pem and keystore/hearth_pub.pem,
#      relative to WORKDIR /app (no env var hook in that module, same constraint as
#      the cert paths above). hearth-ui verifies hearth-app's JWTs with the public
#      half and signs its own session-cookie JWTs with the private half - see
#      RUNBOOK.md for why this one key pair is shared across both services.
set -eu
umask 077

write_pem() { # content path
  if [ -n "$1" ] && [ -n "$2" ]; then
    mkdir -p "$(dirname "$2")"
    printf '%s\n' "$1" > "$2"
  fi
}

# mTLS client identity (calling hearth-app)
write_pem "${MTLS_CA_PEM:-}"   "${MTLS_CA_CERT_PATH:-}"
write_pem "${MTLS_CERT_PEM:-}" "${MTLS_CLIENT_CERT_PATH:-}"
write_pem "${MTLS_KEY_PEM:-}"  "${MTLS_CLIENT_KEY_PATH:-}"
unset MTLS_CA_PEM MTLS_CERT_PEM MTLS_KEY_PEM

# Server-side TLS identity (serving the browser/ALB)
write_pem "${TLS_SERVER_CERT_PEM:-}" "${TLS_SERVER_CERT_PATH:-}"
write_pem "${TLS_SERVER_KEY_PEM:-}"  "${TLS_SERVER_KEY_PATH:-}"
unset TLS_SERVER_CERT_PEM TLS_SERVER_KEY_PEM

# Shared JWT signing/verification key pair
write_pem "${JWT_PRV_PEM:-}" "keystore/hearth_prv.pem"
write_pem "${JWT_PUB_PEM:-}" "keystore/hearth_pub.pem"
unset JWT_PRV_PEM JWT_PUB_PEM

exec "$@"
