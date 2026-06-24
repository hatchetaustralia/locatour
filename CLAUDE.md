@AGENTS.md

## Field testing (running the backend over a public tunnel)

To test the app away from your home Wi-Fi, the backend is exposed via a stable
ngrok tunnel over Herd. Day-to-day: `npm run tunnel` (start tunnel) and `npm run apk`
(rebuild + publish the standalone APK with the tunnel URL baked in).

See **[FIELD-TESTING.md](FIELD-TESTING.md)** for the full runbook.
