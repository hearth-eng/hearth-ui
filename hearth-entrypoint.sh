#!/bin/sh
# Writes cert/key material (injected by ECS from Secrets Manager as env vars) to
# store/, then starts the real process. All four files are read directly by Node
# at the paths given by JWT_KEYSTORE / MTLS_CLIENT_STORE / CA_STORE / TLS_SERVER_STORE
# (set as plain env vars in Terraform, not secrets themselves - see keystore.js /
# mtlsstore.js / castore.js / tlsstore.js / http_client.js):
#   store/hearth.pkcs      <- SHARED_PKCS12_B64 (JWT signing/verification keypair -
#                              byte-identical file to hearth-app's store/hearth.pkcs)
#   store/hearth-ui.pem    <- MTLS_UI_BUNDLE_PEM (this service's own mTLS CLIENT
#                              key+cert, combined - used only when calling hearth-app)
#   store/node-tls.pem     <- UI_TLS_BUNDLE_PEM (this service's own HTTPS SERVER
#                              key+cert, combined - the browser/ALB hop, a separate
#                              identity from the mTLS client cert above, see server.js)
#   store/ca_javalabs.crt  <- SHARED_CA_PEM (CA trust anchor - byte-identical file
#                              to hearth-app's store/ca_javalabs.crt)
set -eu
umask 077

write_pem() { # content path
  if [ -n "$1" ] && [ -n "$2" ]; then
    mkdir -p "$(dirname "$2")"
    printf '%s\n' "$1" > "$2"
  fi
}

write_pem "${MTLS_UI_BUNDLE_PEM:-}" "store/hearth-ui.pem"
write_pem "${UI_TLS_BUNDLE_PEM:-}"  "store/node-tls.pem"
write_pem "${SHARED_CA_PEM:-}"      "store/ca_javalabs.crt"
unset MTLS_UI_BUNDLE_PEM UI_TLS_BUNDLE_PEM SHARED_CA_PEM

if [ -n "${SHARED_PKCS12_B64:-}" ]; then
  mkdir -p store
  echo "${SHARED_PKCS12_B64}" | base64 -d > store/hearth.pkcs
  chmod 600 store/hearth.pkcs
fi
unset SHARED_PKCS12_B64

exec "$@"
