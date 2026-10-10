import test from 'node:test';
import assert from 'node:assert/strict';
import {
    categoryKeyFor,
    cleanName,
    htmlToText,
    mapProduct,
    normaliseAttribute,
    parseStock,
    parseVariationLabel,
    toRupees,
} from '../scripts/lib/woo-import.mjs';

const prices = (price, regular) => ({ price: String(price), regular_price: String(regular), currency_minor_unit: 2 });

test('names lose HTML entities and the store-name suffix', () => {
    assert.equal(cleanName('Best Floral Print Crop Top &#8211; The Warehousess'), 'Best Floral Print Crop Top');
    assert.equal(cleanName('Mint Green Tie &#8211; Front Top for Women'), 'Mint Green Tie – Front Top for Women');
    assert.equal(cleanName('Navy Off Shoulder Crop Top – The Warehousess'), 'Navy Off Shoulder Crop Top');
    assert.equal(cleanName('Heart &amp; Bow Ring'), 'Heart & Bow Ring');
});

test('descriptions become paragraphs and bullet lines', () => {
    const html = '<p>Pretty &amp; light.</p>\n<h3>Key Features</h3>\n<ul>\n<li>\nFloral\n</li>\n<li>Oxidised</li>\n</ul>';
    assert.equal(htmlToText(html), 'Pretty & light.\n\nKey Features\n\n• Floral\n• Oxidised');
    assert.equal(htmlToText(''), '');
});

test('prices come from minor units', () => {
    assert.equal(toRupees('7900'), 79);
    assert.equal(toRupees('16950'), 169.5);
    assert.equal(toRupees(''), 0);
});

test('stock text: counted, out of stock, or not tracked', () => {
    assert.equal(parseStock({ stock_availability: { text: '3 in stock' } }), 3);
    assert.equal(parseStock({ stock_availability: { text: 'Out of stock' }, is_in_stock: false }), 0);
    assert.equal(parseStock({ stock_availability: { text: '' }, is_in_stock: true }), null);
});

test('attributes are renamed and tidied', () => {
    assert.deepEqual(normaliseAttribute('size', 'xxxl'), { name: 'Size', value: '3XL' });
    assert.deepEqual(normaliseAttribute('Size', 'Free Size'), { name: 'Size', value: 'Free Size' });
    assert.deepEqual(normaliseAttribute('Size', 'm'), { name: 'Size', value: 'M' });
    assert.deepEqual(normaliseAttribute('Color', 'light blue'), { name: 'Colour', value: 'Light Blue' });
    assert.deepEqual(normaliseAttribute('Color', 'Light Mint Color'), { name: 'Colour', value: 'Light Mint' });
    assert.deepEqual(parseVariationLabel('Size: M, Color: Red'), [{ name: 'Size', value: 'M' }, { name: 'Colour', value: 'Red' }]);
});

test('categories: WooCommerce names first, then the product name', () => {
    assert.equal(categoryKeyFor({ categories: [{ name: 'Kurta Set' }], name: 'x' }), 'kurtas');
    assert.equal(categoryKeyFor({ categories: [{ name: 'Watch' }], name: 'Golden Floral Watch Ring' }), 'watches');
    assert.equal(categoryKeyFor({ categories: [{ name: 'Sold Out' }], name: 'Tiny Heart Pearl Station Necklace' }), 'neckpieces');
    assert.equal(categoryKeyFor({ categories: [], name: 'Brown Ring Detail Fitted Top' }), 'tops');
    assert.equal(categoryKeyFor({ categories: [], name: 'Gold Tone Interlock Ring Earring' }), 'earrings');
    assert.equal(categoryKeyFor({ categories: [], name: 'Black Elephant Print Three Piece Suit Set' }), 'kurtas');
    assert.equal(categoryKeyFor({ categories: [], name: 'Mystery Item' }), null);
});

test('a variable product keeps its sizes, each counted on its own', () => {
    const product = mapProduct({
        id: 10, slug: 'kurta', permalink: 'https://thewarehousess.com/product/kurta/',
        name: 'Blue Kurta Set &#8211; The Warehousess', type: 'variable',
        categories: [{ name: 'Kurta Set' }],
        prices: prices(89900, 199900),
        images: [{ src: 'https://x/a.avif' }, { src: 'https://x/b.avif' }],
        _variationDetails: [
            { variation: 'size: M', prices: prices(89900, 199900), stock_availability: { text: '1 in stock' }, images: [] },
            { variation: 'size: XXXL', prices: prices(99900, 199900), stock_availability: { text: 'Out of stock' }, is_in_stock: false, images: [{ src: 'https://x/c.avif' }] },
        ],
    }, { imageFor: (u) => `/uploads/${u.split('/').pop()}` });

    assert.equal(product.name, 'Blue Kurta Set');
    assert.equal(product.price, 899);
    assert.equal(product.mrp, 1999);
    assert.equal(product.categoryKey, 'kurtas');
    assert.deepEqual(product.images, ['/uploads/a.avif', '/uploads/b.avif']);
    assert.deepEqual(product.variants.map((v) => [v.name, v.price, v.stock.shop]), [['M', 899, 1], ['3XL', 999, 0]]);
    assert.deepEqual(product.variants[1].images, ['/uploads/c.avif']);
    assert.deepEqual(product.stock, { shop: null, quick: null });
    assert.deepEqual(product.channels, { shop: true, quick: false });
    assert.deepEqual(product.legacy, { source: 'woocommerce', id: 10, slug: 'kurta', permalink: 'https://thewarehousess.com/product/kurta/' });
});

test('a lone "Free Size" option stays a size, carrying its own stock', () => {
    const product = mapProduct({
        id: 11, slug: 'earrings', name: 'Jhumka Earrings', type: 'variable', categories: [],
        prices: prices(7900, 16900), images: [{ src: 'https://x/e.avif' }],
        _variationDetails: [{ variation: 'Size: Free Size', prices: prices(7900, 16900), stock_availability: { text: '2 in stock' }, images: [] }],
    });
    assert.deepEqual(product.variants.map((v) => [v.name, v.stock.shop, v.attributes]), [['Free Size', 2, [{ name: 'Size', value: 'Free Size' }]]]);
    assert.deepEqual(product.stock, { shop: null, quick: null });
    assert.equal(product.price, 79);
    assert.equal(product.mrp, 169);
});

test('a simple product with no sale has no MRP above its price', () => {
    const product = mapProduct({
        id: 12, slug: 'ring', name: 'Leaf Ring', type: 'simple', categories: [{ name: 'Rings' }],
        prices: prices(19900, 19900), images: [], stock_availability: { text: 'Out of stock' }, is_in_stock: false,
    });
    assert.equal(product.mrp, null);
    assert.deepEqual(product.stock, { shop: 0, quick: null });
    assert.equal(product.image, '');
});

test('a simple product naming one size (Size: Free Size) carries it as its only option', () => {
    const product = mapProduct({
        id: 13, slug: 'tank', name: 'Yellow Ribbed Tank Top Women', type: 'simple', categories: [],
        prices: prices(34900, 79900), images: [{ src: 'https://x/t.avif' }], stock_availability: { text: '1 in stock' },
        attributes: [{ name: 'Size', taxonomy: 'pa_size', has_variations: false, terms: [{ name: 'Free Size' }] }],
    });
    assert.deepEqual(product.variants.map((v) => [v.name, v.price, v.mrp, v.stock.shop]), [['Free Size', 349, 799, 1]]);
    assert.deepEqual(product.stock, { shop: null, quick: null });
});

test('a simple product with no size stays without options', () => {
    const product = mapProduct({
        id: 14, slug: 'tee', name: 'Pink Color Print T Shirt for Women', type: 'simple', categories: [],
        prices: prices(30000, 100000), images: [], stock_availability: { text: '1 in stock' }, attributes: [],
    });
    assert.equal(product.variants.length, 0);
    assert.deepEqual(product.stock, { shop: 1, quick: null });
});
