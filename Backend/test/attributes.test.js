import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

const ids = {};
let admin;
let seller;

before(async () => {
    const db = await startApp();
    ids.db = db;

    ids.admin = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: ids.admin, email: 'root@example.com', role: 'ADMIN', adminType: 'super_admin', isActive: true,
    });
    ids.subAdmin = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id: ids.subAdmin, email: 'sub@example.com', role: 'ADMIN', adminType: 'sub_admin', isActive: true, permissions: {},
    });
    admin = tokenFor('ADMIN', ids.admin, { adminType: 'super_admin' });

    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const store = await Seller.create({ channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Tee Shop', ownerName: 'Owner', ownerPhone: '9100000001', phone: '9100000001', status: 'approved',
    });
    ids.seller = store._id;
    seller = tokenFor('SELLER', store._id);
});

after(stopApp);

test('admin builds attributes and a set, with the obvious mistakes refused', async () => {
    const size = ok(await call('POST', '/admin/attributes', {
        as: admin, body: { name: 'Size', values: ['S', 'M', 'L'] },
    }), 'create Size', 201).attribute;
    const color = ok(await call('POST', '/admin/attributes', {
        as: admin, body: { name: 'Color', type: 'color', values: [{ value: 'Red', hex: '#D32F2F' }, { value: 'Blue', hex: '#1976d2' }] },
    }), 'create Color', 201).attribute;
    assert.equal(color.values[0].hex, '#d32f2f');
    ids.size = size._id;
    ids.color = color._id;

    const dup = await call('POST', '/admin/attributes', { as: admin, body: { name: 'size' } });
    assert.equal(dup.status, 400);
    assert.match(dup.body.message, /already exists/);

    const badHex = await call('POST', '/admin/attributes', {
        as: admin, body: { name: 'Shade', type: 'color', values: [{ value: 'Teal', hex: 'teal' }] },
    });
    assert.equal(badHex.status, 400);

    const twice = await call('POST', '/admin/attributes', { as: admin, body: { name: 'Fit', values: ['Slim', 'slim'] } });
    assert.equal(twice.status, 400);

    const set = ok(await call('POST', '/admin/attribute-sets', {
        as: admin, body: { name: 'Apparel', attributeIds: [size._id, color._id] },
    }), 'create set', 201).attributeSet;
    ids.set = set._id;

    const inUse = await call('DELETE', `/admin/attributes/${size._id}`, { as: admin });
    assert.equal(inUse.status, 400);
    assert.match(inUse.body.message, /Apparel/);
});

test('a sub-admin without catalogue rights cannot manage attributes', async () => {
    const res = await call('POST', '/admin/attributes', {
        as: tokenFor('ADMIN', ids.subAdmin, { adminType: 'sub_admin' }), body: { name: 'Material' },
    });
    assert.equal(res.status, 403);
});

test('categories carry the set; subcategories inherit it', async () => {
    const tees = ok(await call('POST', '/admin/categories', {
        as: admin, body: { name: 'T-Shirts', attributeSetId: ids.set },
    }), 'create category', 201);
    ids.tees = (tees.category || tees)._id;

    const polos = ok(await call('POST', '/admin/categories', {
        as: admin, body: { name: 'Polos', parentId: ids.tees },
    }), 'create subcategory', 201);
    ids.polos = (polos.category || polos)._id;

    const own = ok(await call('GET', `/catalog/categories/${ids.tees}/attributes`), 'category attributes');
    assert.deepEqual(own.attributes.map((a) => a.name), ['Size', 'Color']);
    const inherited = ok(await call('GET', `/catalog/categories/${ids.polos}/attributes`), 'subcategory attributes');
    assert.equal(inherited.attributeSet.name, 'Apparel');

    const busy = await call('DELETE', `/admin/attribute-sets/${ids.set}`, { as: admin });
    assert.equal(busy.status, 400);
    assert.match(busy.body.message, /T-Shirts/);

    const filters = ok(await call('GET', '/catalog/attributes'), 'public attributes');
    assert.ok(filters.attributes.some((a) => a.name === 'Color'));
});

test('a product in the category must use its attributes, spelled the admin way', async () => {
    const created = ok(await call('POST', '/seller/products', {
        as: seller,
        body: {
            name: 'Polo', categoryId: ids.polos,
            variants: [{ attributes: { size: 'm', COLOR: 'red' }, price: 599 }],
        },
    }), 'create product', 201).product;
    assert.deepEqual(created.variants[0].attributes, [{ name: 'Size', value: 'M' }, { name: 'Color', value: 'Red' }]);
    assert.equal(created.variants[0].name, 'm / red', 'the name is the seller\'s own, attributes are canonical');

    const badValue = await call('POST', '/seller/products', {
        as: seller, body: { name: 'Polo XL', categoryId: ids.polos, variants: [{ attributes: { Size: 'XL' }, price: 1 }] },
    });
    assert.equal(badValue.status, 400);
    assert.match(badValue.body.message, /XL is not a listed Size/);

    const badName = await call('POST', '/seller/products', {
        as: seller, body: { name: 'Polo', categoryId: ids.polos, variants: [{ attributes: { Material: 'Cotton' }, price: 1 }] },
    });
    assert.equal(badName.status, 400);
    assert.match(badName.body.message, /Material is not an option/);
});

test('an FSSAI category needs the seller\'s licence, including its subcategories', async () => {
    const grocery = ok(await call('POST', '/admin/categories', {
        as: admin, body: { name: 'Groceries', requiresFssai: true },
    }), 'create grocery', 201);
    const groceryId = (grocery.category || grocery)._id;
    const dairy = ok(await call('POST', '/admin/categories', {
        as: admin, body: { name: 'Dairy', parentId: groceryId },
    }), 'create dairy', 201);
    const dairyId = (dairy.category || dairy)._id;

    const refused = await call('POST', '/seller/products', {
        as: seller, body: { name: 'Milk', price: 30, categoryId: dairyId },
    });
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /Groceries needs an FSSAI licence/);

    const nextYear = new Date(Date.now() + 365 * 86400000);
    await ids.db.collection('sellers').updateOne(
        { _id: ids.seller }, { $set: { fssaiNumber: '12345678901234', fssaiExpiry: nextYear } },
    );
    ok(await call('POST', '/seller/products', {
        as: seller, body: { name: 'Milk', price: 30, categoryId: dairyId },
    }), 'create with licence', 201);

    await ids.db.collection('sellers').updateOne({ _id: ids.seller }, { $set: { fssaiExpiry: new Date('2020-01-01') } });
    const expired = await call('POST', '/seller/products', {
        as: seller, body: { name: 'Curd', price: 30, categoryId: dairyId },
    });
    assert.equal(expired.status, 400);
    assert.match(expired.body.message, /expired/);
});
