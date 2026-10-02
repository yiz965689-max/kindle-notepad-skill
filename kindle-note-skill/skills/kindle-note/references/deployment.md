# Independent server deployment

The starter uses a single Node.js process with FileStore. Task PUT and device actions are serialized in that process, receipts and item changes share an atomic file write. **Do not add replicas or swap in eventually-consistent KV without redesigning concurrency.** Back up the data directory and secrets separately.

## Create files, not a live deployment

Run from the public repository:

```sh
node skills/kindle-note/scripts/create-instance.mjs /absolute/new/private-instance https://your-kindle-host.example.org
```

Use your actual hostname. The destination must be new and outside the public repository. It contains separate `backend` and `device-stage` directories plus a private browser access file. Never commit it. Tokens are randomly generated; the ADMIN token stays off Kindle. Keep `private-access.txt` private; anyone with its URL can edit this instance.

Before starting services, verify domain ownership/DNS, port availability, firewall rules, HTTPS reachability from the actual Kindle network, and that the host is appropriate for the user's location. Do not overwrite an existing reverse proxy or website. The example Compose file is for an **isolated host**. Adapt routing explicitly on a shared host.

## Isolated-host example

The generated Compose stack includes a private backend network and Caddy HTTPS proxy. Only proxy ports 80/443 are public; the backend trusts `X-Kindle-Client-IP` only because Caddy overwrites it and port 8080 is not published. This also makes network attachment persistent after recreation.

On a Linux deployment host, the backend runs as uid/gid 1000. Set ownership of `backend/data` and `backend/secrets.json` to that identity, retaining directory 700/file 600. Confirm exact paths before privileged changes. This is a required setup step, not something to solve by making secrets world-readable.

```sh
cd /absolute/new/private-instance/backend
docker compose up -d --build
```

Starting containers is an external mutation: obtain the user's deployment authorization if it was not already part of their request. Caddy needs reachable domain validation ports to provision HTTPS. Existing servers may require a different proxy arrangement.

Verify `/health` without credentials; verify `/v1/task-version` rejects unauthenticated requests and succeeds with the device credential. Do not send real reminders as a smoke test. Set `APP_ORIGIN` to the exact HTTPS origin; browser cookie writes enforce this origin.

## Dependencies and privacy

Node 22+, resvg 2.6.2 with lockfile, bundled OFL CJK font. `ipwho.is` receives the device's network IP for approximate city/timezone; Open-Meteo receives rounded coordinates for weather. IP inference can be wrong or unavailable; network restrictions can prevent these services. This baseline is not a privacy-preserving offline locator.

Use production TLS, independent credentials, backups and minimal logs. Never turn off authentication or TLS verification to fix Kindle networking. No cloud-provider account, credential, domain or infrastructure from the original author is included.

## Development tests

Copy/generate an instance, then run `npm ci && npm test` in its backend directory. This installs native dependencies appropriate to the development OS. Docker builds install its Linux dependencies separately; do not copy macOS node_modules into a Linux image.
