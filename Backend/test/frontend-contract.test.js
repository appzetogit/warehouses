/**
 * The frontend's static checks, run from the backend suite so drift between
 * the two fails `npm test`:
 *  - every path the frontend calls exists in the route snapshot;
 *  - every `xxxAPI.method(` the frontend calls is defined on that API object.
 *
 * Only the two repo scripts run, under this same node binary, with fixed
 * arguments and no shell. Skipped when the frontend's deps aren't installed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = path.join(repo, 'Frontend');
const routes = path.join(repo, 'Backend/test/fixtures/routes.txt');
const skip = fs.existsSync(path.join(frontend, 'node_modules/@babel/parser'))
    ? false
    : 'Frontend/node_modules/@babel/parser is not installed';

function run(script, args) {
    try {
        const out = execFileSync(process.execPath, [path.join(frontend, 'scripts', script), ...args], {
            cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, out };
    } catch (err) {
        return { code: err.status ?? 1, out: `${err.stdout || ''}${err.stderr || ''}` };
    }
}

test('frontend API paths all exist on the backend', { skip }, () => {
    const { code, out } = run('check-api-paths.mjs', [frontend, routes]);
    assert.equal(code, 0, `check-api-paths failed:\n${out}`);
});

test('frontend API method calls are all defined', { skip }, () => {
    const { code, out } = run('check-api-methods.mjs', [frontend]);
    assert.equal(code, 0, `check-api-methods failed:\n${out}`);
});
