import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

let admin;
let userToken;
const HOUR = 3600000;
const segments = [{ type: 'coins', value: 10, weight: 1 }, { type: 'none', weight: 1 }];

before(async () => {
    await startApp();
    const { User } = await import('../src/core/users/user.model.js');
    const user = await User.create({ phone: '9777800001', name: 'Scheduled Spinner', role: 'USER', status: 'active' });
    userToken = tokenFor('USER', user._id);
    const adminId = new mongoose.Types.ObjectId();
    await mongoose.connection.db.collection('admins').insertOne({
        _id: adminId, email: 'spin-sched@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true,
    });
    admin = tokenFor('ADMIN', adminId, { adminType: 'super_admin' });
});

after(stopApp);

async function makeLive(body) {
    const c = ok(await call('POST', '/admin/spin/campaigns', { as: admin, body: { title: 'Sched', segments, ...body } }), 'create', 201);
    ok(await call('PATCH', `/admin/spin/campaigns/${c._id}/active`, { as: admin, body: { isActive: true } }), 'activate');
    return c;
}
const status = async () => ok(await call('GET', '/user/spin/status', { as: userToken }), 'status');

test('end must be after start, on create and on update', async () => {
    const now = Date.now();
    const bad = await call('POST', '/admin/spin/campaigns', {
        as: admin, body: { title: 'Bad', segments, startsAt: new Date(now + HOUR), endsAt: new Date(now) },
    });
    assert.equal(bad.status, 400);
    assert.equal((await call('POST', '/admin/spin/campaigns', { as: admin, body: { title: 'Bad', segments, startsAt: 'nope' } })).status, 400);

    const c = ok(await call('POST', '/admin/spin/campaigns', { as: admin, body: { title: 'Ok', segments, startsAt: new Date(now + HOUR) } }), 'create', 201);
    assert.equal(c.scheduleStatus, 'scheduled');
    assert.equal(c.endsAt, null);
    const badUpd = await call('PATCH', `/admin/spin/campaigns/${c._id}`, { as: admin, body: { endsAt: new Date(now) } });
    assert.equal(badUpd.status, 400, 'end before the stored start is refused');
});

test('customers only see the wheel inside its window', async () => {
    const now = Date.now();
    await makeLive({ startsAt: new Date(now + HOUR) });
    assert.equal((await status()).isActive, false, 'before the window');

    const live = await makeLive({ startsAt: new Date(now - HOUR), endsAt: new Date(now + HOUR) });
    assert.equal((await status()).isActive, true, 'inside the window');
    const list = ok(await call('GET', '/admin/spin/campaigns', { as: admin }), 'list');
    assert.equal(list.find((x) => x._id === live._id).scheduleStatus, 'live');

    const ended = await makeLive({ startsAt: new Date(now - 2 * HOUR), endsAt: new Date(now - HOUR) });
    assert.equal((await status()).isActive, false, 'after the window');
    const list2 = ok(await call('GET', '/admin/spin/campaigns', { as: admin }), 'list');
    assert.equal(list2.find((x) => x._id === ended._id).scheduleStatus, 'ended');
    assert.equal(list2.filter((x) => x.isActive).length, 1, 'still one active wheel');

    await makeLive({});
    assert.equal((await status()).isActive, true, 'open-ended wheel runs');
});
