# Test-only TLS certificate

`test-sunucu.crt` and `test-sunucu.key` exist only for the HTTPS/WSS integration test in `tests/sunucu-kalicilik.test.ts`. They are self-signed for `localhost` and `127.0.0.1`.

The private key is intentionally committed so the test can perform a real TLS handshake without requiring OpenSSL at test time or disabling certificate validation. It protects no production service. Never use it for a real deployment.

Production certificates must be supplied separately with `STORYBOARD_TLS_CERT` and `STORYBOARD_TLS_KEY` and must not be committed.

To replace the test fixture:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 36500 \
  -keyout test-sunucu.key -out test-sunucu.crt \
  -subj "//CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```
