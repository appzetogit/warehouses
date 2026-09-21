// Lists source files not reachable from src/main.jsx through static, dynamic
// and lazy imports (resolving the Vite aliases).
// Usage: node reachable.mjs <Frontend root> [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(process.argv[2]);
const src = path.join(root, 'src');
const require = createRequire(path.join(root, 'package.json'));
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const aliases = [
  ['@store/api/axios', path.join(src, 'services/api/axios.js')],
  ['@store/api/config', path.join(src, 'services/api/config.js')],
  ['@store/api', path.join(src, 'services/api')],
  ['@store', path.join(src, 'modules/Store')],
  ['@delivery', path.join(src, 'modules/DeliveryV2')],
  ['@', src],
];
const EXT = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

function resolve(spec, fromFile) {
  let base = null;
  for (const [a, target] of aliases) {
    if (spec === a || spec.startsWith(a + '/')) { base = target + spec.slice(a.length); break; }
  }
  if (!base) {
    if (!spec.startsWith('.')) return null; // package
    base = path.resolve(path.dirname(fromFile), spec);
  }
  for (const e of EXT) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return path.resolve(p);
  }
  return null;
}

const all = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) all.push(p);
  }
})(src);

const seen = new Set();
const unresolved = [];
const queue = [path.join(src, 'index.jsx')];
while (queue.length) {
  const f = queue.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  let ast;
  try {
    ast = parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
  } catch { continue; }
  const specs = [];
  traverse(ast, {
    ImportDeclaration(p) { specs.push(p.node.source.value); },
    ExportNamedDeclaration(p) { if (p.node.source) specs.push(p.node.source.value); },
    ExportAllDeclaration(p) { specs.push(p.node.source.value); },
    CallExpression(p) {
      const { callee, arguments: args } = p.node;
      if ((callee.type === 'Import' || (callee.type === 'Identifier' && callee.name === 'require')) && args[0]?.type === 'StringLiteral') specs.push(args[0].value);
    },
  });
  for (const s of specs) {
    const r = resolve(s, f);
    if (r) queue.push(r);
    else if (s.startsWith('.') || s.startsWith('@/') || s.startsWith('@store') || s.startsWith('@delivery')) unresolved.push(`${path.relative(root, f)} -> ${s}`);
  }
}

const dead = all.filter((f) => !seen.has(f)).map((f) => path.relative(root, f).split(path.sep).join('/')).sort();
const out = process.argv.indexOf('--json');
if (out > 0) fs.writeFileSync(process.argv[out + 1], JSON.stringify({ reachable: [...seen].map((f) => path.relative(root, f).split(path.sep).join('/')), dead }, null, 1));
console.log(`files ${all.length}, reachable ${seen.size}, unreachable ${dead.length}, unresolved imports ${unresolved.length}`);
for (const u of unresolved) console.log('UNRESOLVED ' + u);
for (const d of dead) console.log('DEAD ' + d);
process.exitCode = dead.length || unresolved.length ? 1 : 0;
