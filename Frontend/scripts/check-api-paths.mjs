// Lists frontend API paths that match no backend route.
// Usage: node check-fe-api-paths.mjs <frontendRoot> <routes.txt>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [feRoot, routesFile] = process.argv.slice(2);
const require = createRequire(path.join(path.resolve(feRoot), 'package.json'));
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const routes = fs.readFileSync(routesFile, 'utf8').split('\n').filter(Boolean)
    .map((l) => { const [m, p] = l.split(' '); return { m, segs: p.replace(/^\/api\/v1/, '').split('/').filter(Boolean) }; });

const API_AREAS = new Set(['admin', 'seller', 'delivery', 'user', 'orders', 'payments', 'catalog', 'content', 'settings', 'auth', 'chat', 'notifications', 'uploads', 'fcm-tokens', 'food']);

const matches = (p) => {
    const segs = p.split('?')[0].split('/').filter(Boolean);
    return routes.some((r) => segs.length <= r.segs.length
        && segs.every((s, i) => s === r.segs[i] || s === ':p' || r.segs[i].startsWith(':')));
};

const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
};

const HTTP_OBJECTS = new Set(['apiClient', 'api', 'axios', 'axiosInstance', 'http', 'client']);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const API_FILES = /services[\\/]api[\\/](index|config|auth)\.js$|publicAppConfig\.js$/;

const bad = [];
for (const abs of walk(path.join(path.resolve(feRoot), 'src'))) {
    const src = fs.readFileSync(abs, 'utf8');
    let ast;
    try { ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }); } catch { continue; }
    const rel = path.relative(feRoot, abs);
    const isApiFile = API_FILES.test(abs);
    const check = (node) => {
        let text;
        if (node.type === 'StringLiteral') text = node.value;
        else if (node.type === 'TemplateLiteral') text = node.quasis.map((q) => q.value.cooked).join(':p');
        else return;
        if (!text.startsWith('/')) return;
        const area = text.split('/')[1];
        if (!API_AREAS.has(area)) return;
        if (!matches(text)) bad.push(`${rel}:${node.loc.start.line}: ${text}`);
    };
    traverse(ast, {
        CallExpression(p) {
            const { callee, arguments: args } = p.node;
            if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return;
            if (!HTTP_METHODS.has(callee.property.name)) return;
            const o = callee.object;
            const name = o.type === 'Identifier' ? o.name : o.type === 'MemberExpression' && o.property.type === 'Identifier' ? o.property.name : '';
            if (HTTP_OBJECTS.has(name) && args[0]) check(args[0]);
        },
        StringLiteral(p) { if (isApiFile) check(p.node); },
        TemplateLiteral(p) { if (isApiFile) check(p.node); },
    });
}
const uniq = [...new Set(bad)];
console.log(`API paths matching no backend route: ${uniq.length}`);
uniq.forEach((b) => console.log('  ' + b));
process.exitCode = uniq.length ? 1 : 0;
