/**
 * Every route the app registers, as sorted "METHOD /path" strings.
 *
 * Express 4 keeps mount paths only as compiled regexps, so this turns each
 * layer's regexp back into its path. Good enough to prove that a refactor kept
 * every endpoint the apps call — which is all it is for.
 */
const mountPath = (layer) => {
    if (layer.regexp?.fast_slash) return '';
    return (layer.regexp?.source || '')
        .replace(/^\^/, '')
        .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
        .replace(/\\\//g, '/');
};

export function listRoutes(app) {
    const out = new Set();
    const walk = (stack, prefix) => {
        for (const layer of stack) {
            if (layer.route) {
                const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
                for (const p of paths) {
                    for (const method of Object.keys(layer.route.methods)) {
                        if (method === '_all') continue;
                        out.add(`${method.toUpperCase()} ${prefix}${p}`);
                    }
                }
            } else if (layer.name === 'router' && layer.handle?.stack) {
                walk(layer.handle.stack, prefix + mountPath(layer));
            }
        }
    };
    walk(app._router.stack, '');
    return [...out].sort();
}
