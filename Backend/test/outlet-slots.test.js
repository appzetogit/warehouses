import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, clearDb } from './helpers/db.js';
import {
    normalizeSlots,
    getOutletTimingsForSeller,
    upsertOutletTimingsForSeller,
} from '../src/modules/commerce/seller/services/outletTimings.service.js';
import { getOutletScheduleStatus } from '../src/modules/commerce/seller/helpers/sellerAvailability.helper.js';
import { getSellerLocalTimeParts } from '../src/utils/timezone.js';

before(startDb);
after(stopDb);
beforeEach(clearDb);

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const everyDay = (day) => Object.fromEntries(DAYS.map((d) => [d, day]));

// A Date whose store-local wall clock reads hh:mm (whatever the store timezone is).
function atLocal(hh, mm) {
    const base = new Date('2026-09-23T12:00:00Z');
    const { nowMinutes } = getSellerLocalTimeParts(base);
    return new Date(base.getTime() + ((hh * 60 + mm) - nowMinutes) * 60_000);
}

test('slots: validated, sorted, capped at three, no overlaps', () => {
    assert.deepEqual(
        normalizeSlots([{ start: '17:00', end: '22:00' }, { start: '9:00', end: '13:00' }], 'Monday'),
        [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '22:00' }],
    );
    assert.deepEqual(normalizeSlots([], 'Monday'), []);
    assert.throws(() => normalizeSlots([{ start: '09:00', end: '13:00' }, { start: '12:00', end: '15:00' }], 'Monday'), /overlap/);
    assert.throws(() => normalizeSlots([{ start: '09:00', end: '09:00' }], 'Monday'), /same time/);
    assert.throws(() => normalizeSlots([{ start: 'nine', end: '13:00' }], 'Monday'), /HH:mm/);
    assert.throws(
        () => normalizeSlots([{ start: '01:00', end: '02:00' }, { start: '03:00', end: '04:00' }, { start: '05:00', end: '06:00' }, { start: '07:00', end: '08:00' }], 'Monday'),
        /at most 3/,
    );
    assert.throws(() => normalizeSlots([{ start: '22:00', end: '02:00' }, { start: '23:00', end: '23:30' }], 'Monday'), /past midnight|overlap/);
});

test('slots are saved and read back; the day window follows them', async () => {
    const sellerId = new mongoose.Types.ObjectId();
    const monday = { isOpen: true, slots: [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '22:00' }] };
    await upsertOutletTimingsForSeller(sellerId, { ...everyDay({ isOpen: true, openingTime: '10:00', closingTime: '20:00' }), Monday: monday });

    const { outletTimings } = await getOutletTimingsForSeller(sellerId);
    assert.deepEqual(outletTimings.Monday.slots, monday.slots);
    assert.equal(outletTimings.Monday.openingTime, '09:00');
    assert.equal(outletTimings.Monday.closingTime, '22:00');
    assert.deepEqual(outletTimings.Tuesday.slots, []);
});

test('changing the single window on the timings page replaces the slots', async () => {
    const sellerId = new mongoose.Types.ObjectId();
    await upsertOutletTimingsForSeller(sellerId, everyDay({ isOpen: true, slots: [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '22:00' }] }));
    let { outletTimings } = await getOutletTimingsForSeller(sellerId);

    // Saving the page unchanged keeps the slots.
    await upsertOutletTimingsForSeller(sellerId, outletTimings);
    ({ outletTimings } = await getOutletTimingsForSeller(sellerId));
    assert.equal(outletTimings.Monday.slots.length, 2);

    // Editing Monday's opening time switches Monday to that single window.
    await upsertOutletTimingsForSeller(sellerId, { ...outletTimings, Monday: { ...outletTimings.Monday, openingTime: '08:00' } });
    ({ outletTimings } = await getOutletTimingsForSeller(sellerId));
    assert.deepEqual(outletTimings.Monday.slots, []);
    assert.equal(outletTimings.Monday.openingTime, '08:00');
    assert.equal(outletTimings.Tuesday.slots.length, 2);
});

test('a store with slots is closed in the gap between them', () => {
    const seller = { outletTimings: everyDay({ isOpen: true, openingTime: '09:00', closingTime: '22:00', slots: [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '22:00' }] }) };
    assert.equal(getOutletScheduleStatus(seller, atLocal(10, 0)).isOpen, true, 'morning slot');
    const gap = getOutletScheduleStatus(seller, atLocal(15, 0));
    assert.equal(gap.isOpen, false, 'afternoon gap');
    assert.equal(gap.openingTime, '17:00', 'reports the next slot');
    assert.equal(getOutletScheduleStatus(seller, atLocal(18, 30)).isOpen, true, 'evening slot');
    assert.equal(getOutletScheduleStatus(seller, atLocal(23, 0)).isOpen, false, 'after close');
});

test('a last slot past midnight keeps the store open into the next morning', () => {
    const seller = { outletTimings: everyDay({ isOpen: true, openingTime: '11:00', closingTime: '02:00', slots: [{ start: '11:00', end: '15:00' }, { start: '19:00', end: '02:00' }] }) };
    assert.equal(getOutletScheduleStatus(seller, atLocal(1, 0)).isOpen, true, 'after midnight');
    assert.equal(getOutletScheduleStatus(seller, atLocal(3, 0)).isOpen, false, 'closed at 3am');
    assert.equal(getOutletScheduleStatus(seller, atLocal(16, 0)).isOpen, false, 'afternoon gap');
});
