import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApp, stopApp, tokenFor, call, ok } from './helpers/app.js';
import { creditCoins } from '../src/modules/commerce/coins/services/coin.service.js';

let userToken;
let userId;
let sellerAId;
let sellerBId;
let productA;
let productB;

const ZONE = [
    { latitude: 12.90, longitude: 77.55 },
    { latitude: 12.90, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.65 },
    { latitude: 13.00, longitude: 77.55 },
];
const SELLER_AT = { lat: 12.9716, lng: 77.5946 };
const CUSTOMER_AT = { lat: 12.9352, lng: 77.6245 };

before(async () => {
    const db = await startApp();
    const { Zone } = await import('../src/modules/commerce/admin/models/zone.model.js');
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { User } = await import('../src/core/users/user.model.js');

    const zone = await Zone.create({ name: 'Split Zone', country: 'India', coordinates: ZONE, isActive: true });

    const sellerA = await Seller.create({ channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Fashion Hub (Seller A)',
        ownerName: 'Owner A',
        ownerPhone: '9888800001',
        phone: '9888800001',
        status: 'approved',
        isAcceptingOrders: true,
        zoneId: zone._id,
        location: { type: 'Point', coordinates: [SELLER_AT.lng, SELLER_AT.lat], latitude: SELLER_AT.lat, longitude: SELLER_AT.lng },
    });
    sellerAId = sellerA._id;

    const sellerB = await Seller.create({ channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Electronics Direct (Seller B)',
        ownerName: 'Owner B',
        ownerPhone: '9888800002',
        phone: '9888800002',
        status: 'approved',
        isAcceptingOrders: true,
        zoneId: zone._id,
        location: { type: 'Point', coordinates: [SELLER_AT.lng, SELLER_AT.lat], latitude: SELLER_AT.lat, longitude: SELLER_AT.lng },
    });
    sellerBId = sellerB._id;

    productA = await Product.create({
        sellerId: sellerA._id,
        name: 'Cotton T-Shirt',
        price: 300,
        stock: { quick: 20 },
        isAvailable: true,
        approvalStatus: 'approved',
    });

    productB = await Product.create({
        sellerId: sellerB._id,
        name: 'Bluetooth Earphones',
        price: 700,
        stock: { quick: 10 },
        isAvailable: true,
        approvalStatus: 'approved',
    });

    const user = await User.create({ name: 'MultiVendor Shopper', phone: '9888800003', isActive: true });
    userId = user._id;
    userToken = tokenFor('USER', userId);

    // Give user 500 spendable coins
    await creditCoins({
        userId,
        amount: 500,
        source: 'campaign',
        note: 'Initial Test Coins',
    });
});

after(stopApp);

test('multi-seller checkout pricing calculates per-seller breakdown and caps coins at 50%', async () => {
    const res = await call('POST', '/orders/checkout/calculate', {
        as: userToken,
        body: {
            fulfilmentMode: 'quick',
            coins: 600, // Wants 600, but user only has 500, and max order is 50%
            address: {
                street: '123 Tech Park',
                city: 'Bengaluru',
                state: 'Karnataka',
                latitude: CUSTOMER_AT.lat,
                longitude: CUSTOMER_AT.lng,
            },
            items: [
                { itemId: String(productA._id), sellerId: String(sellerAId), price: 300, quantity: 1 },
                { itemId: String(productB._id), sellerId: String(sellerBId), price: 700, quantity: 1 },
            ],
        },
    });

    const data = ok(res, 'calculate checkout pricing');
    assert.equal(data.subtotal, 1000); // 300 + 700
    assert.equal(data.childPricings.length, 2);

    // 50% order cap on 1000 is 500 coins, and user has 500 coins -> exactly 500 used
    assert.equal(data.coinsUsed, 500);
    assert.equal(data.coinsDiscount, 500);

    // Proportional coin allocation:
    // Seller A (300 / 1000 = 30%) -> 150 coins
    // Seller B (700 / 1000 = 70%) -> 350 coins
    const childA = data.childPricings.find((c) => String(c.sellerId) === String(sellerAId));
    const childB = data.childPricings.find((c) => String(c.sellerId) === String(sellerBId));
    assert.ok(childA && childB);
    assert.equal(childA.coinsUsed, 150);
    assert.equal(childB.coinsUsed, 350);
});

test('createSplitCheckout creates parent checkout and split child orders atomically', async () => {
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');
    const { Checkout } = await import('../src/modules/commerce/orders/models/checkout.model.js');
    const { Order } = await import('../src/modules/commerce/orders/models/order.model.js');

    const stockABefore = (await Product.findById(productA._id).lean()).stock.quick;
    const stockBBefore = (await Product.findById(productB._id).lean()).stock.quick;

    const res = await call('POST', '/orders/checkout', {
        as: userToken,
        body: {
            fulfilmentMode: 'quick',
            paymentMethod: 'cash',
            coins: 200, // Use 200 coins
            address: {
                street: '123 Tech Park',
                city: 'Bengaluru',
                state: 'Karnataka',
                latitude: CUSTOMER_AT.lat,
                longitude: CUSTOMER_AT.lng,
            },
            items: [
                { itemId: String(productA._id), sellerId: String(sellerAId), price: 300, quantity: 2 }, // 600
                { itemId: String(productB._id), sellerId: String(sellerBId), price: 700, quantity: 1 }, // 700
            ],
        },
    });

    const data = ok(res, 'create split checkout', 201);
    assert.ok(data.checkout);
    assert.ok(data.checkout.checkoutId.startsWith('CHK-'));
    assert.equal(data.childOrders.length, 2);

    // Check parent Checkout record
    const savedCheckout = await Checkout.findOne({ checkoutId: data.checkout.checkoutId }).lean();
    assert.ok(savedCheckout);
    assert.equal(savedCheckout.childOrderCodes.length, 2);

    // Verify stock decremented on both products
    const stockAAfter = (await Product.findById(productA._id).lean()).stock.quick;
    const stockBAfter = (await Product.findById(productB._id).lean()).stock.quick;
    assert.equal(stockAAfter, stockABefore - 2);
    assert.equal(stockBAfter, stockBBefore - 1);

    // Verify child orders reference parent checkout
    const orderRecords = await Order.find({ checkoutId: savedCheckout._id }).lean();
    assert.equal(orderRecords.length, 2);
    for (const ord of orderRecords) {
        assert.equal(ord.orderGroupId, savedCheckout.checkoutId);
        assert.ok(ord.coinsUsed > 0);
    }

    // Verify checkout lookup over HTTP
    const getRes = await call('GET', `/orders/checkout/${savedCheckout.checkoutId}`, { as: userToken });
    const fetchedCheckout = ok(getRes, 'get checkout by id');
    assert.equal(fetchedCheckout.checkoutId, savedCheckout.checkoutId);
});

test('split checkout rolls back all stock reservations if any item is out of stock', async () => {
    const { Product } = await import('../src/modules/commerce/admin/models/product.model.js');

    const stockABefore = (await Product.findById(productA._id).lean()).stock.quick;
    const stockBBefore = (await Product.findById(productB._id).lean()).stock.quick;

    const res = await call('POST', '/orders/checkout', {
        as: userToken,
        body: {
            fulfilmentMode: 'quick',
            paymentMethod: 'cash',
            address: {
                street: '123 Tech Park',
                city: 'Bengaluru',
                state: 'Karnataka',
                latitude: CUSTOMER_AT.lat,
                longitude: CUSTOMER_AT.lng,
            },
            items: [
                { itemId: String(productA._id), sellerId: String(sellerAId), price: 300, quantity: 2 },
                { itemId: String(productB._id), sellerId: String(sellerBId), price: 700, quantity: 9999 }, // impossible stock!
            ],
        },
    });

    assert.equal(res.status, 400);

    // Stock for Seller A must NOT have been changed (atomic rollback)
    const stockAAfter = (await Product.findById(productA._id).lean()).stock.quick;
    const stockBAfter = (await Product.findById(productB._id).lean()).stock.quick;
    assert.equal(stockAAfter, stockABefore);
    assert.equal(stockBAfter, stockBBefore);
});
