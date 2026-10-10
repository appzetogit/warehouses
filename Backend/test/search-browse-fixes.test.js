/**
 * Browsing fixes: a size filter only matches a variant that can be bought in
 * the storefront's channel (and the facet counts agree), "coord" and
 * "necklace" find Co-ord Sets and Neckpieces, and a product page's options
 * come from active variants without losing values the category doesn't list.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { startApp, stopApp, call, ok } = await import('./helpers/app.js');

let tee;

before(async () => {
    await startApp();
    const { Attribute, AttributeSet } = await import('../src/modules/commerce/admin/models/attribute.model.js');
    const { Category } = await import('../src/modules/commerce/admin/models/category.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');

    await Product.init();
    const size = await Attribute.create({ name: 'Size', key: 'size', type: 'select', values: ['S', 'M', 'L'].map((value) => ({ value })), isFilterable: true });
    const set = await AttributeSet.create({ name: 'Apparel', key: 'apparel', attributeIds: [size._id] });
    const tees = await Category.create({ name: 'Tees', attributeSetId: set._id });
    const coords = await Category.create({ name: 'Co-ord Sets' });
    const necks = await Category.create({ name: 'Neckpieces' });
    const seller = await Seller.create({
        channels: { quick: { status: 'none' }, shop: { status: 'approved' } },
        sellerName: 'Browse Store', ownerName: 'Owner', ownerPhone: '9300000501', phone: '9300000501', status: 'approved', isActive: true,
        location: { type: 'Point', coordinates: [75.87, 22.71] },
    });
    const base = { sellerId: seller._id, price: 999, mrp: 1500, approvalStatus: 'approved', channels: { shop: true, quick: false } };
    tee = await Product.create({
        ...base, name: 'Plain Tee', categoryId: tees._id, categoryName: 'Tees',
        variants: [
            { name: 'S', price: 999, attributes: [{ name: 'Size', value: 'S' }], stock: { shop: 3, quick: null } },
            // Sold out in the shop: "M" must not find this tee.
            { name: 'M', price: 999, attributes: [{ name: 'Size', value: 'M' }], stock: { shop: 0, quick: null } },
            // Switched off in the shop.
            { name: 'L', price: 999, attributes: [{ name: 'Size', value: 'L' }], stock: { shop: 5, quick: null }, channels: { shop: false } },
            // Retired: not an option on the page.
            { name: 'XS', price: 999, attributes: [{ name: 'Size', value: 'XS' }], stock: { shop: 5, quick: null }, isActive: false },
            // Not in the category's list (written lower case): still an option.
            { name: 'XXL', price: 999, attributes: [{ name: 'Size', value: 'XXL' }], stock: { shop: 2, quick: null } },
        ],
    });
    await Product.create({ ...base, name: 'Printed Co-ord Set', categoryId: coords._id, categoryName: 'Co-ord Sets', stock: { shop: 4, quick: null } });
    await Product.create({ ...base, name: 'Kundan Neckpiece', categoryId: necks._id, categoryName: 'Neckpieces', stock: { shop: 4, quick: null } });
});

after(stopApp);

const search = (params) => call('GET', `/catalog/search/products?${new URLSearchParams({ fulfilmentMode: 'standard', ...params })}`);
const names = (res) => ok(res, 'search').products.map((p) => p.name);

test('a size filter only matches a variant in stock and on in the channel', async () => {
    assert.deepEqual(names(await search({ 'attr[Size]': 'S' })), ['Plain Tee']);
    assert.deepEqual(names(await search({ 'attr[Size]': 'M' })), [], 'sold out in the shop');
    assert.deepEqual(names(await search({ 'attr[Size]': 'L' })), [], 'switched off in the shop');
});

test('the size facet only counts buyable variants', async () => {
    const res = ok(await search({ q: 'tee', facets: '1' }), 'search');
    const sizes = res.facets.attributes.find((a) => a.name === 'Size');
    assert.deepEqual(sizes.values.map((v) => v.value).sort(), ['S', 'XXL']);
});

for (const q of ['coord', 'coords', 'co ord', 'co-ord sets']) {
    test(`"${q}" finds the co-ord set`, async () => {
        for (const smart of ['0', '1']) {
            assert.ok(names(await search({ q, smart })).includes('Printed Co-ord Set'), `smart=${smart}`);
        }
    });
}

for (const q of ['necklace', 'necklaces', 'neckpiece', 'neck piece']) {
    test(`"${q}" finds the neckpiece`, async () => {
        for (const smart of ['0', '1']) {
            assert.ok(names(await search({ q, smart })).includes('Kundan Neckpiece'), `smart=${smart}`);
        }
    });
}

test('product options come from active variants and keep values the category does not list', async () => {
    const res = ok(await call('GET', `/catalog/products/${tee._id}`), 'product');
    const product = res.product || res;
    const sizes = product.options.find((o) => o.name === 'Size');
    assert.deepEqual(sizes.values.map((v) => v.value), ['S', 'M', 'L', 'XXL']);
});
