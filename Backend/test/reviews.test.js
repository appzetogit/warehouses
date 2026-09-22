/**
 * Product reviews: only customers with a delivered order containing the
 * product can review it, once (editable); the product's rating, count and
 * star histogram are recomputed on the server (and follow hide/unhide);
 * "helpful" counts once per customer; the seller replies once; moderation
 * is admin-only and follows the product_management permission.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { startApp, stopApp, tokenFor, call, ok } = await import('./helpers/app.js');

let db;
let models;
const ids = {};
let phoneSeq = 0;

const address = { street: '1 Test Road', city: 'Bengaluru', state: 'KA' };

const newCustomer = async (name = 'Priya Sharma') => {
    const user = await models.User.create({ name, phone: `93333${String(++phoneSeq).padStart(5, '0')}`, isActive: true });
    return { id: user._id, as: tokenFor('USER', user._id) };
};

const deliver = (userId, productId, { status = 'delivered', variantId = '', mode = 'standard' } = {}) => models.Order.create({
    userId,
    sellerId: ids.seller,
    fulfilmentMode: mode,
    orderStatus: status,
    items: [{ itemId: String(productId), name: 'Thing', price: 100, quantity: 1, variantId }],
    deliveryAddress: address,
});

const product = async (id) => models.Product.findById(id).select('rating totalRatings ratingHistogram').lean();

const adminWith = async (permissions, adminType = 'sub_admin') => {
    const _id = new mongoose.Types.ObjectId();
    await db.collection('admins').insertOne({
        _id, email: `${_id}@example.com`, password: 'x', role: 'ADMIN', adminType, permissions, isActive: true, isDeleted: false,
    });
    return tokenFor('ADMIN', _id, { adminType });
};

before(async () => {
    db = await startApp();
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { User } = await import('../src/core/users/user.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');
    models = { Product, User, Order };

    const both = { quick: { status: 'approved' }, shop: { status: 'approved' } };
    const mk = (name, phone) => Seller.create({
        channels: both, sellerName: name, ownerName: 'Owner', ownerPhone: phone, phone, status: 'approved',
        location: { type: 'Point', coordinates: [77.59, 12.97], latitude: 12.97, longitude: 77.59 },
    });
    ids.seller = (await mk('Review Store', '9333000001'))._id;
    ids.otherSeller = (await mk('Other Store', '9333000002'))._id;
    const p = await Product.create({
        sellerId: ids.seller, name: 'Kettle', price: 900, approvalStatus: 'approved',
        variants: [{ name: 'Red', price: 900 }, { name: 'Blue', price: 950 }],
    });
    ids.kettle = p._id;
    ids.red = String(p.variants[0]._id);
    ids.blue = String(p.variants[1]._id);
    ids.mug = (await Product.create({ sellerId: ids.seller, name: 'Mug', price: 200, approvalStatus: 'approved' }))._id;
    ids.lamp = (await Product.create({ sellerId: ids.seller, name: 'Lamp', price: 500, approvalStatus: 'approved' }))._id;

    ids.sellerToken = tokenFor('SELLER', ids.seller);
    ids.otherSellerToken = tokenFor('SELLER', ids.otherSeller);
    ids.superAdmin = await adminWith({}, 'super_admin');
});

after(stopApp);

test('only a customer with a delivered order containing the product may review it', async () => {
    const buyer = await newCustomer();
    const body = { rating: 5, title: 'Great', text: 'Boils fast' };

    // No order at all, then an order that is not delivered yet.
    let res = await call('PUT', `/user/reviews/products/${ids.mug}`, { as: buyer.as, body });
    assert.equal(res.status, 403);
    await deliver(buyer.id, ids.mug, { status: 'confirmed' });
    res = await call('PUT', `/user/reviews/products/${ids.mug}`, { as: buyer.as, body });
    assert.equal(res.status, 403, 'a confirmed order is not enough');
    const notYet = ok(await call('GET', `/user/reviews/eligibility/${ids.mug}`, { as: buyer.as }), 'eligibility');
    assert.equal(notYet.eligible, false);
    assert.equal(notYet.reason, 'not_delivered');

    // A delivered order of a different product doesn't count either.
    await deliver(buyer.id, ids.lamp);
    assert.equal((await call('PUT', `/user/reviews/products/${ids.mug}`, { as: buyer.as, body })).status, 403);

    await deliver(buyer.id, ids.mug);
    const yes = ok(await call('GET', `/user/reviews/eligibility/${ids.mug}`, { as: buyer.as }), 'eligibility');
    assert.equal(yes.eligible, true);
    assert.equal(yes.review, null);
    const created = ok(await call('PUT', `/user/reviews/products/${ids.mug}`, { as: buyer.as, body }), 'create', 201);
    assert.equal(created.review.rating, 5);
    assert.equal(created.review.channel, 'shop', 'recorded against the delivered order\'s channel');

    // Validation.
    for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: 4, images: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `https://cdn/${x}.jpg`) }, { rating: 4, images: ['javascript:alert(1)'] }]) {
        assert.equal((await call('PUT', `/user/reviews/products/${ids.mug}`, { as: buyer.as, body: bad })).status, 400, JSON.stringify(bad));
    }
    // Not signed in / wrong role.
    assert.equal((await call('PUT', `/user/reviews/products/${ids.mug}`, { body })).status, 401);
    assert.equal((await call('PUT', `/user/reviews/products/${ids.mug}`, { as: ids.sellerToken, body })).status, 403);
});

test('one review per customer per product: a second write edits it', async () => {
    const buyer = await newCustomer();
    await deliver(buyer.id, ids.kettle, { variantId: ids.red });
    ok(await call('PUT', `/user/reviews/products/${ids.kettle}`, { as: buyer.as, body: { rating: 2, text: 'Leaks', variantId: ids.red } }), 'create', 201);
    const edited = ok(await call('PUT', `/user/reviews/products/${ids.kettle}`, {
        as: buyer.as, body: { rating: 4, text: 'Replaced, fine now', images: ['https://cdn.example/a.jpg', '/uploads/b.jpg'], variantId: ids.red },
    }), 'edit');
    assert.equal(edited.created, false);
    assert.equal(edited.review.rating, 4);
    assert.equal(edited.review.variantName, 'Red');
    assert.equal(edited.review.edited, true);
    assert.equal(edited.review.images.length, 2);
    const { ProductReview } = await import('../src/modules/commerce/reviews/models/productReview.model.js');
    assert.equal(await ProductReview.countDocuments({ productId: ids.kettle, userId: buyer.id }), 1);

    // An option they never received is refused.
    const res = await call('PUT', `/user/reviews/products/${ids.kettle}`, { as: buyer.as, body: { rating: 4, variantId: ids.blue } });
    assert.equal(res.status, 400);

    const mine = ok(await call('GET', `/user/reviews?productIds=${ids.kettle}`, { as: buyer.as }), 'mine');
    assert.equal(mine.reviews.length, 1);
    assert.equal(mine.reviews[0].productName, 'Kettle');
});

test('aggregates are recomputed on the server, follow hide/unhide/delete and reach the catalogue', async () => {
    const { Product } = models;
    const lampId = (await Product.create({ sellerId: ids.seller, name: 'Desk Lamp', price: 700, approvalStatus: 'approved', rating: 4.9, totalRatings: 999 }))._id;
    const buyers = [await newCustomer('Asha K'), await newCustomer('Ben L'), await newCustomer('Chen M')];
    const stars = [5, 3, 4];
    const reviewIds = [];
    for (let i = 0; i < buyers.length; i += 1) {
        await deliver(buyers[i].id, lampId);
        // A client-sent rating/total is ignored.
        const r = ok(await call('PUT', `/user/reviews/products/${lampId}`, {
            as: buyers[i].as, body: { rating: stars[i], totalRatings: 1000, averageRating: 5 },
        }), 'review', 201);
        reviewIds.push(r.review.id);
    }
    let p = await product(lampId);
    assert.equal(p.totalRatings, 3);
    assert.equal(p.rating, 4);
    assert.deepEqual(p.ratingHistogram, [0, 0, 1, 1, 1]);

    // Editing moves the review between buckets.
    ok(await call('PUT', `/user/reviews/products/${lampId}`, { as: buyers[1].as, body: { rating: 1 } }), 'edit');
    p = await product(lampId);
    assert.deepEqual(p.ratingHistogram, [1, 0, 0, 1, 1]);
    assert.equal(p.rating, 3.33);

    // Hide takes it out; unhide puts it back.
    ok(await call('PATCH', `/admin/product-reviews/${reviewIds[1]}/hide`, { as: ids.superAdmin, body: { reason: 'Abusive language' } }), 'hide');
    p = await product(lampId);
    assert.equal(p.totalRatings, 2);
    assert.equal(p.rating, 4.5);
    assert.deepEqual(p.ratingHistogram, [0, 0, 0, 1, 1]);

    const pub = ok(await call('GET', `/catalog/products/${lampId}/reviews`), 'public list');
    assert.equal(pub.reviews.length, 2, 'hidden reviews are not shown');
    assert.deepEqual(pub.summary, { averageRating: 4.5, totalRatings: 2, histogram: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } });
    assert.equal(pub.reviews[0].author.name.endsWith('.'), true, 'surname shortened');

    const detail = ok(await call('GET', `/catalog/products/${lampId}`), 'product');
    assert.equal(detail.product.rating, 4.5);
    assert.equal(detail.product.averageRating, 4.5);
    assert.equal(detail.product.totalRatings, 2);
    assert.deepEqual(detail.product.ratingHistogram, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });

    ok(await call('PATCH', `/admin/product-reviews/${reviewIds[1]}/unhide`, { as: ids.superAdmin, body: {} }), 'unhide');
    p = await product(lampId);
    assert.equal(p.totalRatings, 3);
    assert.deepEqual(p.ratingHistogram, [1, 0, 0, 1, 1]);

    // Delete needs a reason, then drops it for good; the customer can't post it again.
    assert.equal((await call('DELETE', `/admin/product-reviews/${reviewIds[0]}`, { as: ids.superAdmin })).status, 400);
    ok(await call('DELETE', `/admin/product-reviews/${reviewIds[0]}`, { as: ids.superAdmin, body: { reason: 'Spam' } }), 'delete');
    p = await product(lampId);
    assert.equal(p.totalRatings, 2);
    assert.deepEqual(p.ratingHistogram, [1, 0, 0, 1, 0]);
    assert.equal((await call('PUT', `/user/reviews/products/${lampId}`, { as: buyers[0].as, body: { rating: 5 } })).status, 403);
    const elig = ok(await call('GET', `/user/reviews/eligibility/${lampId}`, { as: buyers[0].as }), 'eligibility');
    assert.equal(elig.reason, 'removed');

    // A customer deleting their own review recomputes too.
    ok(await call('DELETE', `/user/reviews/products/${lampId}`, { as: buyers[2].as }), 'own delete');
    p = await product(lampId);
    assert.equal(p.totalRatings, 1);
    assert.equal(p.rating, 1);

    const list = ok(await call('GET', `/catalog/products?fulfilmentMode=standard&sellerId=${ids.seller}`), 'list');
    const row = list.products.find((x) => String(x._id) === String(lampId));
    assert.equal(row.rating, 1);
    assert.equal(row.totalRatings, 1);
});

test('"helpful" counts once per customer, not on your own review, and sorts the list', async () => {
    const pid = (await models.Product.create({ sellerId: ids.seller, name: 'Tea', price: 50, approvalStatus: 'approved' }))._id;
    const author = await newCustomer('Author A');
    const early = await newCustomer('Early E');
    await deliver(author.id, pid);
    await deliver(early.id, pid);
    const first = ok(await call('PUT', `/user/reviews/products/${pid}`, { as: early.as, body: { rating: 3, text: 'ok' } }), 'first', 201).review;
    const second = ok(await call('PUT', `/user/reviews/products/${pid}`, { as: author.as, body: { rating: 5, text: 'lovely' } }), 'second', 201).review;

    const voter = await newCustomer('Voter V');
    const v1 = ok(await call('POST', `/user/reviews/${first.id}/helpful`, { as: voter.as }), 'vote');
    assert.equal(v1.helpfulCount, 1);
    const v2 = ok(await call('POST', `/user/reviews/${first.id}/helpful`, { as: voter.as }), 'vote again');
    assert.equal(v2.helpfulCount, 1, 'a second vote is not counted');
    assert.equal(v2.counted, false);
    await Promise.all([1, 2, 3].map(() => call('POST', `/user/reviews/${first.id}/helpful`, { as: voter.as })));
    const { ProductReview } = await import('../src/modules/commerce/reviews/models/productReview.model.js');
    assert.equal((await ProductReview.findById(first.id).lean()).helpfulCount, 1, 'concurrent repeats still count once');

    assert.equal((await call('POST', `/user/reviews/${second.id}/helpful`, { as: author.as })).status, 400, 'not your own');

    const newest = ok(await call('GET', `/catalog/products/${pid}/reviews?sort=newest`, { as: voter.as }), 'newest');
    assert.deepEqual(newest.reviews.map((r) => r.id), [second.id, first.id]);
    const helpful = ok(await call('GET', `/catalog/products/${pid}/reviews?sort=helpful`, { as: voter.as }), 'helpful');
    assert.deepEqual(helpful.reviews.map((r) => r.id), [first.id, second.id]);
    assert.equal(helpful.reviews[0].votedHelpful, true);
    assert.equal(helpful.reviews[1].votedHelpful, false);

    const unvote = ok(await call('DELETE', `/user/reviews/${first.id}/helpful`, { as: voter.as }), 'unvote');
    assert.equal(unvote.helpfulCount, 0);
    const again = ok(await call('DELETE', `/user/reviews/${first.id}/helpful`, { as: voter.as }), 'unvote again');
    assert.equal(again.helpfulCount, 0);

    const asAuthor = ok(await call('GET', `/catalog/products/${pid}/reviews`, { as: author.as }), 'author view');
    assert.equal(asAuthor.myReview.id, second.id);
    assert.equal(asAuthor.reviews.find((r) => r.id === second.id).isMine, true);
});

test('the seller sees their products\' reviews and replies once; other sellers cannot', async () => {
    const buyer = await newCustomer('Dev R');
    await deliver(buyer.id, ids.lamp);
    const review = ok(await call('PUT', `/user/reviews/products/${ids.lamp}`, { as: buyer.as, body: { rating: 2, text: 'Dim' } }), 'review', 201).review;

    const list = ok(await call('GET', '/seller/reviews?replied=false', { as: ids.sellerToken }), 'seller list');
    assert.ok(list.reviews.some((r) => r.id === review.id));
    assert.ok(list.summary.awaitingReply >= 1);
    assert.equal(list.reviews.find((r) => r.id === review.id).customerName, 'Dev R.');
    assert.equal(ok(await call('GET', '/seller/reviews', { as: ids.otherSellerToken }), 'other').reviews.length, 0);

    assert.equal((await call('POST', `/seller/reviews/${review.id}/reply`, { as: ids.otherSellerToken, body: { text: 'Hi' } })).status, 404);
    assert.equal((await call('POST', `/seller/reviews/${review.id}/reply`, { as: ids.sellerToken, body: { text: '' } })).status, 400);
    const reply = ok(await call('POST', `/seller/reviews/${review.id}/reply`, { as: ids.sellerToken, body: { text: 'Sorry, sending a brighter bulb' } }), 'reply', 201);
    assert.equal(reply.reply.text, 'Sorry, sending a brighter bulb');
    assert.equal((await call('POST', `/seller/reviews/${review.id}/reply`, { as: ids.sellerToken, body: { text: 'Again' } })).status, 409);

    const pub = ok(await call('GET', `/catalog/products/${ids.lamp}/reviews`), 'public');
    assert.equal(pub.reviews.find((r) => r.id === review.id).reply.text, 'Sorry, sending a brighter bulb');
    const replied = ok(await call('GET', '/seller/reviews?replied=true', { as: ids.sellerToken }), 'replied');
    assert.ok(replied.reviews.every((r) => r.reply));

    // The seller can report it for moderation (once), not hide it.
    ok(await call('POST', `/seller/reviews/${review.id}/report`, { as: ids.sellerToken, body: { reason: 'Fake' } }), 'report');
    const twice = ok(await call('POST', `/seller/reviews/${review.id}/report`, { as: ids.sellerToken, body: { reason: 'Fake' } }), 'report again');
    assert.equal(twice.alreadyReported, true);
    assert.equal((await call('PATCH', `/admin/product-reviews/${review.id}/hide`, { as: ids.sellerToken, body: { reason: 'x' } })).status, 403);
    const reported = ok(await call('GET', '/admin/product-reviews?status=reported', { as: ids.superAdmin }), 'reported');
    const row = reported.reviews.find((r) => r.id === review.id);
    assert.equal(row.reportCount, 1);
    assert.equal(row.sellerName, 'Review Store');
});

test('moderation follows product_management permissions and the panel filter', async () => {
    const buyer = await newCustomer('Eve Q');
    await deliver(buyer.id, ids.mug, { mode: 'quick' });
    const review = ok(await call('PUT', `/user/reviews/products/${ids.mug}`, { as: buyer.as, body: { rating: 1, text: 'rude words' } }), 'review', 201).review;
    assert.equal(review.channel, 'quick');

    const none = await adminWith({ order_management: ['view'] });
    const viewer = await adminWith({ product_management: ['view'] });
    const editor = await adminWith({ product_management: ['view', 'edit'] });
    const deleter = await adminWith({ product_management: ['view', 'delete'] });

    assert.equal((await call('GET', '/admin/product-reviews', { as: none })).status, 403);
    ok(await call('GET', '/admin/product-reviews', { as: viewer }), 'view');
    assert.equal((await call('PATCH', `/admin/product-reviews/${review.id}/hide`, { as: viewer, body: { reason: 'Abuse' } })).status, 403);
    assert.equal((await call('PATCH', `/admin/product-reviews/${review.id}/hide`, { as: editor, body: {} })).status, 400, 'reason required');
    ok(await call('PATCH', `/admin/product-reviews/${review.id}/hide`, { as: editor, body: { reason: 'Abuse' } }), 'hide');
    assert.equal((await call('PATCH', `/admin/product-reviews/${review.id}/hide`, { as: editor, body: { reason: 'Abuse' } })).status, 400, 'already hidden');
    assert.equal((await call('DELETE', `/admin/product-reviews/${review.id}`, { as: editor, body: { reason: 'Abuse' } })).status, 403);
    assert.equal((await call('GET', '/admin/product-reviews', { as: buyer.as })).status, 403);

    const quick = ok(await call('GET', '/admin/product-reviews?fulfilmentMode=quick&status=hidden', { as: viewer }), 'quick panel');
    const hidden = quick.reviews.find((r) => r.id === review.id);
    assert.equal(hidden.status, 'hidden');
    assert.equal(hidden.moderationReason, 'Abuse');
    const shop = ok(await call('GET', '/admin/product-reviews?fulfilmentMode=standard&status=hidden', { as: viewer }), 'shop panel');
    assert.ok(!shop.reviews.some((r) => r.id === review.id));

    ok(await call('DELETE', `/admin/product-reviews/${review.id}?reason=Abuse`, { as: deleter }), 'delete');
    const removed = ok(await call('GET', '/admin/product-reviews?status=removed', { as: viewer }), 'removed');
    assert.ok(removed.reviews.some((r) => r.id === review.id));
    assert.equal((await call('PATCH', `/admin/product-reviews/${review.id}/unhide`, { as: editor, body: {} })).status, 400, 'removed stays removed');
});
