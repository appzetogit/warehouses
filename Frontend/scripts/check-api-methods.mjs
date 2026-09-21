// Lists calls like `adminAPI.foo(` where `foo` is not defined on that API object.
// Usage: node check-api-methods.mjs <Frontend root>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const feRoot = path.resolve(process.argv[2]);
const require = createRequire(path.join(feRoot, 'package.json'));
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const opts = { sourceType: 'module', plugins: ['jsx'], errorRecovery: true };
const indexFile = path.join(feRoot, 'src/services/api/index.js');
const ast = parse(fs.readFileSync(indexFile, 'utf8'), opts);

// API name -> Set of keys (null = stub proxy, accepts anything)
const apis = new Map();
for (const node of ast.program.body) {
  if (node.type !== 'ExportNamedDeclaration' || node.declaration?.type !== 'VariableDeclaration') continue;
  for (const d of node.declaration.declarations) {
    const name = d.id?.name;
    if (!name || !/API$/.test(name)) continue;
    if (d.init?.type === 'ObjectExpression') {
      const keys = new Set();
      for (const p of d.init.properties) {
        if (p.key) keys.add(p.key.name ?? p.key.value);
        if (p.type === 'SpreadElement') keys.add('*');
      }
      apis.set(name, keys);
    } else {
      apis.set(name, null);
    }
  }
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})(path.join(feRoot, 'src'));

const missing = [];
const stubUse = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/API\./.test(src)) continue;
  let fast;
  try { fast = parse(src, { ...opts, plugins: ['jsx', 'typescript'] }); } catch { continue; }
  // Local name -> exported API name, for imports from the api module.
  const local = new Map();
  for (const n of fast.program.body) {
    if (n.type !== 'ImportDeclaration' || !/(@store\/api|services\/api)(\/index(\.js)?)?$/.test(n.source.value)) continue;
    for (const s of n.specifiers) if (s.type === 'ImportSpecifier' && apis.has(s.imported.name)) local.set(s.local.name, s.imported.name);
  }
  if (file === indexFile) for (const k of apis.keys()) local.set(k, k);
  if (!local.size) continue;
  traverse(fast, {
    MemberExpression(p) {
      const { object, property, computed } = p.node;
      if (computed || object.type !== 'Identifier' || !local.has(object.name)) return;
      const api = local.get(object.name);
      const keys = apis.get(api);
      const m = property.name;
      const where = `${path.relative(feRoot, file)}:${p.node.loc.start.line}`;
      if (keys === null) { stubUse.push(`${where}  ${api}.${m}  (stub: always fails)`); return; }
      if (keys.has('*') || keys.has(m)) return;
      missing.push(`${where}  ${api}.${m}`);
    },
  });
}

console.log(`Undefined API methods: ${missing.length}`);
for (const l of missing) console.log('  ' + l);
console.log(`\nStub API calls: ${stubUse.length}`);
for (const l of stubUse) console.log('  ' + l);
process.exitCode = missing.length || stubUse.length ? 1 : 0;
