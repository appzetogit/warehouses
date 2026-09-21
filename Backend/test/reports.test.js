import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const oid = () => new mongoose.Types.ObjectId();

let adminToken;
const sellerA = oid();
const sellerB = oid();
const base = new Date('2026-03-10T10:00:00Z');
const RANGE = 'from=2026-03-01&to=2026-03-31';

function order({ seller, mode = 'quick', minutes, days, status = 'delivered', via = 'state', extra = {}, i }) {
    const createdAt = new Date(base.getTime() + i * 60 * MIN);
    const deliveredAt = new Date(createdAt.getTime() + (minutes ? minutes * MIN : days * DAY));
    const doc = {
        _id: oid(),
        order_id: `ORD-T${i}`,
        orderId: `ORD-T${i}`,
        userId: oid(),
        sellerId: seller,
        fulfilmentMode: mode,
        orderStatus: status,
        items: [{ itemId: 'x', name: 'X', price: 100, quantity: 1 }],
        pricing: { subtotal: 100, packagingFee: 0, sellerCommission: 10, discount: 0, total: 100 },
        coinsDiscount: 0,
        deliveryState: via === 'state' ? { deliveredAt } : {},
        statusHistory: via === 'history' ? [{ at: deliveredAt, from: 'picked_up', to: 'delivered' }] : [],
        createdAt,
        updatedAt: new Date(deliveredAt.getTime() + DAY),
        ...extra,
    };
    return doc;
}

before(async () => {
    const db = await startApp();
    const adminId = oid();
    await db.collection('admins').insertOne({ _id: adminId, email: 'admin_reports@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
    await db.collection('sellers').insertMany([{ _id: sellerA, sellerName: 'Alpha Mart' }, { _id: sellerB, sellerName: 'Beta Store' }]);

    const withTxn = order({ seller: sellerA, minutes: 10, i: 1, extra: { coinsDiscount: 7 } });
    const orders = [
        withTxn,
        order({ seller: sellerA, minutes: 20, i: 2, via: 'history' }),
        order({ seller: sellerA, minutes: 40, i: 3 }),
        // Promised 20 minutes: 25 is late even though it is under the 30-minute default.
        order({ seller: sellerB, minutes: 25, i: 4, extra: { promisedEtaMinutes: 20 } }),
        order({ seller: sellerB, mode: 'standard', days: 2, i: 5, extra: { shipment: { awb: 'A1', etd: new Date(base.getTime() + 5 * 60 * MIN + 3 * DAY) } } }),
        order({ seller: sellerB, mode: 'standard', days: 4, i: 6, extra: { shipment: { awb: 'A2', etd: new Date(base.getTime() + 6 * 60 * MIN + 3 * DAY) } } }),
        order({ seller: sellerB, mode: 'standard', days: 1, i: 7 }),
        // Excluded everywhere: cancelled, and outside the range.
        order({ seller: sellerA, minutes: 5, i: 8, status: 'cancelled_by_user' }),
        { ...order({ seller: sellerA, minutes: 5, i: 9 }), createdAt: new Date('2026-05-01T00:00:00Z') },
    ];
    await db.collection('orders').insertMany(orders);
    await db.collection('order_transactions').insertOne({
        _id: oid(),
        orderId: withTxn._id,
        sellerId: sellerA,
        amounts: { sellerCommission: 12, sellerDiscountShare: 5, adminDiscountShare: 3, sellerShare: 83 },
    });

    // Coins, relative to the real clock (the report's "now").
    const now = Date.now();
    const user = oid();
    const refundLot = oid();
    const spinLot = oid();
    const adminLot = oid();
    const recent = new Date(now - 2 * DAY);
    await db.collection('coin_lots').insertMany([
        { _id: refundLot, userId: user, amount: 1000, spendable: 800, used: 300, source: 'refund', expiresAt: new Date(now + 5 * DAY), expiredAt: null },
        { _id: spinLot, userId: user, amount: 100, spendable: 100, used: 0, source: 'spin', expiresAt: new Date(now + 60 * DAY), expiredAt: null },
        { _id: adminLot, userId: user, amount: 50, spendable: 50, used: 10, source: 'admin', expiresAt: new Date(now - DAY), expiredAt: new Date(now - DAY) },
    ]);
    await db.collection('coin_ledger').insertMany([
        { userId: user, type: 'credit', amount: 1000, spendable: 800, source: 'refund', createdAt: recent },
        { userId: user, type: 'credit', amount: 100, spendable: 100, source: 'spin', createdAt: recent },
        { userId: user, type: 'credit', amount: 50, spendable: 50, source: 'admin', createdAt: recent },
        { userId: user, type: 'credit', amount: 20, spendable: 20, source: 'reversal', createdAt: recent },
        {
            userId: user, type: 'debit', amount: 310, orderId: oid(), createdAt: recent,
            allocations: [{ lotId: refundLot, amount: 300, returned: 0 }, { lotId: adminLot, amount: 10, returned: 0 }],
        },
        { userId: user, type: 'expire', amount: 40, refId: String(adminLot), createdAt: new Date(now - DAY) },
    ]);
});

after(stopApp);

test('delivery SLA: median, p90 and on-time per mode and per seller', async () => {
    const r = ok(await call('GET', `/admin/reports/delivery-sla?${RANGE}`, { as: adminToken }), 'sla');
    const quick = r.byMode.find((m) => m.fulfilmentMode === 'quick');
    assert.deepEqual(
        { count: quick.count, median: quick.median, p90: quick.p90, judged: quick.judged, onTime: quick.onTime, onTimePct: quick.onTimePct },
        { count: 4, median: 22.5, p90: 40, judged: 4, onTime: 2, onTimePct: 50 }
    );
    const std = r.byMode.find((m) => m.fulfilmentMode === 'standard');
    assert.deepEqual(
        { count: std.count, median: std.median, p90: std.p90, judged: std.judged, onTime: std.onTime, unit: std.unit },
        { count: 3, median: 2, p90: 4, judged: 2, onTime: 1, unit: 'days' }
    );
    const aQuick = r.bySeller.find((s) => s.sellerName === 'Alpha Mart' && s.fulfilmentMode === 'quick');
    assert.equal(aQuick.count, 3);
    assert.equal(aQuick.median, 20);
    assert.equal(aQuick.late, 1);
    assert.deepEqual(r.lateOrders.map((o) => o.order_id).sort(), ['ORD-T3', 'ORD-T4', 'ORD-T6']);

    const onlyStd = ok(await call('GET', `/admin/reports/delivery-sla?${RANGE}&fulfilmentMode=standard`, { as: adminToken }), 'sla std');
    assert.deepEqual(onlyStd.byMode.map((m) => m.fulfilmentMode), ['standard']);
    const slack = ok(await call('GET', `/admin/reports/delivery-sla?${RANGE}&quickSlaMinutes=45`, { as: adminToken }), 'sla 45');
    assert.equal(slack.byMode.find((m) => m.fulfilmentMode === 'quick').onTime, 3, 'only the promised-ETA order stays late');
});

test('commission: per seller from the transaction, falling back to order pricing, with totals', async () => {
    const r = ok(await call('GET', `/admin/reports/commission?${RANGE}`, { as: adminToken }), 'commission');
    const a = r.sellers.find((s) => s.sellerName === 'Alpha Mart');
    assert.deepEqual(
        { orders: a.orders, gross: a.grossItemValue, commission: a.commission, sd: a.sellerFundedDiscount, pd: a.platformFundedDiscount, coins: a.coinsDiscount, net: a.netPayable },
        { orders: 3, gross: 300, commission: 32, sd: 5, pd: 3, coins: 7, net: 263 }
    );
    const b = r.sellers.find((s) => s.sellerName === 'Beta Store');
    assert.deepEqual({ orders: b.orders, gross: b.grossItemValue, commission: b.commission, net: b.netPayable }, { orders: 4, gross: 400, commission: 40, net: 360 });
    assert.deepEqual(
        { orders: r.totals.orders, gross: r.totals.grossItemValue, commission: r.totals.commission, net: r.totals.netPayable, coins: r.totals.coinsDiscount },
        { orders: 7, gross: 700, commission: 72, net: 623, coins: 7 }
    );
    const quickOnly = ok(await call('GET', `/admin/reports/commission?${RANGE}&fulfilmentMode=standard`, { as: adminToken }), 'commission std');
    assert.equal(quickOnly.totals.grossItemValue, 300);
});

test('coin liability: outstanding split, expiry buckets and movements by source', async () => {
    const r = ok(await call('GET', '/admin/reports/coin-liability', { as: adminToken }), 'coins');
    assert.deepEqual(
        { ...r.outstanding, expiring: undefined },
        { total: 800, spendable: 600, neverSpendable: 200, spendableValue: 600, expiring: undefined }
    );
    assert.deepEqual(r.outstanding.expiring, { days7: 500, days30: 500, days90: 600 });
    assert.equal(r.period.issued, 1150, 're-credited reversals are not new issuance');
    assert.equal(r.period.redeemed, 310);
    assert.equal(r.period.expired, 40);
    const refund = r.bySource.find((s) => s.source === 'refund');
    assert.deepEqual(
        { outstanding: refund.outstanding, spendable: refund.spendable, never: refund.neverSpendable, issued: refund.issued, redeemed: refund.redeemed },
        { outstanding: 700, spendable: 500, never: 200, issued: 1000, redeemed: 300 }
    );
    const admin = r.bySource.find((s) => s.source === 'admin');
    assert.deepEqual({ redeemed: admin.redeemed, expired: admin.expired, outstanding: admin.outstanding }, { redeemed: 10, expired: 40, outstanding: 0 });
    assert.ok(r.allTime, 'includes the all-time coin report');
});

test('xlsx exports stream a workbook', async () => {
    for (const path of ['delivery-sla', 'commission', 'coin-liability']) {
        const res = await call('GET', `/admin/reports/${path}/export?${RANGE}`, { as: adminToken });
        assert.equal(res.status, 200, path);
        assert.equal(res.body, null, `${path} is not JSON`);
    }
});

test('rejects bad input', async () => {
    for (const qs of ['from=nope', 'from=2026-03-10&to=2026-03-01', 'fulfilmentMode=fast', 'sellerId=123', 'from=2024-01-01&to=2026-01-01', 'quickSlaMinutes=0']) {
        const res = await call('GET', `/admin/reports/delivery-sla?${qs}`, { as: adminToken });
        assert.equal(res.status, 400, qs);
    }
});
