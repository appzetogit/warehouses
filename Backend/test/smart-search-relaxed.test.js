/**
 * Smart search reads some words as filters ("yellow" as Colour = Yellow). When
 * those filters leave nothing, the plain words are tried, so a kurta whose
 * colour is only in its name is still found.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { startApp, stopApp, call, ok } = await import('./helpers/app.js');

before(async () => {
    await startApp();
    const { Attribute } = await import('../src/modules/commerce/admin/models/attribute.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');

    await Product.init(); // the text index search uses
    await Attribute.create({ name: 'Colour', key: 'colour', type: 'color', values: [{ value: 'Yellow', hex: '#f2c230' }, { value: 'Black', hex: '#000000' }], isFilterable: true });
    await Attribute.create({ name: 'Size', key: 'size', type: 'select', values: ['S', 'M', 'L'].map((value) => ({ value })), isFilterable: true });
    const seller = await Seller.create({
        channels: { quick: { status: 'none' }, shop: { status: 'approved' } },
        sellerName: 'The Warehousess', ownerName: 'Owner', ownerPhone: '9300000401', phone: '9300000401', status: 'approved', isActive: true,
        location: { type: 'Point', coordinates: [75.87, 22.71] },
    });
    const sized = (name, extra = {}) => Product.create({
        sellerId: seller._id, name, categoryName: 'Kurtas', price: 1699, mrp: 2000, approvalStatus: 'approved',
        channels: { shop: true, quick: false },
        variants: ['S', 'M'].map((s) => ({ name: s, price: 1699, attributes: [{ name: 'Size', value: s }], stock: { shop: 1, quick: null } })),
        ...extra,
    });
    await sized('Yellow Kurta Sets for Women');
    await sized('Black Kurta Set', {
        variants: [{ name: 'M / Black', price: 999, attributes: [{ name: 'Size', value: 'M' }, { name: 'Colour', value: 'Black' }], stock: { shop: 1, quick: null } }],
    });
});

after(stopApp);

const search = (q) => call('GET', `/catalog/search/products?q=${encodeURIComponent(q)}&smart=1&fulfilmentMode=standard`);

test('a colour word that filters everything out falls back to the plain words', async () => {
    const res = ok(await search('Yellow Kurta Sets'), 'search');
    assert.ok(res.products.some((p) => p.name === 'Yellow Kurta Sets for Women'), 'the yellow kurta is found');
    assert.equal(res.smart.relaxed, true);
});

test('a colour that does match a variant still filters', async () => {
    const res = ok(await search('black kurta'), 'search');
    assert.deepEqual(res.products.map((p) => p.name), ['Black Kurta Set']);
    assert.ok(!res.smart.relaxed);
});
