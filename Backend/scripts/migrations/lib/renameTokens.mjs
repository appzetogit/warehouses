/**
 * Rewrites a database to follow a code-wide rename (restaurant -> seller, ...).
 *
 * When the code renames a word, the data has to follow in four places:
 *   - collection names          food_restaurants        -> food_sellers
 *   - field names, at any depth restaurantId, pricing.restaurantShare
 *   - stored identifier values  'RESTAURANT', 'cancelled_by_restaurant',
 *                               refPath model names such as 'FoodRestaurant'
 *   - indexes on renamed fields (dropped and recreated under the new names)
 *
 * A string value is renamed only when it is a single identifier-like token
 * (letters, digits, underscores). Anything with a space, slash, dot or dash is
 * free text, a URL or a file path, and is left exactly as stored: a seller
 * called "Restaurant Corner" keeps its name, and an image path keeps pointing
 * at the file on disk.
 *
 * There is no in-place reverse. Take a mongodump before --apply and restore it
 * to undo; that is the only undo that is guaranteed to be exact.
 */

const TOKEN_VALUE = /^[A-Za-z0-9_]+$/;

/**
 * @param {import('mongodb').Db} db
 * @param {(s: string) => string} rename  maps a name/key/token to its new form
 * @param {{ apply?: boolean, log?: (msg: string) => void, renameCollection?: (s: string) => string }} [opts]
 *   renameCollection: for collection names, when they follow a different rule
 *   than keys and values (food_orders -> orders, but food_approved -> product_approved).
 */
export async function renameTokensInDb(db, rename, { apply = false, log = console.log, renameCollection = rename } = {}) {
    const summary = { collections: [], documents: 0, indexes: 0 };

    const renameKeysAndValues = (value) => {
        if (Array.isArray(value)) {
            let changed = false;
            const out = value.map((v) => {
                const r = renameKeysAndValues(v);
                if (r !== v) changed = true;
                return r;
            });
            return changed ? out : value;
        }
        if (typeof value === 'string') {
            if (!TOKEN_VALUE.test(value)) return value;
            const r = rename(value);
            return r === value ? value : r;
        }
        if (!isPlainObject(value)) return value;

        let changed = false;
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const nk = rename(k);
            const nv = renameKeysAndValues(v);
            if (nk !== k || nv !== v) changed = true;
            if (nk !== k && Object.prototype.hasOwnProperty.call(value, nk)) {
                throw new Error(`Renaming key "${k}" would overwrite existing key "${nk}"`);
            }
            out[nk] = nv;
        }
        return changed ? out : value;
    };

    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

    for (const name of [...existing].sort()) {
        if (name.startsWith('system.')) continue;
        const newName = renameCollection(name);
        if (newName !== name && existing.has(newName)) {
            throw new Error(`Cannot rename ${name}: ${newName} already exists`);
        }

        const coll = db.collection(name);
        let docsChanged = 0;
        const ops = [];
        const flush = async () => {
            if (apply && ops.length) await coll.bulkWrite(ops.splice(0), { ordered: false });
            ops.length = 0;
        };

        for await (const doc of coll.find({})) {
            const next = renameKeysAndValues(doc);
            if (next === doc) continue;
            docsChanged++;
            ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: next } });
            if (ops.length >= 500) await flush();
        }
        await flush();

        // Indexes named or keyed on old names are recreated under the new ones.
        let indexesChanged = 0;
        for (const ix of await coll.indexes()) {
            if (ix.name === '_id_') continue;
            const newKey = renameKeysAndValues(ix.key);
            const newIxName = rename(ix.name);
            const newPartial = ix.partialFilterExpression && renameKeysAndValues(ix.partialFilterExpression);
            // A text index lists its fields in `weights`, not in `key`.
            const newWeights = ix.weights && renameKeysAndValues(ix.weights);
            if (newKey === ix.key && newIxName === ix.name
                && newPartial === ix.partialFilterExpression && newWeights === ix.weights) continue;
            indexesChanged++;
            if (apply) {
                const { key, name: _n, v, ns, ...options } = ix;
                await coll.dropIndex(ix.name);
                // A text index is recreated from its fields, not its internal _fts key.
                const createKey = newWeights
                    ? Object.fromEntries(Object.keys(newWeights).map((f) => [f, 'text']))
                    : newKey;
                await coll.createIndex(createKey, {
                    ...options,
                    name: newIxName,
                    ...(newPartial ? { partialFilterExpression: newPartial } : {}),
                    ...(newWeights ? { weights: newWeights } : {})
                });
            }
        }

        if (newName !== name && apply) await coll.rename(newName);

        if (newName !== name || docsChanged || indexesChanged) {
            summary.collections.push({ from: name, to: newName, documents: docsChanged, indexes: indexesChanged });
            summary.documents += docsChanged;
            summary.indexes += indexesChanged;
            log(`${name}${newName !== name ? ` -> ${newName}` : ''}: ${docsChanged} documents, ${indexesChanged} indexes`);
        }
    }

    return summary;
}

function isPlainObject(v) {
    if (v === null || typeof v !== 'object') return false;
    // ObjectId, Date, Decimal128, Binary and friends are values, not documents.
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}
