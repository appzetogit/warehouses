/**
 * Notification wording: clothing, not food; readable order numbers, never a
 * database id; rupees with ₹; and no garbled emoji anywhere in the server's
 * push titles and bodies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FOOD_WORDS,
  orderNo,
  rupees,
  orderPlacedForCustomer,
  statusForCustomer,
  statusForStore,
  statusForRider,
  deliveryMilestone,
  riderAssigned,
  deliveredBySupport,
  cancelledByCustomer,
} from '../src/modules/commerce/shared/notificationCopy.js';

const DB_ID = /\b[a-f0-9]{24}\b/i;

const order = (extra = {}) => ({
  _id: '6ac3e1f9d385a9f1626421ef',
  order_id: 'ORD-8396662519',
  fulfilmentMode: 'quick',
  sellerId: { sellerName: 'Trends Vijay Nagar' },
  payment: { method: 'cash' },
  pricing: { total: 1198 },
  ...extra,
});

function everyMessage() {
  const out = [];
  for (const mode of ['quick', 'standard']) {
    const o = order({ fulfilmentMode: mode });
    out.push(orderPlacedForCustomer(o));
    for (const status of ['confirmed', 'preparing', 'ready_for_pickup', 'cancelled_by_seller', 'cancelled_by_admin']) {
      out.push(statusForCustomer(o, status), statusForStore(o, status), statusForRider(o, status));
    }
    for (const status of ['picked_up', 'reached_drop', 'delivered']) {
      const m = deliveryMilestone(o, status, { riderName: 'Rahul' });
      out.push(m.customer, m.store, m.rider);
    }
    const a = riderAssigned(o, { riderName: 'Rahul' });
    out.push(a.customer, a.store, a.rider, deliveredBySupport(o), cancelledByCustomer(o, 'Your refund is on its way.'));
  }
  return out.filter(Boolean);
}

test('no message talks about food, meals or cooking', () => {
  for (const m of everyMessage()) {
    assert.doesNotMatch(`${m.title} ${m.body}`, FOOD_WORDS, `${m.title} / ${m.body}`);
  }
});

test('orders are named by their number, never the database id', () => {
  for (const m of everyMessage()) {
    assert.doesNotMatch(`${m.title} ${m.body}`, DB_ID, `${m.title} / ${m.body}`);
  }
  assert.equal(orderNo(order()), 'ORD-8396662519');
  assert.equal(orderNo({ _id: '6ac3e1f9d385a9f1626421ef' }), '#6421EF', 'short fallback, not the full id');
});

test('money is in rupees with ₹', () => {
  assert.equal(rupees(1198), '₹1,198');
  assert.equal(rupees(599.5), '₹599.5');
  const atDoor = deliveryMilestone(order(), 'reached_drop', {}).customer.body;
  assert.match(atDoor, /Keep ₹1,198 ready/);
  assert.match(deliveryMilestone(order(), 'delivered', {}).rider.title, /Collected ₹1,198/);
});

test('each person gets their own words', () => {
  const m = deliveryMilestone(order(), 'picked_up', { riderName: 'Rahul' });
  assert.match(m.customer.body, /Rahul picked up order ORD-8396662519/);
  assert.doesNotMatch(m.store.body, /your order/i, 'the store is not told about "your order"');
  assert.match(riderAssigned(order(), { riderName: 'Rahul' }).customer.title, /Rahul will deliver/);
});

test('Shop and Quick are worded differently where it matters', () => {
  assert.match(statusForCustomer(order({ fulfilmentMode: 'standard' }), 'ready_for_pickup').body, /courier/);
  assert.match(statusForCustomer(order(), 'ready_for_pickup').body, /rider/);
});

test('no push title or body in the server code mentions food or has garbled emoji', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          const text = line.trim();
          if (!/^(title|body|userTitle|userBody|riderTitle|riderBody)\s*[:=]/.test(text)) return;
          if (FOOD_WORDS.test(text) || /ð|Ã|â€/.test(text)) offenders.push(`${path.relative(root, p)}:${i + 1}: ${text.slice(0, 90)}`);
        });
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
