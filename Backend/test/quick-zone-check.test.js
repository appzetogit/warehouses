/**
 * Admin Quick zone check and zone assignment: a store inside a zone is ready,
 * one pinned inside a zone it isn't assigned to can be assigned it, one where
 * no zone covers it is told to create a zone, and a zone that doesn't contain
 * the store is refused.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

let adminToken;
const ids = {};
let Seller;

const square = (lat, lng, d = 0.05) => [
    { latitude: lat - d, longitude: lng - d },
    { latitude: lat + d, longitude: lng - d },
    { latitude: lat + d, longitude: lng + d },
    { latitude: lat - d, longitude: lng + d },
];

before(async () => {
    const db = await startApp();
    ({ Seller } = await import('../src/modules/commerce/seller/models/seller.model.js'));
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const indore = await Zone.create({ name: 'Indore City', zoneName: 'Indore City', country: 'India', coordinates: square(22.72, 75.86), isActive: true });
    const bhopal = await Zone.create({ name: 'Bhopal', zoneName: 'Bhopal', country: 'India', coordinates: square(23.25, 77.41), isActive: true });
    ids.indore = indore._id;
    ids.bhopal = bhopal._id;
    const adminId = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({ _id: adminId, email: 'zone_admin@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true });
    adminToken = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(stopApp);

let phoneSeq = 9300000000;
const store = (fields) =>
    Seller.create({
        sellerName: `Store ${phoneSeq}`, ownerName: 'Owner', ownerPhone: String(phoneSeq++), status: 'approved',
        channels: { quick: { status: 'pending' }, shop: { status: 'none' } },
        ...fields,
    });
const at = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat], latitude: lat, longitude: lng, area: 'Vijay Nagar', city: 'Indore' });
const check = (id) => call('GET', `/admin/sellers/${id}/quick-zone`, { as: adminToken });

test('inside its zone: ready, and Quick can be approved', async () => {
    const s = await store({ zoneId: ids.indore, location: at(22.72, 75.86) });
    const c = ok(await check(s._id), 'check');
    assert.equal(c.ready, true);
    assert.equal(c.action, 'none');
    assert.equal(c.assignedZone.name, 'Indore City');
    ok(await call('PATCH', `/admin/sellers/${s._id}/channels/quick`, { as: adminToken, body: { action: 'approve' } }), 'approve');
});

test('no zone assigned but inside one: assign it, then ready', async () => {
    const s = await store({ location: at(22.73, 75.87) });
    const c = ok(await check(s._id), 'check');
    assert.equal(c.action, 'assign_zone');
    assert.equal(c.zoneForLocation.name, 'Indore City');

    const wrong = await call('PATCH', `/admin/sellers/${s._id}/zone`, { as: adminToken, body: { zoneId: String(ids.bhopal) } });
    assert.equal(wrong.status, 400, 'a zone that does not contain the store is refused');
    assert.match(wrong.body.message, /outside Bhopal/);

    const done = ok(await call('PATCH', `/admin/sellers/${s._id}/zone`, { as: adminToken, body: { zoneId: String(ids.indore) } }), 'assign');
    assert.equal(done.ready, true);
    const saved = await Seller.findById(s._id).lean();
    assert.equal(String(saved.zoneId), String(ids.indore));
});

test('assigned the wrong zone: the covering one is suggested', async () => {
    const s = await store({ zoneId: ids.bhopal, location: at(22.71, 75.85) });
    const c = ok(await check(s._id), 'check');
    assert.equal(c.insideAssigned, false);
    assert.equal(c.action, 'assign_zone');
    assert.equal(c.zoneForLocation.name, 'Indore City');
});

test('no zone covers the store: create a zone; no location: set it', async () => {
    const far = await store({ location: at(19.07, 72.87) });
    const c = ok(await check(far._id), 'check');
    assert.equal(c.action, 'create_zone');
    assert.equal(c.zoneForLocation, null);
    const refused = await call('PATCH', `/admin/sellers/${far._id}/channels/quick`, { as: adminToken, body: { action: 'approve' } });
    assert.equal(refused.status, 400, 'approval is still refused by the server');

    const nowhere = await store({});
    assert.equal(ok(await check(nowhere._id), 'check').action, 'set_location');
});
