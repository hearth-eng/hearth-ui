#!/bin/sh
# Writes two independent cert/key pairs (injected by ECS from Secrets Manager as
# env vars), then starts the real process:
#   1. The mTLS CLIENT identity used by http_client.js to call hearth-app, written
#      to the paths given by MTLS_CA_CERT_PATH / MTLS_CLIENT_CERT_PATH / MTLS_CLIENT_KEY_PATH
#      (these path env vars are the exact names http_client.js already reads).
#   2. hearth-ui's own HTTPS SERVER identity (server.js's https.createServer),
#      written to the paths given by TLS_SERVER_CERT_PATH / TLS_SERVER_KEY_PATH.
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

exec "$@"
