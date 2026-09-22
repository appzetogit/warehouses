# Operations runbook

For whoever keeps production running. Installation, updates, migrations, backups and rollback are covered in [`deploy/README.md`](../deploy/README.md). Process names below are the PM2 names from `deploy/ecosystem.config.cjs`. With the systemd units, use `systemctl status warehouses-<name>` and `journalctl -u warehouses-<name>` instead.

---

## 1. Health checks

| Check | Command | Healthy |
|---|---|---|
| API and its dependencies | `curl -s http://127.0.0.1:5000/health` | `{"status":"UP","mongo":"connected","redis":"ok"}`. `redis` reads `disabled` when Redis is off by design. |
| API through nginx | `curl -s https://<domain>/api/v1/health` | `{"status":"UP",...}` |
| API readiness | `curl -s http://127.0.0.1:5000/ready` | `{"status":"ready"}` |
| Socket server | `curl -s http://127.0.0.1:5001/health` | `{"status":"ok","service":"socket",...}` |
| Processes | `pm2 ls` | all `online`, restart count not climbing |
| Queues | `GET /api/v1/admin/queues` with an admin token | `failed` not growing, `waiting` draining |
| MongoDB | `mongosh "$MONGO_URI" --eval 'rs.status().ok'` | `1`, and the member is `PRIMARY` |
| Redis | `redis-cli -a "$REDIS_PASSWORD" ping` | `PONG` |
| Disk | `df -h / /var/www/uploads /var/backups` | under 80% |

Point an external uptime monitor at `https://<domain>/health` (nginx passes it to the API without rate limiting). Alert on anything other than HTTP 200 with `"mongo":"connected"`.

`/health` answers from every API process. It checks the process's own Mongo and Redis connections and nothing else. It doesn't check the scheduler or the workers, so watch those in `pm2 ls` or in the logs.

---

## 2. Logs

Every process logs to stdout and stderr (`Backend/src/utils/logger.js`). Lines start with `[INFO]`, `[WARN]` or `[ERROR]`, followed by the local time. There is no date and no JSON.

- PM2 writes them to `~/.pm2/logs/<name>-out.log` and `<name>-error.log`. `time: true` in the ecosystem file adds a full timestamp.
  - `pm2 logs warehouses-api --lines 200` shows recent output.
  - `pm2 logs warehouses-scheduler --err` shows errors only.
  - Install `pm2-logrotate` (deploy/README.md §1) or the disk fills up.
- HTTP access logs: nginx writes `/var/log/nginx/access.log` and `error.log`. The API also logs each request (morgan) and response times under `/api`.
- Each request carries an ID (`requestId` middleware). nginx forwards `X-Request-Id`, so you can grep one request across nginx and the API.

Useful greps:
```bash
grep -h "CRITICAL" ~/.pm2/logs/warehouses-api-*.log         # paid order could not be released, etc.
grep -h "Webhook" ~/.pm2/logs/warehouses-api-out*.log        # Razorpay webhook activity
grep -h "Watchdog\|Auto-closed" ~/.pm2/logs/warehouses-scheduler-*.log
grep -h "BullMQ:maintenance" ~/.pm2/logs/warehouses-worker-maintenance-*.log
```

---

## 3. Background processes and scheduled jobs

### 3.1 `warehouses-scheduler` (`Backend/scripts/run-scheduled-jobs.js`)

Run **exactly one** instance. It doesn't need Redis. Every job below also runs once when the process starts.

| Job | Every | What it does |
|---|---|---|
| Offer expiry (`expireExpiredOffers`) | 5 min | Sets active offers or coupons whose `endDate` has passed to `inactive`. |
| FSSAI expiry sync (`syncExpiredFssaiNotifications`) | 1 h | Finds sellers whose FSSAI licence has expired and sends them a notification. |
| Seller subscription billing (`runBillingCatchUp`) | 6 h | Invoices every closed calendar month that hasn't been invoiced yet. It is idempotent and catches up on months missed while the process was down. |
| Auto-deliver sweep (`autoDeliverStaleOrders`) | 15 min | Closes Quick orders that were picked up but not marked delivered after `AUTO_DELIVER_AFTER_HOURS` (default 4). It only touches `picked_up` and `reached_drop` orders. Each one is logged as `Auto-closed ...`. |
| Stuck-order watchdog (`recoverStuckOrders`) | 2 min | Re-dispatches orders assigned to a rider who didn't accept within 2 min, clears dispatch locks older than 5 min, and fixes other half-finished dispatch states. |
| Push campaigns (`processDueCampaigns`) | 1 min | Sends marketing push campaigns that are due, in throttled batches. It is idempotent per run, so it overlaps safely with the BullMQ tick. |
| Recommendations (`buildCoPurchaseRecommendations`) | 24 h | Rebuilds the "Frequently bought together" pairs from the last 90 days of orders. |

### 3.2 BullMQ workers (need `REDIS_ENABLED=true` and `BULLMQ_ENABLED=true`)

| Process | Queue | Jobs |
|---|---|---|
| `warehouses-worker-maintenance` | `maintenance` | Repeatable jobs registered when the worker starts (times are server time): **MONTHLY_SUBSCRIPTION_BILLING** at 00:30 on the 1st; **FSSAI_EXPIRY_CHECK** at 04:00 daily; **COIN_EXPIRY_CHECK** at 00:00 daily, which expires due coin lots and notifies users whose coins expire soon; **DAILY_METRICS_AGGREGATION** at 00:05 daily, which rolls up yesterday's metrics for reports; **PRODUCT_RECOMMENDATIONS_BUILD** at 02:30; **PUSH_CAMPAIGN_TICK** every minute, plus a tick enqueued whenever an admin schedules a campaign. |
| `warehouses-worker-order` | `order` | **DISPATCH_TIMEOUT_CHECK**: moves an order on to the next rider when the offered rider doesn't respond. **ORDER_ACCEPTANCE_TIMEOUT_CHECK**: expires an order the seller didn't accept in time. |
| `warehouses-worker-tracking` | `tracking` | **sync-hot-locations**: copies riders' latest GPS from Redis to MongoDB. |

`otp`, `notification` and `payment` queues and workers exist in the code, but nothing enqueues to them. The otp and notification processors are placeholders, and wallet settlement runs inline. They are deliberately not started.

**Only the maintenance worker runs coin expiry and daily metrics.** If it is down or Redis is off, coins don't expire and the daily metric roll-ups stop. An admin can re-run the metrics for a date with `POST /api/v1/admin/analytics/daily-metrics/aggregate`. To re-run coin expiry, restart the maintenance worker. The job doesn't run on start, so enqueue it by hand if needed:
`node -e "import('bullmq').then(async ({Queue})=>{const q=new Queue('maintenance',{connection:{url:process.env.REDIS_URL}});await q.add('COIN_EXPIRY_CHECK',{type:'COIN_EXPIRY_CHECK'});await q.close()})"`
Run this from `Backend/` with `.env` loaded, for example `set -a; . ./.env; set +a`.

Jobs retry 3 times with exponential backoff. Completed jobs are kept (last 1000), and failed jobs are kept for 24 h.

### 3.3 Checks the API does as a side effect

Two cleanups run as a side effect of normal traffic, at most once a minute each, and not on a timer:
- **Online orders never paid**: orders stuck in `pending_payment` with payment `created`, `pending` or `failed` for more than 30 min are deleted. Their reserved stock and coins are released. This runs when the customer order list or the admin order list is loaded.
- **Orders the seller never accepted** are expired when the order lists load, in addition to the BullMQ timeout.

---

## 4. Common incidents

### 4.1 Payment captured, order still "pending payment" (or missing)

The normal path: the checkout page calls `POST /orders/verify-payment` (or `/orders/checkout/:checkoutId/verify-payment` for a split checkout). Razorpay then sends `payment.captured` to `POST /api/v1/payments/webhook/razorpay`. That webhook moves the order live **even if the browser never came back**.

1. Find the Razorpay order or payment ID in the Razorpay dashboard. Then search the logs:
   `grep -h "<rzp_order_id>\|<pay_id>" ~/.pm2/logs/warehouses-api-*.log`
2. What the log lines mean:
   - `Signature verification failed`: `RAZORPAY_WEBHOOK_SECRET` doesn't match the dashboard. Fix it (§5) and ask Razorpay to resend the webhook from the dashboard.
   - `AMOUNT MISMATCH ... Order NOT marked paid`: the amount captured differs from the order total. Refund the customer in the Razorpay dashboard. Don't release the order by hand.
   - `[CRITICAL] Webhook could not release paid order`: the payment was recorded, but taking the order live failed. Read the error. Usually a seller or product is no longer available. Cancel the order and refund it from the admin panel.
   - No webhook line at all: check the webhook URL and the events (`payment.captured`, `refund.processed`) in the Razorpay dashboard, and check the nginx access log for `POST /api/v1/payments/webhook/razorpay`.
3. **Act within 30 minutes.** After that, the pending-payment cleanup (§3.3) deletes an unpaid-looking order. If the money was captured after that, refund it in Razorpay. Its stock has already been released.
4. Every day or week, open **Admin → Payment Reconciliation** (`/admin/payments/reconciliation`; API `GET /admin/reports/payments/reconciliation?from=&to=`). It checks each online-paid order or checkout against the gateway and flags `amount_mismatch`, `not_captured`, `missing_payment_id` or `gateway_error`. Work through anything that isn't `ok`.

### 4.2 Stock mismatch

Stock is kept **per channel** (`stock.quick`, `stock.shop`, and per variant). A `null` count means that channel isn't counted. See `CHANNELS_CONTRACT.md`.

- Reservation happens when an order is placed: a conditional decrement, so two orders can't oversell. Stock comes back once per order when it dies (cancellation, acceptance timeout, deletion of an unpaid order, RTO received). `stockRestoredAt` makes a second restock a no-op.
- **Too low:** look for orders stuck in `pending_payment` (they hold stock until the 30-min cleanup) and for RTO shipments that were never marked received (Admin → RTO Queue → *Receive*). Receiving one restocks the order's channel once.
- **Too high:** a manual edit or a duplicate import. Check the product's edit history in the panel.
- **Fix:** the seller corrects the count in the seller panel (inventory or low-stock screen, `PATCH /seller/products/stock`), or an admin edits the product. Correct the channel that is wrong and leave the other alone.
- **Check the stock logic against a real database** (for example after an upgrade): `node scripts/stock-integration-check.js` from `Backend/`. It uses throwaway products and orders and cleans up after itself.

### 4.3 Courier (Shop order) failures

- **Booking fails** (Admin → Courier Shipments → *Book*): the error comes from Shiprocket. Common causes:
  - Wrong `SHIPROCKET_EMAIL` or `SHIPROCKET_PASSWORD`. It must be an API user created in the Shiprocket panel.
  - A pickup location nickname that doesn't match `SHIPROCKET_PICKUP_LOCATION`.
  - A pincode that isn't serviceable.
  - Missing package weight or dimensions.

  Fix the cause and book again. **If Shiprocket variables are missing, the mock courier is used silently.** If AWBs look fake (mock), check `.env` and restart the API.
- **Statuses aren't moving:** there is no courier webhook and no scheduled poll. The status, NDR and RTO data refresh only when someone opens tracking (Admin → Courier Shipments → *Track*, or the seller's track button). A tracking read of `delivered` also marks the order delivered. Until a poll job exists, have the operations team open tracking for all active shipments at least once a day.
- **NDR** (failed delivery attempt): Admin → NDR Queue. Choose *Re-attempt* (optionally with a corrected address or phone), *RTO*, or *Contact*. The action goes to Shiprocket.
- **RTO** (parcel coming back): Admin → RTO Queue. When the seller confirms the parcel is back, choose *Receive*. This restocks once, cancels the order and refunds a prepaid order once. It is safe to repeat.
- **COD remittance:** upload the courier's remittance CSV in Admin → COD Remittances. Deliveries that the courier hasn't remitted show as "outstanding".

### 4.4 Push notifications failing

1. Check which credentials are in use. Push uses the Firebase service account from **Admin → Business Setup** (Firebase section) if one is saved there, otherwise `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT` from the environment. After changing the one in the panel, restart the API processes (`pm2 reload warehouses-api`) to be certain they all use it.
2. Send yourself a test: `POST /api/v1/fcm-tokens/test` while logged in (the panel's test button) sends to your own devices. `GET /api/v1/fcm-tokens/check` reports whether the service is configured.
3. Errors in the logs:
   - `401`/`403` from FCM: a wrong or revoked service account, or one from a different Firebase project than the web app's `VITE_FIREBASE_PROJECT_ID`.
   - "unregistered" or "invalid argument" for a token: a stale device token. These tokens are pruned automatically, so no action is needed.
   - `429`/`5xx`: transient. Each send is retried 3 times.
4. Web push also needs `VITE_FIREBASE_VAPID_KEY` at build time, and `/firebase-messaging-sw.js` served from the site root (nginx serves it `no-cache`).
5. **Campaigns stuck in "scheduled":** the sender runs every minute in the scheduler and in the maintenance worker. Check that both are online. Also check campaign settings: quiet hours and throttle can delay sends on purpose. A paused campaign stays paused until resumed.

### 4.5 Other quick checks

- **502 from nginx:** the API is down or restarting. Check `pm2 ls` and `pm2 logs warehouses-api --err`. A process exits on an unhandled rejection in production, and PM2 restarts it. Look for the error just before the restart.
- **Sockets not updating (seller not hearing new orders, rider map frozen):** check that `warehouses-socket` is online and that Redis is up. The API cluster reaches socket clients only through the Redis adapter. Look for `Socket.IO Redis adapter attached` in the socket and API logs.
- **Riders not getting orders:** check the stuck-order watchdog lines in the scheduler log, and check that riders are online with fresh GPS. Positions older than `DISPATCH_STALE_GPS_MS` are skipped.
- **OTP SMS not arriving:** the text must match the DLT template exactly (`OTP_SMS_TEMPLATE`). Check the SMS India Hub balance. Never "fix" this by setting `USE_DEFAULT_OTP=true` in production.
- **Mongo "Transaction numbers are only allowed on a replica set member"** in the logs: someone pointed `MONGO_URI` at a standalone server. Wallet writes fail until it points at the replica set.

---

## 5. Rotating secrets

Edit `/srv/warehouses/shared/backend.env`, then reload: `pm2 reload deploy/ecosystem.config.cjs --update-env`. The API reload is rolling, and the other processes restart. Rotate on a schedule and immediately after anyone with access leaves.

| Secret | How | Side effects |
|---|---|---|
| `JWT_ACCESS_SECRET` | New random value, reload. | Access tokens (15 min) stop working, and apps refresh them transparently. **If `FIRST_ORDER_PEPPER` is unset, this also resets the first-order guard, so set the pepper first.** |
| `JWT_REFRESH_SECRET` | New random value, reload. | Everyone (customers, sellers, riders, admins) has to sign in again. |
| `FIRST_ORDER_PEPPER` | **Don't rotate.** | Every stored first-order hash becomes useless, so past users could claim the first-order offer again. Only rotate it after a leak, and accept that consequence. |
| `RAZORPAY_KEY_SECRET` / `RAZORPAY_KEY_ID` | Generate new keys in Razorpay, update both, reload. | Checkouts in progress may fail, so do it at a quiet time. |
| `RAZORPAY_WEBHOOK_SECRET` | Change it in the Razorpay webhook settings **and** in `.env` at the same moment, then reload. | Webhooks that arrive between the two changes fail the signature check. Resend them from the dashboard. |
| Firebase service account | Create a new key in Google Cloud → IAM → service accounts. Save it in Admin → Business Setup or replace the file. Reload. **Delete the old key** in Google Cloud. | None. |
| `SHIPROCKET_PASSWORD` | Change it in Shiprocket, update `.env`, reload. | None. |
| `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, SMS API key | Create a new key in the provider console, update it, reload, then revoke the old key. | Maps keys should be restricted by HTTP referrer (frontend) or IP (backend). |
| `EMAIL_PASS` | Change the SMTP app password, update it, reload. | None. |
| MongoDB / Redis passwords | Change the password in Mongo (`db.changeUserPassword`) or Redis (`requirepass` / ACL). Update `MONGO_URI` or `REDIS_URL`, reload, and update `/etc/warehouses/backup.env`. | A short reconnect. |
| `DEPLOY_WEBHOOK_SECRET` | Keep it unset (see `deploy/README.md`). | None. |

Frontend `VITE_*` values are compiled into the bundle and are public by nature. To change one, edit `/srv/warehouses/shared/frontend.env` and deploy a new release.

If a secret was committed to git, rotate it. Removing it from history doesn't help, because it is already in every clone. CI fails the build if a `.env` file is committed.
