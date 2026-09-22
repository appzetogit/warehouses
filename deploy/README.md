# Deploying The Warehouses

One Linux server (Ubuntu 24.04 LTS assumed) runs everything behind nginx:

| Piece | What runs | Port |
|---|---|---|
| Frontend | static files from `Frontend/dist` (customer site, admin and seller panels) | served by nginx |
| API | `Backend/server.js`, PM2 cluster | 5000 |
| Socket.IO | `Backend/socket-server.js`, one process | 5001 |
| Scheduler | `Backend/scripts/run-scheduled-jobs.js`, exactly one process | none |
| BullMQ workers | `Backend/src/queues/workers/{order,tracking,maintenance}.worker.js` | none |
| MongoDB | replica set (a single-node one is fine) | 27017 |
| Redis | for queues, the socket adapter and caching | 6379 |

Files in this folder:

- `nginx/warehouses.conf`: the nginx site. It serves the build, proxies `/api/` and `/socket.io/`, serves `/uploads/` from disk, and sets gzip, security headers and cache rules.
- `ecosystem.config.cjs`: the PM2 process layout. This is the recommended way to run the processes.
- `systemd/*.service`: the same processes as systemd units. Use these instead of PM2, not together with it.
- `PRODUCTION_SCALING.md`: older notes on scaling.
- `nginx-hostinger-kvm2.conf.example` and `nginx-uploads.conf.example`: older configs for a separate `api.` subdomain. `nginx/warehouses.conf` replaces both.

Operating the running system (health checks, jobs, incidents, rotating secrets) is covered in [`docs/RUNBOOK.md`](../docs/RUNBOOK.md).

---

## 1. Server prerequisites

- **Node.js 24** (the version CI runs). Install it from NodeSource or with `nvm`. Don't use `curl | sh` installers on the server.
  `Frontend/package.json` still declares `"engines": { "node": "20.x" }`. On Node 24 npm only prints a warning, but the field should be updated to match.
- **MongoDB 7.0 or later, running as a replica set. This is required.** Wallet and ledger writes (`Backend/src/core/payments/transaction.service.js`, `recordTransaction`) use multi-document transactions, and a standalone `mongod` rejects them, so every wallet credit and debit would fail. The test suite also runs against a replica set (`test/helpers/db.js`).
  To set up a single-node replica set:
  ```yaml
  # /etc/mongod.conf
  net:
    bindIp: 127.0.0.1
  replication:
    replSetName: rs0
  security:
    authorization: enabled
  ```
  ```bash
  sudo systemctl restart mongod
  mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
  # then create an admin user and an app user with readWrite on the `warehouses` db
  ```
  Use `MONGO_URI=mongodb://app:<password>@127.0.0.1:27017/warehouses?replicaSet=rs0&authSource=admin`.
- **Redis 7.** Strictly speaking it's optional, but it is needed for the recommended layout. Bind it to `127.0.0.1` and set a `requirepass`. Without Redis:
  - Socket.IO can't span processes, so the API must run as a single process (see §6).
  - Dispatch and acceptance timeouts, **coin expiry** and **daily metrics aggregation** never run, because they exist only as BullMQ jobs (`src/queues/workers/maintenance.worker.js`, `order.worker.js`).
- **nginx** (1.24 or later) and **certbot** for TLS.
- **PM2** (`npm i -g pm2`) plus `pm2 install pm2-logrotate`, or use the systemd units instead.
- **MongoDB Database Tools** (`mongodump`/`mongorestore`) for backups.
- A `warehouses` system user that owns `/srv/warehouses`. Also create the uploads folder `/var/www/uploads`, owned by `warehouses`, readable by nginx and writable by the API.

---

## 2. Environment variables

The backend reads `Backend/.env` (dotenv, loaded relative to the process's working directory). The template is [`Backend/.env.example`](../Backend/.env.example). Keep the real file at `/srv/warehouses/shared/backend.env` with mode `600`, and symlink it into each release (§3).

### Required: the process will not boot without these (`src/config/validateEnv.js`)

| Variable | Notes |
|---|---|
| `MONGO_URI` (or `MONGODB_URI`) | Must point at the replica set (see §1). |
| `JWT_ACCESS_SECRET` | Long random string, for example from `openssl rand -hex 48`. |
| `JWT_REFRESH_SECRET` | A different long random string. |
| `REDIS_URL` | Required once `REDIS_ENABLED=true`. Setting `REDIS_URL` alone also turns Redis on. |
| `REDIS_ENABLED=true` | Required when `BULLMQ_ENABLED=true`. |

### Required for a correct production launch (the server boots without them, but features break)

| Variable | What happens without it |
|---|---|
| `NODE_ENV=production` | Development mode serves `/uploads` from Node and relaxes rate limits and HSTS. |
| `FIRST_ORDER_PEPPER` | First-order abuse hashes fall back to a value derived from `JWT_ACCESS_SECRET`, so rotating that secret would silently reset the guard. **Set it once and never change it.** |
| `BULLMQ_ENABLED=true` | Needed for queues (see §1). |
| `FRONTEND_URL` | The public origin, e.g. `https://example.com`. Used in share and referral links. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payments. In the Razorpay dashboard, point the webhook at `https://<domain>/api/v1/payments/webhook/razorpay` with the events `payment.captured` and `refund.processed`. |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_DEFAULT_PICKUP_PINCODE` | Without these, Shop (courier) orders use the **mock** courier. `SHIPPING_PROVIDER=mock` forces the mock even when they are set. |
| `SMS_INDIA_HUB_USERNAME`, `SMS_INDIA_HUB_API_KEY`, `SMS_INDIA_HUB_SENDER_ID`, `SMS_INDIA_HUB_DLT_TEMPLATE_ID` | Needed to send OTP SMS. |
| `OTP_SMS_TEMPLATE` | **Not in `.env.example`.** The default in the code is an old third-party template. It must match your DLT-registered template word for word, with `{otp}` as the placeholder. |
| `USE_DEFAULT_OTP=false` | `true` accepts a fixed OTP. Use it only for local testing, never in production. |
| `FIREBASE_PROJECT_ID`, and `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT` (JSON) | Push notifications. A service account saved in the admin panel takes precedence. `scripts/seed-firebase-settings.js --apply` copies the env values into the panel once. Keep the JSON file outside `/home` if you use the systemd units (`ProtectHome=true`). |
| `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) | The AI assistant. |
| `GOOGLE_MAPS_API_KEY` | Distance and routing for dispatch. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | **Not in `.env.example`.** The admin "forgot password" OTP is sent by email. |
| `SOCKET_CORS_ORIGIN` | **Not in `.env.example`.** Defaults to `*`. Set it to the public origin. |
| `BRAND_NAME`, `BRAND_SUPPORT_EMAIL`, `BRAND_NOTIFICATION_IMAGE`, `STORE_TIMEZONE` | Brand identity and the store's time zone (default `Asia/Kolkata`). |

### Optional, with defaults

`PORT` (5000), `SOCKET_PORT` (5001), `HOST`/`SOCKET_HOST` (`0.0.0.0`; set them to `127.0.0.1` so only nginx is reachable), `UPLOAD_STORAGE_ROOT` (`/var/www/uploads` in production), `UPLOAD_BASE_URL` (`/uploads`), `MAX_UPLOAD_BYTES` (50 MB; keep nginx `client_max_body_size` above it), `MAX_UPLOAD_FILES` (5), `PAYMENT_GATEWAY` (`razorpay`), `COD_ENABLED` (`true`), `JWT_ACCESS_EXPIRES` (15m), `JWT_REFRESH_EXPIRES` (7d), `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `OTP_*`, `HTTP_REQUEST_TIMEOUT_MS` (30000), `AUTO_DELIVER_AFTER_HOURS` (4), `PACKING_MINUTES` (3), `DISPATCH_RADIUS_BANDS_KM`, `DISPATCH_STALE_GPS_MS`, `PUSH_CAMPAIGNS_INLINE` (`true`), `REFERRAL_LINK_BASE_URL`, `APP_URL_SCHEME`, `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS`, `ANDROID_PLAY_STORE_URL`, `IOS_APP_STORE_URL`, `DISPLAY_TIME_ZONE`, `FCM_*_CHANNEL_ID`.
The process-role flags `SERVER_BACKGROUND_JOBS_ENABLED` and `SERVER_QUEUE_BOOTSTRAP_ENABLED` are set per process by `ecosystem.config.cjs`, so don't put them in `.env`.

### `DEPLOY_WEBHOOK_SECRET`: leave it unset

`Backend/server.js` registers `POST /api/deploy`. When `DEPLOY_WEBHOOK_SECRET` is set, a request with a valid HMAC signature makes the API run `~/deploy.sh` in a shell. When the secret is unset, the route returns 404.

This is a risky design:
- It lets the internet trigger a shell command as the API user.
- The HMAC is computed over re-serialized JSON rather than the raw body.
- An earlier hardcoded secret is still in git history.

**Leave the variable unset.** `nginx/warehouses.conf` also blocks `/api/deploy`. Deploy from CI over SSH instead (§4). Removing the route from `server.js` is a separate code change.

### Frontend build variables

The frontend reads these when it is built (`Frontend/.env.production`; the template is [`Frontend/.env.production.example`](../Frontend/.env.production.example)):
`VITE_API_BASE_URL=https://<domain>/api/v1`, `VITE_UPLOAD_BASE_URL=https://<domain>/uploads`, `VITE_BRAND_NAME`, `VITE_GOOGLE_MAPS_API_KEY`, and `VITE_FIREBASE_*` (API key, auth domain, project id, storage bucket, messaging sender id, app id, measurement id, VAPID key, database URL).
Socket.IO connects to the origin of `VITE_API_BASE_URL` at `/socket.io/`.

---

## 3. First deploy

The layout keeps the current release, earlier releases for rollback, and shared state:

```
/srv/warehouses/
  repo/                   git clone (fetch only)
  releases/<stamp>-<sha>/ one directory per deploy
  shared/backend.env      -> symlinked as Backend/.env in each release
  shared/frontend.env     -> copied to Frontend/.env.production before building
  current -> releases/... the live release (nginx root and PM2 cwd point here)
/var/www/uploads          uploaded media, shared by every release
/var/backups/warehouses   backups
```

Run the following as the `warehouses` user:

```bash
git clone https://github.com/appzetogit/warehouses.git /srv/warehouses/repo
mkdir -p /srv/warehouses/releases /srv/warehouses/shared
cp /srv/warehouses/repo/Backend/.env.example /srv/warehouses/shared/backend.env      # fill it in (§2)
cp /srv/warehouses/repo/Frontend/.env.production.example /srv/warehouses/shared/frontend.env
chmod 600 /srv/warehouses/shared/*.env
```

Then run the release steps in §4. On a first deploy, run them once without the `pm2 reload` line, and start PM2 like this:

```bash
cd /srv/warehouses/current
WAREHOUSES_BACKEND_DIR=/srv/warehouses/current/Backend pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd      # run the command it prints, as root
```

Next, set up nginx and TLS:

```bash
sudo cp /srv/warehouses/current/deploy/nginx/warehouses.conf /etc/nginx/sites-available/warehouses
# edit server_name / certificate paths / root, then:
sudo ln -s /etc/nginx/sites-available/warehouses /etc/nginx/sites-enabled/warehouses
sudo certbot certonly --nginx -d example.com -d www.example.com
sudo nginx -t && sudo systemctl reload nginx
```

Finally, seed the first admin (§5) and check that everything is up:

```bash
curl -s http://127.0.0.1:5000/health        # {"status":"UP","mongo":"connected","redis":"ok"}
curl -s http://127.0.0.1:5001/health        # {"status":"ok","service":"socket",...}
curl -s https://example.com/api/v1/health
pm2 ls                                      # all processes "online"
```

---

## 4. Updating with zero downtime

The new release is built next to the live one, so the site keeps serving while the build runs. The switch is a single symlink swap followed by a rolling reload of the API cluster.

```bash
set -euo pipefail
SHA=<commit or tag that passed CI>
REL=/srv/warehouses/releases/$(date +%Y%m%d%H%M%S)-${SHA:0:8}

git -C /srv/warehouses/repo fetch --prune origin
mkdir -p "$REL"
git -C /srv/warehouses/repo archive "$SHA" | tar -x -C "$REL"

ln -s /srv/warehouses/shared/backend.env "$REL/Backend/.env"
cp /srv/warehouses/shared/frontend.env "$REL/Frontend/.env.production"

# Install only what the committed lockfiles say. Skip install scripts (sharp and
# esbuild ship prebuilt binaries as optional dependencies).
(cd "$REL/Backend"  && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
(cd "$REL/Frontend" && npm ci --ignore-scripts --no-audit --no-fund && npm run build)

# Migrations, if this release adds any (see §5): back up, dry-run, then --apply.

ln -sfn "$REL" /srv/warehouses/current.new && mv -T /srv/warehouses/current.new /srv/warehouses/current

WAREHOUSES_BACKEND_DIR=/srv/warehouses/current/Backend \
  pm2 reload /srv/warehouses/current/deploy/ecosystem.config.cjs --update-env
curl -fsS http://127.0.0.1:5000/health

# keep the five newest releases
ls -1dt /srv/warehouses/releases/* | tail -n +6 | xargs -r rm -rf
```

What the swap and reload do:
- nginx serves the new `dist` as soon as the symlink moves. Old hashed `/assets/` files disappear with the old release, and a browser holding the old `index.html` picks up the new one on its next navigation, because `index.html` is served `no-cache`.
- `pm2 reload` restarts the API cluster one worker at a time, so requests keep being answered. The socket server, scheduler and workers are single processes and restart in about a second. Socket clients reconnect on their own.
- If `sharp` fails to load after `--ignore-scripts` (for example on an unusual CPU), run `npm rebuild sharp` in `Backend/`.

**Deploying from CI (recommended):** add a separate `deploy.yml` workflow that runs after CI passes on `main`. It should run only in a protected GitHub Environment with required reviewers. It connects over SSH with a deploy-only key (stored as an environment secret, with `known_hosts` pinned) and runs the block above with `SHA=${{ github.sha }}`. The deploy user needs no sudo. Use this instead of the `/api/deploy` webhook.

---

## 5. Database tasks

### Migrations

Scripts in `Backend/scripts/migrations/` do nothing unless you pass `--apply`. Run them from `Backend/`, so that `.env` supplies `MONGO_URI`. **Take a `mongodump` first. Restoring it is the only undo.**

They move a database from the old food-delivery app to the current schema. Run them **in this order**:

| # | Script | What it does |
|---|---|---|
| 1 | `2026-09-rename-restaurant-to-seller.mjs` | Renames "restaurant" to "seller" in collection names, fields, values and indexes. **Sellers must sign in again afterwards**, because their tokens carry the old role name. |
| 2 | `2026-09-remove-food-only-features.mjs` | Drops the dining, table-booking, gourmet, under-250, add-ons and saved-menu collections. Removes the fields for cutlery, cuisines, pure-veg stores and veg-scoped categories. |
| 3 | `2026-09-rename-food.mjs` | Removes the `food_` prefix from collections (`food_items` becomes `products`, `food_transactions` becomes `order_transactions`, `food_settings` becomes `dispatch_settings`), removes the `Food` prefix from stored model names, and changes "food" fields to "product". |
| 4 | `2026-09-rename-food-values.mjs` | Changes the bare value `'food'` to `'commerce'` in `admins.servicesAccess`, `payments.module` and `transactions.module`, and to `'product'` in `user_favorites.entityType`. |
| 5 | `2026-09-channels.mjs` | Moves products and variants to per-channel `channels`, `stock` and `lowStockThreshold` for `{quick, shop}` (see `CHANNELS_CONTRACT.md`). Existing approved sellers are approved for both channels, and everyone else gets `none`. |

```bash
cd /srv/warehouses/current/Backend
mongodump --uri="$MONGO_URI" --gzip --archive=/var/backups/warehouses/pre-migration-$(date +%F-%H%M).gz
for m in 2026-09-rename-restaurant-to-seller 2026-09-remove-food-only-features \
         2026-09-rename-food 2026-09-rename-food-values 2026-09-channels; do
  node scripts/migrations/$m.mjs            # dry run: read the counts
done
# if the counts look right, repeat the loop with --apply, one script at a time
node scripts/migrations/2026-09-rename-restaurant-to-seller.mjs --apply
# ...and so on in the same order
```

Each script is idempotent: a second run finds nothing to change. A fresh, empty database needs none of them, although running them does no harm.

Earlier one-off scripts (`npm run migrate:*` in `Backend/package.json`, and `scripts/sync-outlet-timings-from-opening-closing.js`) predate this set and aren't part of a new install.

### Seed the first admin

```bash
cd /srv/warehouses/current/Backend
# the leading space keeps the password out of shell history (with HISTCONTROL=ignorespace)
 node scripts/create-admin-by-email.cjs admin@example.com '<strong password>' 'Admin Name'
node scripts/mark-existing-admins-super.js
```

- `create-admin-by-email.cjs` creates the admin, or resets the password of an existing admin with that email. It writes directly to the collection, so it sets no `adminType`, and its `servicesAccess` uses old values (these are corrected at first login).
- `mark-existing-admins-super.js` then sets `adminType: 'super_admin'` and `isDeleted: false` on **every** admin. Run it only on a fresh install, while your admin is the only one. Later admins should be created from the panel (Admin Access → Sub Admin List).
- Sign in, then change the password from the panel.

Optional one-time step: `node scripts/seed-firebase-settings.js --apply` copies the Firebase env values into business settings.
`node scripts/seed-quick-commerce.js` loads a demo catalogue. Use it for staging only.

---

## 6. Running without Redis (small or staging servers)

1. In `.env`, set `REDIS_ENABLED=false` and `BULLMQ_ENABLED=false`, and leave `REDIS_URL` empty.
2. Run one API process with **no separate socket server**. Start `server.js` in `fork` mode with `instances: 1` and `SERVER_BACKGROUND_JOBS_ENABLED=false`, plus the scheduler. Don't start the workers.
3. In nginx, point `upstream warehouses_socket` at `127.0.0.1:5000`. The API process hosts Socket.IO itself.

What you lose is listed in §1. Note that coin expiry and daily metrics don't run in this mode.

---

## 7. Backups

The cron entry below runs as the `warehouses` user. It reads `MONGO_URI` from a root-only file that holds a backup user with the `backup` role.

```cron
# /etc/cron.d/warehouses-backup
MAILTO=ops@example.com
30 2 * * * warehouses . /etc/warehouses/backup.env && mongodump --uri="$MONGO_URI" --gzip --archive=/var/backups/warehouses/mongo-$(date +\%F).gz && find /var/backups/warehouses -name 'mongo-*.gz' -mtime +14 -delete
45 2 * * * warehouses rsync -a --delete /var/www/uploads/ /var/backups/warehouses/uploads/
```

- Copy `/var/backups/warehouses` off the server every day (object storage or another host). A backup that stays on the same disk doesn't protect against losing that disk.
- Restore with: `mongorestore --uri="$MONGO_URI" --gzip --archive=<file> --drop`.
- Test a restore on a staging server once a month.

---

## 8. Rollback

**Code only** (no migration ran):

```bash
PREV=$(ls -1dt /srv/warehouses/releases/* | sed -n 2p)
ln -sfn "$PREV" /srv/warehouses/current.new && mv -T /srv/warehouses/current.new /srv/warehouses/current
WAREHOUSES_BACKEND_DIR=/srv/warehouses/current/Backend \
  pm2 reload /srv/warehouses/current/deploy/ecosystem.config.cjs --update-env
```

**Code and data** (a migration ran with `--apply`): the migrations only go forward. To go back:
1. Put the site into maintenance: `pm2 stop all`, then serve a static page from nginx.
2. Restore the pre-migration dump with `mongorestore --drop`.
3. Switch `current` back to the previous release as above, and run `pm2 start`.

Orders placed between the dump and the restore are lost. Export them first from the admin panel or with `mongoexport`.
