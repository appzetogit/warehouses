/**
 * Category offers: a seller's "20% off Kurtas".
 *
 * Still a coupon, never a price change, so nothing goes back to approval. Only
 * the seller's lines in the offer's categories (or their subcategories) count:
 * the discount, the minimum order and the cap are all taken against them.
 * An auto-apply offer needs no code and joins the first-order offers in the
 * automatic best-offer pick.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';

const ZONE = [
    { latitude: 12.90, longitude: 77.55 },
    { latitude: 12.90, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.55 },
];
const SELLER_AT = { lat: 12.9716, lng: 77.5946 };
const CUSTOMER_AT = { lat: 12.9352, lng: 77.6245 };
const address = {
    label: 'Home', street: '1 Test Road', city: 'Bengaluru', state: 'KA',
    latitude: CUSTOMER_AT.lat, longitude: CUSTOMER_AT.lng,
    location: { type: 'Point', coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] },
};

const ids = {};
let models;
let db;
let phoneSeq = 0;

const newCustomer = async () => {
    const user = await models.User.create({ name: 'Buyer', phone: `92222${String(++phoneSeq).padStart(5, '0')}`, isActive: true });
    return { id: user._id, as: tokenFor('USER', user._id) };
};

before(async () => {
    db = await startApp();
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Category } = await import('../src/modules/commerce/admin/models/category.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { Offer } = await import('../src/modules/commerce/admin/models/offer.model.js');
    models = { Product, Offer, User };

    const zone = await Zone.create({ name: 'Offer Zone', country: 'India', coordinates: ZONE, isActive: true });
    ids.zone = zone._id;
    const store = (name, phone) => Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: name, ownerName: 'Owner', ownerPhone: phone, phone, status: 'approved',
        isAcceptingOrders: true, zoneId: zone._id,
        location: { type: 'Point', coordinates: [SELLER_AT.lng, SELLER_AT.lat], latitude: SELLER_AT.lat, longitude: SELLER_AT.lng },
    });
    ids.a = (await store('Store A', '9222000001'))._id;
    ids.b = (await store('Store B', '9222000002'))._id;

    ids.ethnic = (await Category.create({ name: 'Ethnic Wear' }))._id;
    ids.kurtas = (await Category.create({ name: 'Kurtas', parentId: ids.ethnic }))._id;
    ids.tops = (await Category.create({ name: 'Tops' }))._id;
    ids.unused = (await Category.create({ name: 'Sarees' }))._id;
    ids.inactive = (await Category.create({ name: 'Old Stock', isActive: false }))._id;

    const product = (sellerId, name, price, categoryId) => Product.create({
        sellerId, name, price, categoryId, stock: { quick: 50 }, isAvailable: true, approvalStatus: 'approved',
    });
    ids.kurta = (await product(ids.a, 'Kurta', 1000, ids.kurtas))._id;
    ids.kurta500 = (await product(ids.a, 'Short Kurta', 500, ids.kurtas))._id;
    ids.top = (await product(ids.a, 'Top', 500, ids.tops))._id;
    ids.top900 = (await product(ids.a, 'Long Top', 900, ids.tops))._id;
    ids.bKurta = (await product(ids.b, 'B Kurta', 1000, ids.kurtas))._id;
    // Seller A has a product in the inactive category too, so only "inactive" refuses it.
    await product(ids.a, 'Old Kurta', 100, ids.inactive);
});

after(stopApp);

const line = (itemId, sellerId = ids.a, quantity = 1) => ({ itemId: String(itemId), sellerId: String(sellerId), name: 'Item', price: 1, quantity });

/** One store's quote, as the cart shows it. */
const quote = async (who, items, couponCode) => ok(await call('POST', '/orders/calculate', {
    as: who.as,
    body: {
        sellerId: String(ids.a), items, zoneId: String(ids.zone),
        deliveryAddress: { location: { coordinates: [CUSTOMER_AT.lng, CUSTOMER_AT.lat] } },
        ...(couponCode ? { couponCode } : {}),
    },
}), 'calculate').pricing;

const sellerOffer = (extra) => models.Offer.create({
    discountType: 'percentage', discountValue: 20, maxDiscount: 10000, status: 'active', showInCart: true,
    sellerScope: 'selected', sellerId: ids.a, sellerIds: [ids.a], createdByRole: 'SELLER',
    adminBearPercentage: 0, sellerBearPercentage: 100, categoryIds: [ids.kurtas],
    ...extra,
});

const productSnapshot = async () => (await models.Product.find({ sellerId: ids.a }).select('price approvalStatus').sort({ _id: 1 }).lean())
    .map((p) => [String(p._id), p.price, p.approvalStatus]);

test('a seller creates a category offer: categories are checked, prices and approval are untouched', async () => {
    const seller = tokenFor('SELLER', ids.a);
    const before = await productSnapshot();
    const body = (code, categoryIds, extra = {}) => ({
        couponCode: code, discountType: 'percentage', discountValue: 20, maxDiscount: 10000, categoryIds, ...extra,
    });

    const created = ok(await call('POST', '/seller/my-offers', { as: seller, body: body('kurta20', [String(ids.kurtas)]) }), 'create', 201).doc;
    assert.deepEqual(created.categoryIds.map(String), [String(ids.kurtas)]);
    assert.equal(created.autoApply, false);
    assert.equal(created.sellerScope, 'selected');
    assert.equal(created.createdByRole, 'SELLER');
    assert.equal(created.sellerBearPercentage, 100);

    // A parent category counts when the seller sells in one of its children.
    ok(await call('POST', '/seller/my-offers', { as: seller, body: body('ETHNIC10', [String(ids.ethnic)], { discountValue: 10 }) }), 'parent', 201);

    const none = await call('POST', '/seller/my-offers', { as: seller, body: body('SAREE20', [String(ids.unused)]) });
    assert.equal(none.status, 400, 'no products in that category');
    const inactive = await call('POST', '/seller/my-offers', { as: seller, body: body('OLD20', [String(ids.inactive)]) });
    assert.equal(inactive.status, 400, 'inactive category');
    const missing = await call('POST', '/seller/my-offers', { as: seller, body: body('GONE20', [String(new mongoose.Types.ObjectId())]) });
    assert.equal(missing.status, 400, 'unknown category');
    const bogus = await call('POST', '/seller/my-offers', { as: seller, body: body('BAD20', ['not-an-id']) });
    assert.equal(bogus.status, 400, 'malformed id');

    const list = ok(await call('GET', '/seller/my-offers', { as: seller }), 'list').offers;
    const listed = list.find((o) => o.couponCode === 'KURTA20');
    assert.deepEqual(listed.categoryIds, [String(ids.kurtas)]);
    assert.equal(listed.autoApply, false);

    const updated = ok(await call('PATCH', `/seller/my-offers/${listed.id}`, { as: seller, body: { autoApply: true, categoryIds: [String(ids.kurtas), String(ids.tops)] } }), 'update').doc;
    assert.equal(updated.autoApply, true);
    assert.deepEqual(updated.categoryIds, [String(ids.kurtas), String(ids.tops)]);
    const badUpdate = await call('PATCH', `/seller/my-offers/${listed.id}`, { as: seller, body: { categoryIds: [String(ids.unused)] } });
    assert.equal(badUpdate.status, 400);
    const otherSeller = await call('PATCH', `/seller/my-offers/${listed.id}`, { as: tokenFor('SELLER', ids.b), body: { autoApply: false } });
    assert.equal(otherSeller.status, 404, 'only the owner may change it');

    ok(await call('DELETE', `/seller/my-offers/${listed.id}`, { as: seller }), 'delete');
    const ethnic = await models.Offer.findOne({ couponCode: 'ETHNIC10' });
    ok(await call('DELETE', `/seller/my-offers/${ethnic._id}`, { as: seller }), 'delete');
    assert.deepEqual(await productSnapshot(), before, 'creating, editing and deleting offers changes no product');
});

test('20% on Kurtas discounts only the Kurta: Kurta 1000 + Top 500 gets 200 off', async () => {
    await sellerOffer({ couponCode: 'KURTAS20' });
    const buyer = await newCustomer();
    const p = await quote(buyer, [line(ids.kurta), line(ids.top)], 'KURTAS20');
    assert.equal(p.subtotal, 1500);
    assert.equal(p.discount, 200);
    assert.equal(p.couponCode, 'KURTAS20');
    assert.equal(p.appliedCoupon.code, 'KURTAS20');
    assert.deepEqual(p.appliedCoupon.categoryIds, [String(ids.kurtas)]);
    assert.deepEqual(p.appliedCoupon.categoryNames, ['Kurtas']);
    assert.equal(p.appliedCoupon.isAutoApplied, false);
});

test('an offer on a parent category covers its subcategories', async () => {
    await sellerOffer({ couponCode: 'ETHNIC15', discountValue: 15, categoryIds: [ids.ethnic] });
    const p = await quote(await newCustomer(), [line(ids.kurta), line(ids.top)], 'ETHNIC15');
    assert.equal(p.discount, 150, '15% of the Kurta only');
});

test('the minimum order, the cap and the base are all the category lines', async () => {
    await sellerOffer({ couponCode: 'KURTAMIN', minOrderValue: 800 });
    const buyer = await newCustomer();
    const below = await quote(buyer, [line(ids.kurta500), line(ids.top900)], 'KURTAMIN');
    assert.equal(below.subtotal, 1400, 'the cart is over 800...');
    assert.equal(below.discount, 0, '...but its Kurtas are not');
    assert.equal(below.appliedCoupon, null);

    await sellerOffer({ couponCode: 'KURTACAP', maxDiscount: 150 });
    assert.equal((await quote(buyer, [line(ids.kurta), line(ids.top)], 'KURTACAP')).discount, 150, 'capped');

    await sellerOffer({ couponCode: 'KURTAFLAT', discountType: 'flat-price', discountValue: 1400, maxDiscount: null });
    assert.equal((await quote(buyer, [line(ids.kurta), line(ids.top)], 'KURTAFLAT')).discount, 1000, 'never more than the Kurtas');

    const noKurta = await quote(buyer, [line(ids.top)], 'KURTAS20');
    assert.equal(noKurta.discount, 0, 'no Kurta in the cart, no discount');
});

test("in a multi-store cart seller A's Kurta offer ignores seller B's Kurtas", async () => {
    const buyer = await newCustomer();
    const res = ok(await call('POST', '/orders/checkout/calculate', {
        as: buyer.as,
        body: {
            items: [line(ids.kurta, ids.a), line(ids.top, ids.a), line(ids.bKurta, ids.b)],
            deliveryAddress: address, fulfilmentMode: 'quick', couponCode: 'KURTAS20',
        },
    }), 'checkout quote');
    assert.equal(res.subtotal, 2500);
    assert.equal(res.discount, 200, "20% of A's Kurta only");
    const shares = Object.fromEntries(res.childPricings.map((c) => [c.sellerId, c.couponShare]));
    assert.equal(shares[String(ids.a)], 200);
    assert.equal(shares[String(ids.b)], 0);
    assert.deepEqual(res.appliedCoupon.categoryIds, [String(ids.kurtas)]);
});

test('expired, paused and used-up category offers are refused as before', async () => {
    const yesterday = new Date(Date.now() - 2 * 86400000);
    await sellerOffer({ couponCode: 'KURTAOLD', endDate: yesterday });
    await sellerOffer({ couponCode: 'KURTAPAUSED', status: 'paused' });
    await sellerOffer({ couponCode: 'KURTAUSED', usageLimit: 1, usedCount: 1 });
    const buyer = await newCustomer();
    for (const code of ['KURTAOLD', 'KURTAPAUSED', 'KURTAUSED']) {
        const p = await quote(buyer, [line(ids.kurta), line(ids.top)], code);
        assert.equal(p.discount, 0, code);
        assert.equal(p.appliedCoupon, null, code);
    }
});

test('an auto-apply offer needs no code, and the best of it and a first-order offer wins', async () => {
    const auto = await sellerOffer({ couponCode: 'AUTOKURTA', discountValue: 15, autoApply: true });
    const extras = [];
    try {
        // A returning customer gets it too: auto-apply is not a first-order perk.
        const returning = await newCustomer();
        await db.collection('orders').insertOne({ userId: returning.id, orderStatus: 'delivered', createdAt: new Date() });
        let p = await quote(returning, [line(ids.kurta), line(ids.top)]);
        assert.equal(p.discount, 150);
        assert.equal(p.couponCode, 'AUTOKURTA');
        assert.equal(p.appliedCoupon.isAutoApplied, true);

        // No Kurta, nothing to apply.
        p = await quote(returning, [line(ids.top)]);
        assert.equal(p.discount, 0);
        assert.equal(p.appliedCoupon, null);

        // First order: 150 off Kurtas beats a 100 first-order offer...
        extras.push(await models.Offer.create({
            couponCode: 'FIRST100', discountType: 'flat-price', discountValue: 100, customerScope: 'first-time',
            status: 'active', showInCart: true,
        }));
        p = await quote(await newCustomer(), [line(ids.kurta), line(ids.top)]);
        assert.equal(p.couponCode, 'AUTOKURTA');
        assert.equal(p.discount, 150);

        // ...and loses to a 300 one. A returning customer still gets only the auto-apply one.
        extras.push(await models.Offer.create({
            couponCode: 'FIRST300', discountType: 'flat-price', discountValue: 300, customerScope: 'first-time',
            status: 'active', showInCart: true,
        }));
        p = await quote(await newCustomer(), [line(ids.kurta), line(ids.top)]);
        assert.equal(p.couponCode, 'FIRST300');
        assert.equal(p.discount, 300);
        assert.equal(p.appliedCoupon.firstOrder, true);
        p = await quote(returning, [line(ids.kurta), line(ids.top)]);
        assert.equal(p.couponCode, 'AUTOKURTA');

        // A paused auto-apply offer is not applied.
        await models.Offer.updateOne({ _id: auto._id }, { $set: { status: 'paused' } });
        p = await quote(returning, [line(ids.kurta), line(ids.top)]);
        assert.equal(p.discount, 0);
    } finally {
        await models.Offer.deleteMany({ _id: { $in: [auto._id, ...extras.map((o) => o._id)] } });
    }
});

test('a whole-cart coupon (no categories) discounts the whole store as before', async () => {
    await sellerOffer({ couponCode: 'STOREWIDE', categoryIds: [], discountType: 'flat-price', discountValue: 100, maxDiscount: null });
    const p = await quote(await newCustomer(), [line(ids.kurta), line(ids.top)], 'STOREWIDE');
    assert.equal(p.discount, 100);
    assert.equal(p.appliedCoupon.categoryIds, null);
    assert.deepEqual(p.appliedCoupon.sellerIds, [String(ids.a)]);

    await sellerOffer({ couponCode: 'STORE10', categoryIds: [], discountValue: 10 });
    assert.equal((await quote(await newCustomer(), [line(ids.kurta), line(ids.top)], 'STORE10')).discount, 150);
});
