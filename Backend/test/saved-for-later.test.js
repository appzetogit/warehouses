/**
 * Save for later: a cart line is parked per storefront (shop/quick), leaves
 * the stored cart, and comes back with "move to cart" only if the channel
 * can still sell it (store approved, listed, variant listed, in stock).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

let models;
const ids = {};
let phoneSeq = 0;

const newCustomer = async () => {
    const user = await models.User.create({ name: 'Saver', phone: `94444${String(++phoneSeq).padStart(5, '0')}`, isActive: true });
    return { id: user._id, as: tokenFor('USER', user._id) };
};

const line = (itemId, name, price, quantity, sellerId = ids.a, variantId = '') =>
    ({ itemId: String(itemId), lineItemId: `${itemId}::${variantId || 'base'}`, sellerId: String(sellerId), name, price, quantity, variantId });

before(async () => {
    await startApp();
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { UserCart } = await import('../src/modules/commerce/user/models/userCart.model.js');
    const { SavedForLater } = await import('../src/modules/commerce/user/models/savedForLater.model.js');
    models = { User, Product, Seller, UserCart, SavedForLater };

    const store = (name, phone, channels) => Seller.create({
        channels, sellerName: name, ownerName: 'Owner', ownerPhone: phone, phone, status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
    });
    const both = { quick: { status: 'approved' }, shop: { status: 'approved' } };
    ids.a = (await store('Store A', '9444000001', both))._id;
    ids.b = (await store('Store B', '9444000002', both))._id;
    ids.q = (await store('Quick Only', '9444000003', { quick: { status: 'approved' }, shop: { status: 'none' } }))._id;

    const mk = (doc) => Product.create({ approvalStatus: 'approved', isAvailable: true, sellerId: ids.a, ...doc });
    ids.rice = (await mk({ name: 'Rice', price: 300, stock: { quick: 50, shop: 3 } }))._id;
    ids.soap = (await mk({ name: 'Soap', price: 100, stock: { quick: 5, shop: 0 } }))._id;
    ids.ice = (await mk({ name: 'Ice cream', price: 80, channels: { quick: true, shop: false }, stock: { quick: 10, shop: null } }))._id;
    ids.milk = (await mk({ name: 'Milk', price: 30, sellerId: ids.q, stock: { quick: 10, shop: null } }))._id;
    ids.bread = (await mk({ name: 'Bread', price: 40, sellerId: ids.b, stock: { quick: 10, shop: 10 } }))._id;
    const shirt = await mk({
        name: 'Shirt', price: 500,
        variants: [
            { name: 'M', price: 500, stock: { quick: null, shop: 4 } },
            { name: 'L', price: 520, channels: { quick: null, shop: false } },
        ],
    });
    ids.shirt = shirt._id;
    ids.shirtM = String(shirt.variants[0]._id);
    ids.shirtL = String(shirt.variants[1]._id);
});

after(stopApp);

test('saving a cart line parks it per storefront and takes it out of the stored cart', async () => {
    const buyer = await newCustomer();
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'shop', items: [line(ids.rice, 'Rice', 300, 2), line(ids.bread, 'Bread', 40, 1, ids.b)] } }), 'sync');

    const saved = ok(await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode: 'shop', productId: String(ids.rice), qty: 2 } }), 'save', 201);
    assert.equal(saved.removedFromCart, true);
    assert.equal(saved.item.qty, 2);
    assert.equal(saved.item.name, 'Rice');
    assert.equal(saved.item.available, true);

    const cart = await models.UserCart.findOne({ userId: buyer.id, mode: 'shop' }).lean();
    assert.deepEqual(cart.items.map((i) => i.name), ['Bread']);
    assert.equal(cart.subtotal, 40);

    // Saving the same line again adds up (capped at 99), it doesn't duplicate.
    const again = ok(await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode: 'shop', productId: String(ids.rice), qty: 98 } }), 'save again');
    assert.equal(again.created, false);
    assert.equal(again.item.qty, 99);

    const shop = ok(await call('GET', '/user/saved-for-later?mode=shop', { as: buyer.as }), 'list shop');
    assert.equal(shop.items.length, 1);
    const quick = ok(await call('GET', '/user/saved-for-later?mode=quick', { as: buyer.as }), 'list quick');
    assert.equal(quick.items.length, 0, 'the quick list is separate');

    // Someone else sees nothing; bad input is refused.
    const other = await newCustomer();
    assert.equal(ok(await call('GET', '/user/saved-for-later?mode=shop', { as: other.as }), 'other').items.length, 0);
    assert.equal((await call('POST', '/user/saved-for-later', { as: buyer.as, body: { productId: String(ids.rice) } })).status, 400, 'mode required');
    assert.equal((await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode: 'shop', productId: 'nope' } })).status, 400);
    assert.equal((await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode: 'shop', productId: String(ids.rice), qty: 0 } })).status, 400);
    assert.equal((await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode: 'shop', productId: String(ids.rice), variantId: ids.shirtM } })).status, 400, 'variant of another product');
    assert.equal((await call('GET', '/user/saved-for-later?mode=shop')).status, 401);
});

test('move to cart re-validates the line for the channel', async () => {
    const buyer = await newCustomer();
    const save = async (mode, productId, variantId = '', qty = 1) =>
        ok(await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode, productId: String(productId), variantId, qty } }), `save ${productId}`, 201).item;

    const soap = await save('shop', ids.soap);
    const ice = await save('shop', ids.ice);
    const milk = await save('shop', ids.milk);
    const shirtL = await save('shop', ids.shirt, ids.shirtL);
    const shirtNoOption = await save('shop', ids.shirt);

    const list = ok(await call('GET', '/user/saved-for-later?mode=shop', { as: buyer.as }), 'list');
    const reasons = Object.fromEntries(list.items.map((i) => [i.id, i.reason]));
    assert.deepEqual(
        [reasons[soap.id], reasons[ice.id], reasons[milk.id], reasons[shirtL.id], reasons[shirtNoOption.id]],
        ['out_of_stock', 'not_in_channel', 'seller_not_approved', 'variant_not_in_channel', 'variant_required'],
    );

    for (const [item, reason] of [[soap, 'out_of_stock'], [ice, 'not_in_channel'], [milk, 'seller_not_approved'], [shirtL, 'variant_not_in_channel']]) {
        const res = await call('POST', `/user/saved-for-later/${item.id}/move-to-cart`, { as: buyer.as });
        assert.equal(res.status, 400, item.name);
        assert.equal(res.body.data.reason, reason);
    }
    assert.equal(ok(await call('GET', '/user/saved-for-later?mode=shop', { as: buyer.as }), 'list').items.length, 5, 'refused lines stay saved');

    // The same products are fine in quick, which has its own listing and stock.
    const quickSoap = await save('quick', ids.soap, '', 2);
    const moved = ok(await call('POST', `/user/saved-for-later/${quickSoap.id}/move-to-cart`, { as: buyer.as }), 'move quick soap');
    assert.equal(moved.line.quantity, 2);
    assert.equal(moved.line.lineItemId, `${ids.soap}::base`);
    assert.equal(moved.cart.mode, 'quick');

    // A shop line comes back capped to the channel stock, with the current price.
    const rice = await save('shop', ids.rice, '', 7);
    const movedRice = ok(await call('POST', `/user/saved-for-later/${rice.id}/move-to-cart`, { as: buyer.as }), 'move rice');
    assert.equal(movedRice.line.quantity, 3);
    assert.equal(movedRice.line.quantityReduced, true);
    assert.equal(movedRice.line.price, 300);
    const shirtM = await save('shop', ids.shirt, ids.shirtM, 1);
    ok(await call('POST', `/user/saved-for-later/${shirtM.id}/move-to-cart`, { as: buyer.as }), 'move shirt M');
    const cart = ok(await call('GET', '/user/cart?mode=shop', { as: buyer.as }), 'cart');
    assert.deepEqual(cart.items.map((i) => [i.name, i.quantity, i.variantId || '']).sort(), [['Rice', 3, ''], ['Shirt', 1, ids.shirtM]]);

    // Moved once: a repeat finds nothing.
    assert.equal((await call('POST', `/user/saved-for-later/${rice.id}/move-to-cart`, { as: buyer.as })).status, 404);
});

test('a quick cart holds one store, so a line from another store is refused', async () => {
    const buyer = await newCustomer();
    ok(await call('PUT', '/user/cart', { as: buyer.as, body: { mode: 'quick', items: [line(ids.rice, 'Rice', 300, 1)] } }), 'sync quick');
    const bread = ok(await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode: 'quick', productId: String(ids.bread) } }), 'save', 201).item;
    const res = await call('POST', `/user/saved-for-later/${bread.id}/move-to-cart`, { as: buyer.as });
    assert.equal(res.status, 409);
    assert.equal(res.body.data.reason, 'seller_mismatch');
    assert.equal(ok(await call('GET', '/user/saved-for-later?mode=quick', { as: buyer.as }), 'still saved').items.length, 1);
});

test('remove deletes only your own saved line', async () => {
    const buyer = await newCustomer();
    const other = await newCustomer();
    const item = ok(await call('POST', '/user/saved-for-later', { as: buyer.as, body: { mode: 'shop', productId: String(ids.rice) } }), 'save', 201).item;
    assert.equal((await call('DELETE', `/user/saved-for-later/${item.id}`, { as: other.as })).status, 404);
    assert.equal((await call('POST', `/user/saved-for-later/${item.id}/move-to-cart`, { as: other.as })).status, 404);
    ok(await call('DELETE', `/user/saved-for-later/${item.id}`, { as: buyer.as }), 'remove');
    assert.equal((await call('DELETE', `/user/saved-for-later/${item.id}`, { as: buyer.as })).status, 404);
    assert.equal(await models.SavedForLater.countDocuments({ userId: buyer.id }), 0);
});
