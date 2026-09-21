/**
 * The real app on a random port, over the in-memory replica set, with helpers
 * to call it as a given role. Import the app lazily (startApp), so a test file
 * can mock modules before any of the app loads.
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';

const { startDb, stopDb } = await import('./db.js');

let server;
let base;
let signAccessToken;

export async function startApp() {
    await startDb();
    ({ signAccessToken } = await import('../../src/core/auth/token.util.js'));
    const { default: app } = await import('../../src/app.js');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
    return mongoose.connection.db;
}

export async function stopApp() {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    await stopDb();
}

export const tokenFor = (role, id, extra = {}) => signAccessToken({ userId: String(id), role, ...extra });

export async function call(method, path, { as, body } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (as) headers.authorization = `Bearer ${as}`;
    const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
}

/** Fails with the server's message rather than a bare status mismatch. */
export function ok(res, what, status = 200) {
    assert.equal(res.status, status, `${what}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data;
}

export const oid = (id) => new mongoose.Types.ObjectId(String(id));
