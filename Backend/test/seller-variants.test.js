/**
 * Seller product variants: the seller form's variant matrix sends the same
 * variant shape the admin form does (attributes, SKU, MRP, active flag,
 * per-channel stock / low-stock alert / channel switches and per-variant
 * photos). This proves the seller endpoints keep all of it, the seller's edit
 * form can load it back, and a customer's product page gets each variant's
 * photos.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { startApp, stopApp, tokenFor, call, ok, oid } = await import('./helpers/app.js');

const ids = {};
const SIZES = ['S', 'M', 'L'];
const COLOURS = ['Blue', 'White'];
const photo = (size, colour, n = 1) => `https://cdn.example.com/shirt/${size}-${colour}-${n}.jpg`;

before(async () => {
    ids.db = await startApp();
    const { Seller } = await import('../src/modules/commerce/seller/models/seller.model.js');
    const seller = await Seller.create({
        channels: { quick: { status: 'approved' }, shop: { status: 'approved' } },
        sellerName: 'Shirt House',
        ownerName: 'Owner',
        ownerPhone: '9000000501',
        phone: '9000000501',
        status: 'approved',
        isAcceptingOrders: true,
        location: { type: 'Point', coordinates: [77.5946, 12.9716], latitude: 12.9716, longitude: 77.5946 },
    });
    ids.seller = seller._id;
    ids.token = tokenFor('SELLER', seller._id);
});

after(stopApp);

/** One draft row per size x colour, as the variant matrix builds them. */
const shirtVariants = () =>
    SIZES.flatMap((size, i) =>
        COLOURS.map((colour, j) => ({
            attributes: [{ name: 'Size', value: size }, { name: 'Colour', value: colour }],
            sku: `SHIRT-${size}-${colour.toUpperCase()}`,
            price: 499 + i * 50,
            mrp: 799,
            isActive: true,
            channels: { quick: null, shop: null },
            stock: { quick: null, shop: 10 + i * 2 + j },
            lowStockThreshold: { quick: null, shop: 2 },
            images: [photo(size, colour)],
        })),
    );

const approve = (productId) =>
    ids.db.collection('products').updateOne({ _id: oid(productId) }, { $set: { approvalStatus: 'approved' } });

const findVariant = (variants, size, colour) =>
    variants.find((v) =>
        v.attributes.some((a) => a.name === 'Size' && a.value === size)
        && v.attributes.some((a) => a.name === 'Colour' && a.value === colour));

test('a seller creates a shirt with 3 sizes x 2 colours, each with its own photo and stock', async () => {
    const created = ok(await call('POST', '/seller/products', {
        as: ids.token,
        body: {
            name: 'Oxford Shirt',
            description: 'Cotton oxford shirt',
            channels: { quick: false, shop: true },
            images: ['https://cdn.example.com/shirt/cover.jpg'],
            variants: shirtVariants(),
        },
    }), 'create shirt', 201).product;
    ids.product = String(created._id);

    assert.equal(created.variants.length, 6);
    const mBlue = findVariant(created.variants, 'M', 'Blue');
    assert.equal(mBlue.name, 'M / Blue', 'named after its options');
    assert.deepEqual(mBlue.images, [photo('M', 'Blue')]);
    assert.equal(mBlue.sku, 'SHIRT-M-BLUE');
    assert.equal(mBlue.mrp, 799);
    assert.equal(mBlue.stock.shop, 12);
    assert.equal(mBlue.lowStockThreshold.shop, 2);
    assert.equal(mBlue.isActive, true);

    // The seller's edit form loads from the menu: every field comes back.
    const menu = ok(await call('GET', '/seller/menu', { as: ids.token }), 'seller menu').menu;
    const item = menu.sections.flatMap((s) => s.items).find((i) => i.id === ids.product);
    assert.ok(item, 'shirt is on the seller menu');
    assert.equal(item.variants.length, 6);
    for (const size of SIZES) {
        for (const colour of COLOURS) {
            const v = findVariant(item.variants, size, colour);
            assert.ok(v, `${size} / ${colour} is listed`);
            assert.deepEqual(v.images, [photo(size, colour)]);
            assert.equal(v.sku, `SHIRT-${size}-${colour.toUpperCase()}`);
            assert.equal(v.mrp, 799);
            assert.equal(v.isActive, true);
            assert.deepEqual(v.channels, { quick: null, shop: null });
            assert.equal(v.lowStockThreshold.shop, 2);
            assert.ok(v.id, 'has an id to send back on update');
        }
    }
    assert.equal(findVariant(item.variants, 'L', 'White').stock.shop, 15);
});

test('updating one variant\'s photos keeps the others, and customers see each variant\'s photos', async () => {
    const menu = ok(await call('GET', '/seller/menu', { as: ids.token }), 'seller menu').menu;
    const item = menu.sections.flatMap((s) => s.items).find((i) => i.id === ids.product);

    // Sent back exactly as loaded, with M / White given two new photos.
    const newPhotos = [photo('M', 'White', 2), photo('M', 'White', 3)];
    const variants = item.variants.map((v) => ({
        _id: v.id,
        name: v.name,
        price: v.price,
        attributes: v.attributes,
        sku: v.sku,
        mrp: v.mrp,
        isActive: v.isActive,
        channels: v.channels,
        stock: v.stock,
        lowStockThreshold: v.lowStockThreshold,
        images: v.name === 'M / White' ? newPhotos : v.images,
    }));
    const updated = ok(await call('PATCH', `/seller/products/${ids.product}`, {
        as: ids.token, body: { variants },
    }), 'update variant photos').product;

    const mWhite = findVariant(updated.variants, 'M', 'White');
    assert.deepEqual(mWhite.images, newPhotos);
    assert.equal(String(mWhite._id), findVariant(item.variants, 'M', 'White').id, 'same variant, not a new one');
    assert.deepEqual(findVariant(updated.variants, 'S', 'Blue').images, [photo('S', 'Blue')], 'others untouched');
    assert.equal(updated.approvalStatus, 'pending', 'photo changes go back for approval');

    await approve(ids.product);
    const page = ok(await call('GET', `/catalog/products/${ids.product}?fulfilmentMode=standard`), 'customer product');
    assert.equal(page.product.variants.length, 6);
    assert.deepEqual(findVariant(page.product.variants, 'M', 'White').images, newPhotos);
    assert.deepEqual(findVariant(page.product.variants, 'L', 'Blue').images, [photo('L', 'Blue')]);
    assert.deepEqual(page.product.images, ['https://cdn.example.com/shirt/cover.jpg'], 'product gallery kept apart');
    const optionNames = page.product.options.map((o) => o.name).sort();
    assert.deepEqual(optionNames, ['Colour', 'Size'], 'the size and colour pickers are offered');
});

test('two variants with the same options are refused, in any order or case', async () => {
    const create = await call('POST', '/seller/products', {
        as: ids.token,
        body: {
            name: 'Dup Shirt',
            channels: { shop: true },
            variants: [
                { attributes: [{ name: 'Size', value: 'M' }, { name: 'Colour', value: 'Blue' }], price: 499 },
                { attributes: [{ name: 'colour', value: 'blue' }, { name: 'size', value: 'm' }], price: 520 },
            ],
        },
    });
    assert.equal(create.status, 400);
    assert.match(create.body.message, /Two variants have the same options/);

    const variants = shirtVariants();
    variants.push({ ...variants[0], sku: 'ANOTHER' });
    const update = await call('PATCH', `/seller/products/${ids.product}`, { as: ids.token, body: { variants } });
    assert.equal(update.status, 400);
    assert.match(update.body.message, /Two variants have the same options/);
});

test('variant photos are checked: a list of URLs, at most 10', async () => {
    const tooMany = shirtVariants().slice(0, 1);
    tooMany[0].images = Array.from({ length: 11 }, (_, n) => photo('S', 'Blue', n + 1));
    const res = await call('POST', '/seller/products', {
        as: ids.token, body: { name: 'Crowded Shirt', channels: { shop: true }, variants: tooMany },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /at most 10 images/);

    const notAList = await call('POST', '/seller/products', {
        as: ids.token,
        body: { name: 'Odd Shirt', channels: { shop: true }, variants: [{ name: 'One', price: 10, images: 'https://x/y.jpg' }] },
    });
    assert.equal(notAList.status, 400);
    assert.match(notAList.body.message, /list of URLs/);

    const dupes = ok(await call('POST', '/seller/products', {
        as: ids.token,
        body: {
            name: 'Repeat Shirt', channels: { shop: true },
            variants: [{ name: 'One', price: 10, images: [' https://x/a.jpg ', 'https://x/a.jpg', '', 'https://x/b.jpg'] }],
        },
    }), 'duplicate photos', 201).product;
    assert.deepEqual(dupes.variants[0].images, ['https://x/a.jpg', 'https://x/b.jpg'], 'trimmed and de-duplicated');
});

test('photos and stock on a variant in a channel the product does not sell are still stored', async () => {
    const created = ok(await call('POST', '/seller/products', {
        as: ids.token,
        body: {
            name: 'Linen Shirt',
            channels: { quick: false, shop: true },
            variants: [
                {
                    attributes: [{ name: 'Size', value: 'M' }],
                    price: 899,
                    // Off in Shop, and the product is not in Quick: sold nowhere for now.
                    channels: { quick: null, shop: false },
                    stock: { quick: 4, shop: 3 },
                    images: ['https://cdn.example.com/linen/m.jpg'],
                },
                { attributes: [{ name: 'Size', value: 'L' }], price: 899, images: ['https://cdn.example.com/linen/l.jpg'] },
            ],
        },
    }), 'create linen shirt', 201).product;

    const stored = await ids.db.collection('products').findOne({ _id: oid(created._id) });
    const m = stored.variants.find((v) => v.name === 'M');
    assert.deepEqual(m.images, ['https://cdn.example.com/linen/m.jpg']);
    assert.equal(m.stock.quick, 4);
    assert.equal(m.stock.shop, 3);
    assert.equal(m.channels.shop, false);
    assert.equal(stored.channels.quick, false);
});
