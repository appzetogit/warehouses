# Checkout load test

`checkout-load.mjs` puts the order path under concurrent load and says whether
it would carry the 10,000 orders/day target.

What it runs, all at once, for `--duration` seconds (after a short warm-up
that is not counted):

- **Customers** (`--users`, default 50): each one loops browse
  (`GET /catalog/products?fulfilmentMode=quick`) -> quote
  (`POST /orders/checkout/calculate`) -> place a cash Quick order
  (`POST /orders/checkout`). About a quarter of carts span two stores, so the
  split checkout is exercised too. No think time unless `--think <ms>`.
- **Stores** (`--sellers`, default 3): each polls `GET /seller/orders` every
  2s and takes new orders to ready for pickup (three `PATCH .../status` calls),
  which kicks off rider dispatch.
- **Riders** (`--riders`, default 5): each polls
  `GET /delivery/orders/available` every 2s, as the rider app does.

It prints, per endpoint: requests, req/s, p50/p95/p99/max latency (ms) and
errors by status; then checkout throughput and the orders/day it implies,
compared with the target both as round-the-clock capacity and as peak-hour
headroom (by default the busiest hour carries 12% of a day's orders:
10,000 x 0.12 / 3600 = 0.33 orders/s).

Plain Node 18+ (`fetch`, `AbortController`); nothing to install.

## Quick check, no server needed

```sh
cd Backend
node scripts/load/checkout-load.mjs --local --users 10 --duration 20
```

`--local` starts the app inside the script on a random port over an
in-memory MongoDB (the same harness the e2e tests use, from
`mongodb-memory-server` in devDependencies), with the rate limiter off and the
server's request logging silenced. Everything is thrown away at the end. The
client and the server share one process and one CPU core, so treat the numbers
as a floor and a regression check, not as production capacity.

## Against a running backend

```sh
cd Backend
JWT_ACCESS_SECRET=<the server's secret> \
node scripts/load/checkout-load.mjs \
  --url http://localhost:5000 \
  --mongo-uri "mongodb://localhost:27017/<the server's db>" \
  --users 50 --duration 60
```

- Zone, stores and products are created **through the API**, as a seller and
  the admin would (register, approve account and channels, list products,
  approve products).
- The admin account, customers and riders have no create API (they sign in
  by OTP), so they are written straight to `--mongo-uri`, and the script signs
  their tokens with `JWT_ACCESS_SECRET`, which must be the server's.
- Everything it writes is tagged: `loadRun: '<id>'` on admins, users and
  delivery_partners, and the id in the zone, store and product names. The id is
  printed at the start and the end. **Point it at a staging or local database,
  never production** - it places real orders.
- The server's rate limiter counts every request from your machine as one
  client. Run the server with `RATE_LIMIT_ENABLED=false` (or a high
  `RATE_LIMIT_MAX`) or you will mostly measure 429s.
- Redis, the queue workers and the socket server are whatever that deployment
  runs; the result reflects that setup.

## Options

| Option | Default | |
|---|---|---|
| `--local` | off | boot the app in-process over in-memory Mongo |
| `--url` / `LOAD_URL` | | running backend (without `/api/v1`) |
| `--mongo-uri` / `MONGO_URI` | | remote mode: where to write admin/customers/riders |
| `--users` | 50 | concurrent customers |
| `--duration` | 60 | seconds measured |
| `--sellers` | 3 | stores seeded |
| `--products` | 8 | products per store |
| `--riders` | 5 | riders polling |
| `--think` | 0 | ms pause between a customer's steps |
| `--timeout` | 15000 | per-request timeout, ms (counted as `timeout` errors) |
| `--target` | 10000 | orders/day target |
| `--peak-share` | 0.12 | share of the day's orders in the busiest hour |

Every option can also be given as `LOAD_<NAME>` (e.g. `LOAD_USERS=100`).

## Reading the result

- `POST /orders/checkout` is the one that matters: it reserves stock, writes
  the checkout and one order per store, and prices again. Its p95 is what a
  customer waits on the pay button.
- Errors are grouped by HTTP status (`timeout` / `network` for no response).
  Any 5xx is a bug; 400s under load usually mean stock or pricing races.
- Stock is seeded deep (1,000,000 per product) so the run measures ordering
  rather than selling out, but every customer still hits the same few product
  documents, which is the contended case.
