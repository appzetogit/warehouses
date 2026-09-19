import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startDb, stopDb } from './helpers/db.js';
import { listRoutes } from './helpers/routeInventory.js';

// The apps are built against these paths, so a route that disappears in a
// refactor is a broken screen somewhere. Changing the list is fine, but it has
// to be deliberate:  UPDATE_ROUTES=1 npm test  rewrites the snapshot.
const SNAPSHOT = new URL('./fixtures/routes.txt', import.meta.url);

let app;
before(async () => {
    // Some modules query Mongo at import time; without a connection they wait forever.
    await startDb();
    ({ default: app } = await import('../src/app.js'));
});
after(stopDb);

test('the registered routes match the snapshot', () => {
    const routes = listRoutes(app);
    if (process.env.UPDATE_ROUTES) {
        fs.writeFileSync(SNAPSHOT, routes.join('\n') + '\n');
        return;
    }
    const expected = fs.readFileSync(SNAPSHOT, 'utf8').split('\n').filter(Boolean);
    const have = new Set(routes);
    const want = new Set(expected);
    assert.deepEqual(
        { missing: expected.filter((r) => !have.has(r)), added: routes.filter((r) => !want.has(r)) },
        { missing: [], added: [] }
    );
});
