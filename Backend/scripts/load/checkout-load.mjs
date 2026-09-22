#!/usr/bin/env node
/**
 * Checkout load test: N concurrent customers browse -> quote -> place a cash
 * Quick order, while sellers accept orders and riders poll for offers.
 *
 * Plain Node (fetch + AbortController), no extra packages. See README.md.
 *
 *   node scripts/load/checkout-load.mjs --local --users 10 --duration 20
 *   node scripts/load/checkout-load.mjs --url http://localhost:5000 --mongo-uri mongodb://... --users 50 --duration 60
 *
 * --local boots the app in this process on a random port over an in-memory
 * Mongo (the e2e test harness). Otherwise it targets --url / LOAD_URL and
 * seeds through the API; the accounts that have no API (admin, customers,
 * riders: they sign in by OTP) are written with --mongo-uri / MONGO_URI and
 * signed in with JWT_ACCESS_SECRET, which must match the server's.
 */
import crypto from 'node:crypto';

// ---- options -------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
    const env = process.env[`LOAD_${name.toUpperCase().replace(/-/g, '_')}`];
    return env ?? fallback;
};
if (flag('help')) {
    console.log(`Options:
  --local                 boot the app in-process over an in-memory Mongo
  --url <base>            running backend, e.g. http://localhost:5000 (env LOAD_URL)
  --mongo-uri <uri>       remote mode: Mongo to write admin/customers/riders into (env MONGO_URI)
  --users <n>             concurrent customers (default 50)
  --duration <s>          seconds of load (default 60)
  --sellers <n>           stores to seed (default 3)
  --products <n>          products per store (default 8)
  --riders <n>            riders polling for offers (default 5)
  --think <ms>            pause between a customer's steps (default 0)
  --timeout <ms>          per-request timeout (default 15000)
  --target <orders/day>   capacity target (default 10000)
  --peak-share <0..1>     share of a day's orders in the busiest hour (default 0.12)`);
    process.exit(0);
}
const LOCAL = flag('local');
const USERS = Number(opt('users', 50));
const DURATION_S = Number(opt('duration', 60));
const SELLERS = Number(opt('sellers', 3));
const PRODUCTS = Number(opt('products', 8));
const RIDERS = Number(opt('riders', 5));
const THINK_MS = Number(opt('think', 0));
const TIMEOUT_MS = Number(opt('timeout', 15000));
const TARGET_PER_DAY = Number(opt('target', 10000));
const PEAK_SHARE = Number(opt('peak-share', 0.12));
const RUN = crypto.randomBytes(3).toString('hex');

// ---- the app under test ----------------------------------------------------------

let base;
let db; // mongodb Db for the accounts with no API
let shutdown = async () => {};
let jwtSecret;

const realConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const writeOut = process.stdout.write.bind(process.stdout);
const out = (...a) => writeOut(`${a.join(' ')}\n`);

if (LOCAL) {
    // The server's own per-request logging would drown the report and cost the
    // run more than the work being measured; the rate limiter would turn a
    // load test from one address into 429s.
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.SHIPPING_PROVIDER = 'mock';
    process.env.JWT_ACCESS_SECRET ||= 'load-access-secret';
    process.env.JWT_REFRESH_SECRET ||= 'load-refresh-secret';
    for (const k of ['log', 'warn', 'error', 'info']) console[k] = () => {};
    process.stdout.write = () => true; // morgan writes here directly
    process.stderr.write = () => true;
    const harness = await import('../../test/e2e/lib/harness.js');
    db = await harness.startApp();
    base = harness.baseUrl();
    shutdown = harness.stopApp;
    jwtSecret = process.env.JWT_ACCESS_SECRET;
} else {
    const url = opt('url', process.env.LOAD_URL);
    const mongoUri = opt('mongo-uri', process.env.MONGO_URI);
    jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!url || !mongoUri || !jwtSecret) {
        out('Remote mode needs --url, --mongo-uri (or MONGO_URI) and JWT_ACCESS_SECRET. Or pass --local.');
        process.exit(2);
    }
    base = `${url.replace(/\/+$/, '')}/api/v1`;
    const { default: mongoose } = await import('mongoose');
    await mongoose.connect(mongoUri);
    db = mongoose.connection.db;
    shutdown = () => mongoose.disconnect();
}

const { default: jwt } = await import('jsonwebtoken');
const { default: mongoose } = await import('mongoose');
const sign = (role, id, extra = {}) => jwt.sign({ userId: String(id), role, ...extra }, jwtSecret, { expiresIn: '6h' });

// ---- measuring -----------------------------------------------------------------

const stats = new Map(); // label -> { ms: [], errors: Map(status -> n) }
const statFor = (label) => {
    if (!stats.has(label)) stats.set(label, { ms: [], ok: 0, errors: new Map() });
    return stats.get(label);
};
let measuring = false;

async function http(method, path, { as, body, label, expect = [200, 201], headers = {} } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = performance.now();
    let status = 0;
    let json = null;
    try {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(as ? { authorization: `Bearer ${as}` } : {}), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: ctrl.signal,
        });
        status = res.status;
        json = await res.json().catch(() => null);
    } catch (err) {
        status = err?.name === 'AbortError' ? 'timeout' : 'network';
    } finally {
        clearTimeout(timer);
    }
    const ms = performance.now() - t0;
    if (label && measuring) {
        const s = statFor(label);
        s.ms.push(ms);
        if (expect.includes(status)) s.ok += 1;
        else s.errors.set(status, (s.errors.get(status) || 0) + 1);
    }
    return { status, body: json, ok: expect.includes(status) };
}

function must(res, what) {
    if (!res.ok) throw new Error(`${what}: ${res.status} ${JSON.stringify(res.body)?.slice(0, 300)}`);
    return res.body?.data;
}

// ---- seeding ---------------------------------------------------------------------

const ZONE = [
    { latitude: 12.90, longitude: 77.55 }, { latitude: 12.90, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.65 }, { latitude: 13.00, longitude: 77.55 },
];
const STORE_AT = { lat: 12.9716, lng: 77.5946 };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let phoneSeq = 0;
// Two-digit prefix, three digits of the run id, a five-digit sequence: unique per run.
const phone = (prefix) => `${prefix}${String(parseInt(RUN, 16) % 1000).padStart(3, '0')}${String(++phoneSeq % 100000).padStart(5, '0')}`;

async function seed() {
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: `load_${RUN}@example.com`, role: 'ADMIN', adminType: 'super_admin', isActive: true, loadRun: RUN });
    const admin = sign('ADMIN', adminId, { adminType: 'super_admin' });

    const zoneRes = must(await http('POST', '/admin/zones', { as: admin, body: { name: `Load Zone ${RUN}`, coordinates: ZONE, isActive: true } }), 'zone');
    const zoneId = (zoneRes.zone || zoneRes)._id;

    const sellers = [];
    for (let s = 0; s < SELLERS; s++) {
        const at = { lat: STORE_AT.lat + rand(-0.01, 0.01), lng: STORE_AT.lng + rand(-0.01, 0.01) };
        const reg = must(await http('POST', '/seller/register', {
            body: {
                sellerName: `Load Store ${RUN}-${s}`, ownerName: 'Load Owner', ownerPhone: phone('95'),
                channels: 'quick,shop', zoneId: String(zoneId), pincode: '560001', addressLine1: 'MG Road', city: 'Bengaluru', state: 'KA',
                latitude: String(at.lat), longitude: String(at.lng),
            },
        }), 'register seller');
        must(await http('PATCH', `/admin/sellers/${reg._id}/approve`, { as: admin, body: {} }), 'approve seller');
        for (const c of ['quick', 'shop']) must(await http('PATCH', `/admin/sellers/${reg._id}/channels/${c}`, { as: admin, body: { action: 'approve' } }), `approve ${c}`);
        const token = sign('SELLER', reg._id);
        const products = [];
        for (let p = 0; p < PRODUCTS; p++) {
            const price = 50 * Math.ceil(rand(2, 30));
            const created = must(await http('POST', '/seller/products', {
                as: token,
                // Deep stock so the run measures ordering, not selling out; the
                // same few documents are still contended like a hot catalogue.
                body: { name: `Load Item ${RUN}-${s}-${p}`, price, channels: { quick: true, shop: true }, stock: { quick: 1_000_000, shop: 1_000_000 } },
            }), 'create product').product;
            must(await http('PATCH', `/admin/products/${created._id}/approve`, { as: admin, body: {} }), 'approve product');
            products.push({ id: String(created._id), price, name: created.name });
        }
        sellers.push({ id: String(reg._id), token, products });
    }

    const customers = [];
    const userDocs = [];
    for (let u = 0; u < USERS; u++) {
        const id = new mongoose.Types.ObjectId();
        userDocs.push({ _id: id, name: `Load Customer ${u}`, phone: phone('97'), role: 'USER', isActive: true, status: 'active', createdAt: new Date(), loadRun: RUN });
        customers.push({ id: String(id), token: sign('USER', id) });
    }
    if (userDocs.length) await db.collection('users').insertMany(userDocs);

    const riders = [];
    for (let r = 0; r < RIDERS; r++) {
        const id = new mongoose.Types.ObjectId();
        const lat = STORE_AT.lat + rand(-0.005, 0.005);
        const lng = STORE_AT.lng + rand(-0.005, 0.005);
        await db.collection('delivery_partners').insertOne({
            _id: id, name: `Load Rider ${r}`, phone: phone('96'), status: 'approved', availabilityStatus: 'online', isActive: true,
            lastLat: lat, lastLng: lng, lastLocationAt: new Date(), lastLocation: { type: 'Point', coordinates: [lng, lat] },
            createdAt: new Date(), updatedAt: new Date(), loadRun: RUN,
        });
        riders.push({ id: String(id), token: sign('DELIVERY_PARTNER', id) });
    }
    return { admin, zoneId, sellers, customers, riders };
}

// ---- the actors -------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stopAt = 0;
const running = () => Date.now() < stopAt;
const counters = { journeys: 0, orders: 0, childOrders: 0, failedJourneys: 0, accepted: 0, offersSeen: 0 };

function customerAddress() {
    const lat = rand(12.92, 12.98);
    const lng = rand(77.57, 77.63);
    return { label: 'Home', street: '1 Load Road', city: 'Bengaluru', state: 'KA', zipCode: '560001', phone: phone('98'),
        latitude: lat, longitude: lng, location: { type: 'Point', coordinates: [lng, lat] } };
}

async function customerLoop(customer, world) {
    const address = customerAddress();
    while (running()) {
        try {
            const browse = await http('GET', '/catalog/products?fulfilmentMode=quick&limit=20', { label: 'GET /catalog/products' });
            if (!browse.ok) throw new Error('browse');
            if (THINK_MS) await sleep(THINK_MS);

            // A cart of 1-3 lines, from one store or (sometimes) two.
            const stores = Math.random() < 0.25 && world.sellers.length > 1 ? 2 : 1;
            const chosen = [...world.sellers].sort(() => Math.random() - 0.5).slice(0, stores);
            const items = chosen.flatMap((s) => Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => pick(s.products))
                .map((p) => ({ itemId: p.id, sellerId: s.id, name: p.name, price: p.price, quantity: 1 + Math.floor(Math.random() * 2) })));
            const body = { items, deliveryAddress: address, fulfilmentMode: 'quick' };

            const quote = await http('POST', '/orders/checkout/calculate', { as: customer.token, body, label: 'POST /orders/checkout/calculate' });
            if (!quote.ok) throw new Error('quote');
            if (THINK_MS) await sleep(THINK_MS);

            const placed = await http('POST', '/orders/checkout', {
                as: customer.token, body: { ...body, paymentMethod: 'cash' }, label: 'POST /orders/checkout', expect: [201],
            });
            if (!placed.ok) throw new Error('order');
            counters.orders += measuring ? 1 : 0;
            counters.childOrders += measuring ? (placed.body?.data?.childOrders?.length || 1) : 0;
            counters.journeys += measuring ? 1 : 0;
        } catch {
            if (measuring) counters.failedJourneys += 1;
            await sleep(200);
        }
        if (THINK_MS) await sleep(THINK_MS);
    }
}

/** A store's tablet: polls for new orders and accepts them, taking each to ready for pickup. */
async function sellerLoop(seller) {
    while (running()) {
        const res = await http('GET', '/seller/orders?status=created&limit=50', { as: seller.token, label: 'GET /seller/orders (poll)' });
        const data = res.body?.data || {};
        const orders = data.orders || data.data || data.items || (Array.isArray(data) ? data : []);
        for (const o of orders) {
            if (!running()) break;
            let okAll = true;
            for (const orderStatus of ['confirmed', 'preparing', 'ready_for_pickup']) {
                const r = await http('PATCH', `/seller/orders/${o._id || o.id}/status`, { as: seller.token, body: { orderStatus }, label: 'PATCH /seller/orders/:id/status' });
                if (!r.ok) { okAll = false; break; }
            }
            if (okAll && measuring) counters.accepted += 1;
        }
        await sleep(2000);
    }
}

/** A rider's app: polls the offers it can take. */
async function riderLoop(rider) {
    while (running()) {
        const res = await http('GET', '/delivery/orders/available', { as: rider.token, label: 'GET /delivery/orders/available (poll)' });
        const list = res.body?.data?.data;
        if (Array.isArray(list) && measuring) counters.offersSeen += list.length;
        await sleep(2000);
    }
}

// ---- report ----------------------------------------------------------------------

function pct(sorted, p) {
    if (!sorted.length) return 0;
    const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, i)];
}

function report(seconds) {
    const rows = [];
    let total = 0;
    let errors = 0;
    for (const [label, s] of stats) {
        const sorted = [...s.ms].sort((a, b) => a - b);
        const errs = [...s.errors.values()].reduce((a, b) => a + b, 0);
        total += s.ms.length;
        errors += errs;
        rows.push({
            endpoint: label,
            requests: s.ms.length,
            'req/s': (s.ms.length / seconds).toFixed(1),
            p50: pct(sorted, 50).toFixed(0),
            p95: pct(sorted, 95).toFixed(0),
            p99: pct(sorted, 99).toFixed(0),
            max: (sorted.at(-1) || 0).toFixed(0),
            errors: errs ? [...s.errors].map(([k, v]) => `${k}x${v}`).join(' ') : '0',
        });
    }
    const w = (s, n) => String(s).padEnd(n);
    const cols = ['endpoint', 'requests', 'req/s', 'p50', 'p95', 'p99', 'max', 'errors'];
    const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)) + 2);
    out('');
    out(`Latency per endpoint (ms), ${seconds.toFixed(0)}s, ${USERS} customers, ${SELLERS} stores, ${RIDERS} riders:`);
    out(cols.map((c, i) => w(c, widths[i])).join(''));
    for (const r of rows) out(cols.map((c, i) => w(r[c], widths[i])).join(''));

    const perSec = counters.orders / seconds;
    const perDay = perSec * 86400;
    const peakNeed = (TARGET_PER_DAY * PEAK_SHARE) / 3600;
    out('');
    out(`Requests: ${total} (${(total / seconds).toFixed(1)}/s), errors: ${errors}`);
    out(`Checkouts placed: ${counters.orders} (${counters.childOrders} store orders), failed journeys: ${counters.failedJourneys}`);
    out(`Orders accepted by stores: ${counters.accepted}; offers seen by riders (sum over polls): ${counters.offersSeen}`);
    out(`Checkout throughput: ${perSec.toFixed(2)} orders/s`);
    out(`  = ${Math.round(perDay).toLocaleString('en-US')} orders/day if sustained round the clock (target ${TARGET_PER_DAY.toLocaleString('en-US')}/day: ${(perDay / TARGET_PER_DAY).toFixed(1)}x)`);
    out(`  peak hour at ${Math.round(PEAK_SHARE * 100)}% of ${TARGET_PER_DAY.toLocaleString('en-US')}/day needs ${peakNeed.toFixed(2)} orders/s: ${(perSec / peakNeed).toFixed(1)}x headroom`);
    out(`Verdict: ${perSec >= peakNeed ? 'meets' : 'DOES NOT meet'} the ${TARGET_PER_DAY.toLocaleString('en-US')}/day target at this concurrency.`);
}

// ---- run -------------------------------------------------------------------------

async function main() {
    out(`Load run ${RUN} against ${LOCAL ? `in-process app (${base})` : base}`);
    const t0 = Date.now();
    const world = await seed();
    out(`Seeded ${world.sellers.length} stores x ${PRODUCTS} products, ${world.customers.length} customers, ${world.riders.length} riders in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // A few seconds of warm-up (connections, caches, JIT) not counted.
    const warmup = Math.min(5, Math.max(1, Math.round(DURATION_S / 10)));
    stopAt = Date.now() + (warmup + DURATION_S) * 1000;
    const actors = [
        ...world.customers.map((c) => customerLoop(c, world)),
        ...world.sellers.map((s) => sellerLoop(s)),
        ...world.riders.map((r) => riderLoop(r)),
    ];
    await sleep(warmup * 1000);
    measuring = true;
    const m0 = Date.now();
    // Only what completes inside the window counts; in-flight work drains after.
    setTimeout(() => { measuring = false; }, Math.max(0, stopAt - m0));
    const ticker = setInterval(() => out(`  ... ${Math.round((Date.now() - m0) / 1000)}s: ${counters.orders} orders, ${counters.failedJourneys} failed`), 10000);
    await Promise.all(actors);
    clearInterval(ticker);
    report(DURATION_S);
}

try {
    await main();
} catch (err) {
    out(`Load run failed: ${err?.stack || err}`);
    process.exitCode = 1;
} finally {
    await shutdown().catch(() => {});
    Object.assign(console, realConsole);
    if (!LOCAL) out(`Seeded records are tagged loadRun: '${RUN}' (admins, users, delivery_partners) and named '* ${RUN}*' (zone, stores, products).`);
    process.exit(process.exitCode || 0);
}
