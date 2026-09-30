# Troubleshooting

## FAQ

### Requests hang, but `/v1/models` works

Set `USE_ISOLATED_HOME` to `false` in `config.json` (or `OPENCODE_USE_ISOLATED_HOME=false`) so OpenCode reuses the host login state:

```json
{
    "USE_ISOLATED_HOME": false
}
```

### Model not found (`model_not_found`)

Check the model ID against the backend:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://127.0.0.1:10000/v1/models
```

### Sent `reasoning_effort` but got no reasoning output

Use the Responses API with `stream: true`, and pass `reasoning.effort` or `reasoning_effort`.

### Client unexpectedly triggers OpenCode built-in tools

Keep `DISABLE_TOOLS` set to `true`.

### Port conflict (`EADDRINUSE`)

```bash
# Check usage
lsof -i :10000
lsof -i :10001

# Change the gateway port in config.json (restart required), or via env:
OPENCODE_PROXY_PORT=10002
OPENCODE_SERVER_PORT=10003
```

`OPENCODE_SERVER_PORT` only builds the default `OPENCODE_SERVER_URL`; if you pointed `OPENCODE_SERVER_URL` at a custom port, change it there instead.

### OpenCode not installed (`Cannot verify OpenCode installation`)

```bash
npm install -g opencode-ai
# Or curl -fsSL https://opencode.ai/install | bash
```

You can also point to the full binary path via `OPENCODE_PATH`.

### WebUI unreachable

- Confirm the gateway is running: `curl http://127.0.0.1:10000/health`.
- Check `logs/proxy.log` and `logs/proxy.err.log` for the printed URLs.
- If the port was changed, the old URL no longer works — the startup log lists the current local and LAN endpoints.

### WebUI loads, but the panels show `401`

The page itself is public, but every `/api/*` request needs a key. Click the key button in the top bar and enter an active key (created in the **Keys** tab). The key is stored in the browser's local storage under `o2a.key`.

### Config change not applied

Only `DEBUG` and API key changes take effect immediately. Everything else is written to `config.json` but loaded at boot — restart the gateway:

```bash
node start.mjs stop
node start.mjs start
```

On Windows you can restart the `start.bat` window instead. The Config tab labels each field hot / restart-required, and `POST /api/config` returns a `restartRequired` list.

### Cannot reach the gateway from another device on the LAN

`BIND_HOST` must be `0.0.0.0` (the default) — with `127.0.0.1` only the local machine can connect. It is a restart-required field. Also check the host firewall for the port, and use the LAN URL printed at startup (for example `http://192.168.2.168:10000`) rather than `127.0.0.1`.

### Key rejected (`401 Unauthorized`)

- The request must carry `Authorization: Bearer <key>` matching an active key from the **Keys** tab (or the legacy `API_KEY` in `config.json`).
- Revoke is immediate: a revoked key keeps appearing in the list but no longer authenticates.
- If you migrated the legacy key, `API_KEY` was removed from `config.json` — use the migrated key from `secrets.json`.
- With no active key anywhere, the gateway runs open and any request (or none) is accepted; a `401` then means a key was added since.

### Auth failure (`401 Unauthorized`) on `/health/details` or `/metrics`

Those endpoints require auth by default. Either send a valid Bearer key or set `HEALTH_DETAILS_REQUIRE_AUTH` / `METRICS_REQUIRE_AUTH` to `false` (restart required). When the feature itself is disabled they return `404`, not `401`.

## Debug Mode

`DEBUG` is hot — enable it in the WebUI **Config** tab, in `config.json`, or via env:

```env
OPENCODE_PROXY_DEBUG=true
```

Debug logs print detailed request and response info to `logs/proxy.log`.

## Get Help

- [GitHub Issues](https://github.com/TiaraBasori/opencode2api/issues)
