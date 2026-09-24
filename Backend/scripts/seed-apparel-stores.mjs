/**
 * Turns the four placeholder fashion stores into believable local stores of
 * our own and stocks them.
 *
 * The stores were first seeded (seed-fashion-quick.mjs) under the names of
 * real retail chains, with their logos, and with products in a shape the
 * storefront cannot read, so they showed up empty. This script:
 * - renames them in place (same _id, found by owner phone) to invented names
 *   with invented owners, placed inside the Indore City zone, with their own
 *   cover and profile photos; the chains' logos are no longer referenced
 * - rebuilds their 8 existing products in the catalogue's real shape (Size x
 *   Colour variants, per-channel stock, the apparel categories), renaming the
 *   ones whose photo showed something else
 * - adds new products, photographed with commercial-use Unsplash images that
 *   carry no brand marks
 *
 * Two stores sell on Quick and Shop, two on Shop only.
 *
 * Usage (on the server, from Backend/):
 *   node scripts/seed-apparel-stores.mjs          # idempotent seed/update
 *   node scripts/seed-apparel-stores.mjs --wipe   # delete everything tagged apparel-stores-v1
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import https from 'https';
import mongoose from 'mongoose';

import { Zone } from '../src/modules/commerce/admin/models/zone.model.js';
import { Category } from '../src/modules/commerce/admin/models/category.model.js';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { Attribute, AttributeSet } from '../src/modules/commerce/admin/models/attribute.model.js';
import { Seller } from '../src/modules/commerce/seller/models/seller.model.js';
import { recomputeProductRating } from '../src/modules/commerce/reviews/services/productReview.service.js';

const SEED_TAG = 'apparel-stores-v1';

const UPLOAD_ROOT = process.env.UPLOAD_STORAGE_ROOT || '/var/www/warehouses-uploads';
const MEDIA_DIR = path.join(UPLOAD_ROOT, 'seed', 'stores-v1');
const unsplash = (id, w = 1000) => `https://images.unsplash.com/photo-${id}?w=${w}&auto=format&fit=crop&q=80`;

function download(url, fullPath) {
    return new Promise((resolve, reject) => {
        https
            .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    return download(res.headers.location, fullPath).then(resolve, reject);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }
                const out = fs.createWriteStream(fullPath);
                res.pipe(out);
                out.on('finish', () => {
                    out.close();
                    try { fs.chmodSync(fullPath, 0o644); } catch { /* best effort */ }
                    resolve();
                });
                out.on('error', (err) => {
                    fs.unlink(fullPath, () => {});
                    reject(err);
                });
            })
            .on('error', reject);
    });
}

/** Stores an Unsplash photo under /uploads/seed/stores-v1; an existing path is passed through. */
async function media(source, relPath) {
    if (source.startsWith('/uploads/')) return source;
    const fullPath = path.join(MEDIA_DIR, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true, mode: 0o755 });
    if (!(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 1000)) {
        await download(unsplash(source), fullPath);
    }
    return `/uploads/seed/stores-v1/${relPath}`;
}

const approved = { status: 'approved', rejectionReason: null, appliedAt: new Date('2026-09-01'), decidedAt: new Date('2026-09-01') };
const none = { status: 'none', rejectionReason: null, appliedAt: null, decidedAt: null };

// Keyed by the owner phone the placeholder stores were created with.
const STORES = [
    {
        key: 'street-loom',
        ownerPhone: '9826011111',
        sellerName: 'Street Loom',
        ownerName: 'Karan Malviya',
        ownerEmail: 'streetloom@thewarehouses.in',
        addressLine1: '21 Sapna Sangeeta Road',
        area: 'Sapna Sangeeta',
        pincode: '452001',
        latitude: 22.7019,
        longitude: 75.8732,
        quick: true,
        profile: '1490481651871-ab68de25d43d',
        cover: '1555529669-e69e7aa0ba9a',
    },
    {
        key: 'dhaaga-house',
        ownerPhone: '9826022222',
        sellerName: 'Dhaaga House',
        ownerName: 'Sneha Jain',
        ownerEmail: 'dhaagahouse@thewarehouses.in',
        addressLine1: '7 Old Palasia Main Road',
        area: 'Old Palasia',
        pincode: '452018',
        latitude: 22.7255,
        longitude: 75.8861,
        quick: true,
        profile: '1558769132-cb1aea458c5e',
        cover: '1612423284934-2850a4ea6b0f',
    },
    {
        key: 'denim-den',
        ownerPhone: '9826033333',
        sellerName: 'Denim Den',
        ownerName: 'Arjun Rathore',
        ownerEmail: 'denimden@thewarehouses.in',
        addressLine1: '112 MG Road',
        area: 'MG Road',
        pincode: '452001',
        latitude: 22.7186,
        longitude: 75.8712,
        quick: true,
        profile: '1604176354204-9268737828e4',
        cover: '1560243563-062bfc001d68',
    },
    {
        key: 'stride-and-co',
        ownerPhone: '9826044444',
        sellerName: 'Stride & Co.',
        ownerName: 'Priya Soni',
        ownerEmail: 'strideandco@thewarehouses.in',
        addressLine1: '4 AB Road, Bhawarkua',
        area: 'Bhawarkua',
        pincode: '452014',
        latitude: 22.6958,
        longitude: 75.8676,
        quick: false,
        profile: '1605733513597-a8f8341084e6',
        cover: '1591085686350-798c0f9faa7f',
    },
    {
        key: 'tiny-threads',
        ownerPhone: '9826055555',
        sellerName: 'Tiny Threads',
        ownerName: 'Meera Dubey',
        ownerEmail: 'tinythreads@thewarehouses.in',
        addressLine1: '15 Saket Nagar Main Road',
        area: 'Saket Nagar',
        pincode: '452018',
        latitude: 22.7231,
        longitude: 75.8993,
        quick: true,
        profile: '1519238263530-99bdd11df2ea',
        cover: '1476234251651-f353703a034d',
    },
];

// New subcategories (parent: an apparel parent by name, or a new parent defined here).
const NEW_CATEGORIES = [
    { name: 'Skirts', parent: 'Women', image: '1577900232427-18219b9166a0' },
    { name: 'Suits & Blazers', parent: 'Men', image: '1594938298603-c8148c4dae35' },
    { name: 'Kids', parent: null, image: '1471286174890-9c112ffca5b4' },
    { name: 'Boys Clothing', parent: 'Kids', image: '1519238263530-99bdd11df2ea' },
    { name: 'Girls Clothing', parent: 'Kids', image: '1476234251651-f353703a034d' },
    { name: 'Baby & Toddler', parent: 'Kids', image: '1514090458221-65bb69cf63e6' },
];

// Colours beyond the apparel palette, added to the Colour attribute so their swatches render.
const EXTRA_COLOURS = [
    { value: 'Grey Melange', hex: '#a3a3a3' },
    { value: 'Sky Blue', hex: '#8ec5e8' },
    { value: 'Light Blue', hex: '#a9c4dd' },
    { value: 'Indigo', hex: '#2b3a67' },
    { value: 'Mustard', hex: '#e0a526' },
    { value: 'Blush Pink', hex: '#e8b4b0' },
    { value: 'Orange', hex: '#ee7b30' },
    { value: 'Red', hex: '#c62828' },
    { value: 'Tan', hex: '#c68e5b' },
    { value: 'Gold', hex: '#c9a54c' },
    { value: 'Teal', hex: '#1f8a83' },
    { value: 'Multicolour', hex: '#d946ef' },
];

const TEE = ['S', 'M', 'L', 'XL'];
const WAIST = ['28', '30', '32', '34', '36'];
const SHOE = ['6', '7', '8', '9', '10'];
const HEELS = ['36', '37', '38', '39', '40'];
const ONE = ['Free Size'];
const KIDS = ['2-3Y', '4-5Y', '6-7Y', '8-9Y'];
const BABY = ['6-12M', '12-18M', '18-24M'];

// category: apparel subcategory slug, or root:<slug> for the root-only ones (footwear, bags, accessories, jeans)
// legacyId: one of the stores' existing products, rebuilt in place
const PRODUCTS = [
    // Street Loom: streetwear tees and fleece
    { store: 'street-loom', legacyId: '6ab4f683f1e99f7c11f9f8e2', name: 'Pique Cotton Polo T-Shirt', category: 't-shirts', price: 599, mrp: 999, colours: ['Teal', 'Orange', 'Grey Melange'], sizes: TEE, photos: ['/uploads/quick/fashion/products/polo.webp'], quick: 30, shop: 90,
        description: '220 GSM cotton pique with a two-button placket\nRibbed collar and cuffs, side vents at the hem\nRegular fit; machine wash cold', tags: ['polo', 'cotton', 'pique', 'casual'] },
    { store: 'street-loom', legacyId: '6ab4f683f1e99f7c11f9f8e3', name: 'Oversized Skeleton Hand Print Tee', category: 't-shirts', price: 699, mrp: 1199, colours: ['Black'], sizes: TEE, photos: ['/uploads/quick/fashion/products/oversized.webp'], quick: 20, shop: 60,
        description: '240 GSM heavyweight cotton, drop shoulders\nScreen-printed front graphic that holds up wash after wash\nBoxy oversized fit; size down for a regular fit', tags: ['oversized', 'graphic', 'streetwear', 'tee'] },
    { store: 'street-loom', legacyId: '6ab4ff3df1e99f7c11f9f8e7', name: 'Embroidered Crest Cotton Tee', category: 't-shirts', price: 349, mrp: 699, colours: ['Black'], sizes: TEE, photos: ['/uploads/quick/fashion/products/graphic-tee.webp'], quick: 25, shop: 80,
        description: '100% combed cotton, 180 GSM\nSmall embroidered crest on the chest\nRegular fit; wash inside out', tags: ['tee', 'embroidered', 'cotton', 'basics'] },
    { store: 'street-loom', name: 'Essential Crew Neck Tee', category: 't-shirts', price: 449, mrp: 799, colours: ['White'], sizes: TEE, photos: ['1586790170083-2f9ceadc732d'], quick: 30, shop: 100,
        description: 'Bio-washed combed cotton, 200 GSM\nClean crew neck that keeps its shape\nRegular fit; pre-shrunk', tags: ['tee', 'white', 'basics', 'crew neck'] },
    { store: 'street-loom', name: 'Everyday Black Crew Tee', category: 't-shirts', price: 449, mrp: 799, colours: ['Black'], sizes: TEE, photos: ['1618517351616-38fb9c5210c6'], quick: 30, shop: 100,
        description: 'Bio-washed combed cotton, 200 GSM\nDeep black dye that resists fading\nRegular fit; pre-shrunk', tags: ['tee', 'black', 'basics', 'crew neck'] },
    { store: 'street-loom', name: 'Heather Grey Slub Tee', category: 't-shirts', price: 499, mrp: 899, colours: ['Grey Melange'], sizes: TEE, photos: ['1622445275463-afa2ab738c34'], quick: 20, shop: 70,
        description: 'Slub cotton with a soft, lived-in texture\nRelaxed fit with a curved hem\nMachine wash cold', tags: ['tee', 'slub', 'grey', 'casual'] },
    { store: 'street-loom', name: 'Brushed Fleece Pullover Hoodie', category: 'hoodies-and-sweatshirts', price: 1299, mrp: 2199, colours: ['Grey Melange'], sizes: TEE, photos: ['1556821840-3a63f95609a7'], quick: 12, shop: 40,
        description: '320 GSM brushed-back fleece\nLined hood, kangaroo pocket, ribbed cuffs\nRelaxed fit; wash cold, tumble dry low', tags: ['hoodie', 'fleece', 'winter', 'streetwear'] },
    { store: 'street-loom', name: 'Crew Neck Fleece Sweatshirt', category: 'hoodies-and-sweatshirts', price: 999, mrp: 1699, colours: ['White'], sizes: TEE, photos: ['1620799140408-edc6dcb6d633'], quick: 12, shop: 40,
        description: 'Cotton-rich fleece, soft brushed inside\nRibbed neck, cuffs and hem\nRegular fit', tags: ['sweatshirt', 'fleece', 'white', 'winter'] },

    // Dhaaga House: womenswear and bags
    { store: 'dhaaga-house', name: 'Flowing Chiffon Maxi Wrap Dress', category: 'dresses', price: 1499, mrp: 2599, colours: ['Sky Blue'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1539008835657-9e8e9680c956'], quick: 10, shop: 35,
        description: 'Lined georgette-chiffon with a wrap front\nThigh-high slit and adjustable waist tie\nHand wash cold; dry in shade', tags: ['maxi', 'dress', 'wrap', 'vacation'] },
    { store: 'dhaaga-house', name: 'Pinstripe Cotton Shirt', category: 'tops', price: 899, mrp: 1499, colours: ['White'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1583496661160-fb5886a0aaaa'], quick: 15, shop: 45,
        description: 'Crisp cotton poplin with fine pinstripes\nButton-down front, rounded hem to wear tucked or loose\nRegular fit', tags: ['shirt', 'pinstripe', 'workwear', 'cotton'] },
    { store: 'dhaaga-house', name: 'Relaxed Knit Pullover', category: 'tops', price: 1099, mrp: 1899, colours: ['Orange'], sizes: ['S', 'M', 'L'], photos: ['1578587018452-892bacefd3f2'], quick: 12, shop: 40,
        description: 'Soft acrylic-wool blend knit\nDropped shoulders and ribbed trims\nRelaxed fit; hand wash', tags: ['sweater', 'knit', 'winter', 'pullover'] },
    { store: 'dhaaga-house', name: 'High-Waist Pleated Joggers', category: 'track-pants-and-joggers', price: 899, mrp: 1499, colours: ['Blush Pink'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1594633312681-425c7b97ccd1'], quick: 15, shop: 45,
        description: 'Fluid viscose blend with front pleats\nElasticated waist and cuffed ankles\nRelaxed fit', tags: ['joggers', 'pleated', 'lounge', 'women'] },
    { store: 'dhaaga-house', name: 'Cropped Hoodie & Jogger Co-ord Set', category: 'track-pants-and-joggers', price: 1599, mrp: 2699, colours: ['Mustard'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1515886657613-9f3515b0c78f'], quick: 10, shop: 30,
        description: 'Two pieces: cropped hoodie and matching joggers\nCotton-rich fleece, brushed inside\nRelaxed fit', tags: ['co-ord', 'set', 'athleisure', 'hoodie'] },
    { store: 'dhaaga-house', legacyId: '6ab4ff3df1e99f7c11f9f8e9', name: 'Distressed Denim Shorts', category: 'root:jeans', price: 699, mrp: 1199, colours: ['Light Blue'], sizes: ['26', '28', '30', '32'], photos: ['/uploads/quick/fashion/products/shorts.webp'], quick: 15, shop: 45,
        description: 'Cotton denim with a light stonewash\nRipped detailing and rolled hems\nHigh-rise, regular fit', tags: ['shorts', 'denim', 'summer', 'distressed'] },
    { store: 'dhaaga-house', name: 'Woven Top-Handle Basket Bag', category: 'root:bags', price: 1799, mrp: 2999, colours: ['Tan'], sizes: ONE, photos: ['1590874103328-eac38a683ce7'], quick: 6, shop: 20,
        description: 'Hand-woven body with a vegan-leather flap\nMagnetic closure, fabric-lined inside\n24 x 20 x 10 cm', tags: ['bag', 'basket', 'handbag', 'summer'] },
    { store: 'dhaaga-house', name: 'Structured Satchel Handbag', category: 'root:bags', price: 2199, mrp: 3499, colours: ['Red'], sizes: ONE, photos: ['1584917865442-de89df76afd3'], quick: 6, shop: 20,
        description: 'Vegan leather with a structured frame\nTop handle, twist lock and detachable strap\n26 x 20 x 11 cm', tags: ['bag', 'satchel', 'handbag', 'party'] },

    // Denim Den: denim, shirts and jackets
    { store: 'denim-den', legacyId: '6ab4f683f1e99f7c11f9f8e4', name: 'Ripped Knee Tapered Jeans', category: 'jeans', price: 999, mrp: 1699, colours: ['Light Blue'], sizes: WAIST, photos: ['/uploads/quick/fashion/products/jeans.webp'], quick: 10, shop: 60,
        description: 'Comfort-stretch cotton denim\nRipped knees with a clean tapered leg\nMid-rise; wash inside out', tags: ['jeans', 'ripped', 'tapered', 'denim'] },
    { store: 'denim-den', name: 'Classic Straight Stonewash Jeans', category: 'jeans', price: 1199, mrp: 1999, colours: ['Light Blue', 'Indigo'], sizes: WAIST, photos: ['1604176354204-9268737828e4'], quick: 10, shop: 60,
        description: 'Rigid cotton denim that softens with wear\nFive pockets, straight leg\nMid-rise', tags: ['jeans', 'straight', 'stonewash', 'denim'] },
    { store: 'denim-den', name: 'Dark Rinse Slim Jeans', category: 'jeans', price: 1299, mrp: 2199, colours: ['Indigo'], sizes: WAIST, photos: ['1624378439575-d8705ad7ae80'], quick: 10, shop: 50,
        description: 'Deep indigo rinse with 2% stretch\nSlim through the thigh and leg\nMid-rise', tags: ['jeans', 'slim', 'dark wash', 'denim'] },
    { store: 'denim-den', name: 'Oxford Formal Shirt', category: 'shirts', price: 1099, mrp: 1799, colours: ['Sky Blue'], sizes: TEE, photos: ['1620012253295-c15cc3e65df4'], quick: 10, shop: 50,
        description: 'Cotton oxford weave, soft and breathable\nSpread collar and single-button cuffs\nTailored fit', tags: ['shirt', 'formal', 'oxford', 'office'] },
    { store: 'denim-den', name: 'Quilted Bomber Jacket', category: 'bomber-and-denim-jackets', price: 2299, mrp: 3799, colours: ['Black'], sizes: TEE, photos: ['1548126032-079a0fb0099d'], quick: 10, shop: 30,
        description: 'Water-resistant shell with light quilted padding\nRib-knit collar, cuffs and hem\nRegular fit', tags: ['jacket', 'bomber', 'winter', 'quilted'] },

    // Stride & Co.: footwear, bags and accessories
    { store: 'stride-and-co', legacyId: '6ab4ff3df1e99f7c11f9f8e8', name: 'Minimal Suede Panel Sneakers', category: 'root:footwear', price: 1499, mrp: 2499, colours: ['White'], sizes: SHOE, photos: ['/uploads/quick/fashion/products/sliders.webp'], shop: 50,
        description: 'Leather upper with suede heel panels\nCushioned insole, grippy rubber sole\nTrue to size', tags: ['sneakers', 'white', 'minimal', 'casual'] },
    { store: 'stride-and-co', legacyId: '6ab4f683f1e99f7c11f9f8e5', name: 'Colour-Block Knit Runners', category: 'root:footwear', price: 1799, mrp: 2999, colours: ['Multicolour'], sizes: SHOE, photos: ['1560769629-975ec94e6a86'], shop: 40,
        description: 'Breathable knit upper with a sock-fit collar\nLightweight foam midsole\nTrue to size', tags: ['sneakers', 'running', 'knit', 'sports'] },
    { store: 'stride-and-co', name: 'Floral Print Stiletto Heels', category: 'root:footwear', price: 1499, mrp: 2499, colours: ['Multicolour'], sizes: HEELS, photos: ['1543163521-1bf539c55dd2'], shop: 25,
        description: 'Printed satin upper, pointed toe\n9 cm stiletto heel, padded footbed\nTrue to size', tags: ['heels', 'stilettos', 'party', 'floral'] },
    { store: 'stride-and-co', name: 'Everyday Laptop Backpack', category: 'root:bags', price: 1299, mrp: 2199, colours: ['Navy'], sizes: ONE, photos: ['1553062407-98eeb64c6a62'], shop: 40,
        description: 'Water-repellent polyester, 22 litres\nPadded 15.6-inch laptop sleeve\nAir-mesh back and straps', tags: ['backpack', 'laptop', 'office', 'travel'] },
    { store: 'stride-and-co', name: 'Round Metal Sunglasses', category: 'root:accessories', price: 799, mrp: 1499, colours: ['Gold'], sizes: ONE, photos: ['1511499767150-a48a237f0083'], shop: 40,
        description: 'Lightweight metal frame with adjustable nose pads\nUV400 tinted lenses\nComes with a hard case', tags: ['sunglasses', 'round', 'uv400', 'summer'] },
    // Added with the new categories
    { store: 'street-loom', name: 'Soft Marl Crew Tee', category: 't-shirts', price: 399, mrp: 699, colours: ['Grey Melange'], sizes: TEE, photos: ['1564584217132-2271feaeb3c5'], quick: 25, shop: 80,
        description: 'Soft marl cotton-poly jersey\nCrew neck with a taped back seam\nRegular fit; machine wash cold', tags: ['tee', 'marl', 'basics', 'grey'] },
    { store: 'dhaaga-house', name: 'Pleated Satin Midi Skirt', category: 'new:Skirts', price: 1199, mrp: 1999, colours: ['Blush Pink'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1577900232427-18219b9166a0'], quick: 10, shop: 35,
        description: 'Fluid satin with sunray pleats\nElasticated back waist, midi length\nHand wash cold', tags: ['skirt', 'pleated', 'midi', 'satin'] },
    { store: 'dhaaga-house', name: 'Pleated Tennis Mini Skirt', category: 'new:Skirts', price: 799, mrp: 1299, colours: ['White'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1582142306909-195724d33ffc'], quick: 12, shop: 40,
        description: 'Crisp knife pleats, built-in shorts\nSide zip, high rise\nMachine wash cold', tags: ['skirt', 'tennis', 'mini', 'pleated'] },
    { store: 'dhaaga-house', name: 'Sailor Button High-Waist Skirt', category: 'new:Skirts', price: 999, mrp: 1699, colours: ['Black'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1583846783214-7229a91b20ed'], quick: 10, shop: 30,
        description: 'Structured crepe with a double-button front\nHigh waist, A-line mini\nDry clean or gentle hand wash', tags: ['skirt', 'sailor', 'high waist', 'workwear'] },
    { store: 'dhaaga-house', name: 'Denim Shirt Dress', category: 'dresses', price: 1399, mrp: 2299, colours: ['Light Blue'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1591369822096-ffd140ec948f'], quick: 10, shop: 35,
        description: 'Soft chambray denim, button-through front\nShort sleeves, gathered skirt\nMachine wash cold', tags: ['dress', 'denim', 'shirt dress', 'casual'] },
    { store: 'dhaaga-house', name: 'Satin Wrap Midi Dress', category: 'dresses', price: 1799, mrp: 2999, colours: ['Mustard'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1612722432474-b971cdcea546'], quick: 8, shop: 25,
        description: 'Lustrous satin with a true wrap front\nTie waist and flutter sleeves\nHand wash cold', tags: ['dress', 'wrap', 'satin', 'party'] },
    { store: 'dhaaga-house', name: 'Tailored Sheath Dress', category: 'dresses', price: 1599, mrp: 2699, colours: ['Grey Melange'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1617922001439-4a2e6562f328'], quick: 8, shop: 25,
        description: 'Stretch suiting fabric, knee length\nConcealed back zip, fully lined\nDry clean recommended', tags: ['dress', 'sheath', 'workwear', 'formal'] },
    { store: 'dhaaga-house', name: 'Crop Shirt & Trouser Co-ord', category: 'tops', price: 1699, mrp: 2799, colours: ['Navy'], sizes: ['XS', 'S', 'M', 'L'], photos: ['1562572159-4efc207f5aff'], quick: 8, shop: 25,
        description: 'Two pieces: cropped wrap shirt and wide trousers\nBreathable viscose-linen blend\nRelaxed fit', tags: ['co-ord', 'set', 'workwear', 'summer'] },
    { store: 'denim-den', name: 'Windowpane Check Blazer', category: 'new:Suits & Blazers', price: 3499, mrp: 5999, colours: ['Navy'], sizes: ['38', '40', '42', '44'], photos: ['1592878904946-b3cd8ae243d0'], quick: 5, shop: 20,
        description: 'Poly-viscose suiting with a windowpane check\nNotch lapel, two buttons, half lined\nSlim fit', tags: ['blazer', 'formal', 'check', 'office'] },
    { store: 'denim-den', name: 'Three-Piece Slim Suit', category: 'new:Suits & Blazers', price: 6999, mrp: 11999, colours: ['Navy'], sizes: ['38', '40', '42', '44'], photos: ['1594938298603-c8148c4dae35'], quick: 4, shop: 15,
        description: 'Jacket, waistcoat and trousers\nFine-weave suiting\nSlim fit; dry clean', tags: ['suit', 'three piece', 'wedding', 'formal'] },
    { store: 'denim-den', name: 'Classic Black Tuxedo', category: 'new:Suits & Blazers', price: 7999, mrp: 13999, colours: ['Black'], sizes: ['38', '40', '42', '44'], photos: ['1598808503746-f34c53b9323e'], quick: 3, shop: 12,
        description: 'Satin peak lapels and trouser stripe\nSingle button, fully lined\nSlim fit; dry clean', tags: ['tuxedo', 'party', 'wedding', 'formal'] },
    { store: 'denim-den', name: 'Slim Fit Formal Shirt', category: 'shirts', price: 999, mrp: 1699, colours: ['Sky Blue'], sizes: TEE, photos: ['1604695573706-53170668f6a6'], quick: 10, shop: 50,
        description: 'Easy-iron cotton blend\nCutaway collar, single-button cuffs\nSlim fit', tags: ['shirt', 'formal', 'office', 'slim fit'] },
    { store: 'denim-den', name: 'Relaxed Denim Shorts', category: 'jeans', price: 799, mrp: 1299, colours: ['Light Blue'], sizes: WAIST, photos: ['1602293589930-45aad59ba3ab'], quick: 10, shop: 40,
        description: 'Washed cotton denim, above-knee length\nFive pockets, raw hem\nRelaxed fit', tags: ['shorts', 'denim', 'summer', 'men'] },
    { store: 'denim-den', name: 'Full-Grain Leather Belt', category: 'root:accessories', price: 899, mrp: 1499, colours: ['Tan'], sizes: ['32', '34', '36', '38'], photos: ['1624222247344-550fb60583dc'], quick: 10, shop: 40,
        description: 'Full-grain leather, 35 mm wide\nBrushed metal pin buckle\nSize by waist', tags: ['belt', 'leather', 'accessories', 'formal'] },
    { store: 'tiny-threads', name: 'Boys Classic Crew Tee', category: 'new:Boys Clothing', price: 299, mrp: 499, colours: ['Red'], sizes: KIDS, photos: ['1471286174890-9c112ffca5b4'], quick: 20, shop: 60,
        description: '100% soft combed cotton\nTag-free neck, easy on and off\nRegular fit; machine wash', tags: ['kids', 'boys', 'tee', 'cotton'] },
    { store: 'tiny-threads', name: 'Bow Tie Cardigan Party Set', category: 'new:Boys Clothing', price: 1299, mrp: 2199, colours: ['Navy'], sizes: KIDS, photos: ['1519238263530-99bdd11df2ea'], quick: 8, shop: 25,
        description: 'Three pieces: cardigan, shirt with bow tie, shorts\nSoft cotton knit cardigan\nMachine wash gentle', tags: ['kids', 'boys', 'party', 'set'] },
    { store: 'tiny-threads', name: 'Kids Henley Tee', category: 'new:Boys Clothing', price: 349, mrp: 599, colours: ['White'], sizes: KIDS, photos: ['1503944583220-79d8926ad5e2'], quick: 20, shop: 60,
        description: 'Slub cotton with a three-button placket\nLong sleeves, relaxed fit\nMachine wash', tags: ['kids', 'henley', 'tee', 'casual'] },
    { store: 'tiny-threads', name: 'Girls Printed Frock', category: 'new:Girls Clothing', price: 699, mrp: 1199, colours: ['Navy'], sizes: KIDS, photos: ['1476234251651-f353703a034d'], quick: 12, shop: 40,
        description: 'Soft cotton with an all-over print\nButton back, flared skirt\nMachine wash gentle', tags: ['kids', 'girls', 'frock', 'dress'] },
    { store: 'tiny-threads', name: 'Checked Shirt & Denim Set', category: 'new:Baby & Toddler', price: 899, mrp: 1499, colours: ['Navy'], sizes: BABY, photos: ['1514090458221-65bb69cf63e6'], quick: 10, shop: 30,
        description: 'Two pieces: checked cotton shirt and soft denim bottoms\nSnap buttons for easy changes\nMachine wash gentle', tags: ['baby', 'toddler', 'set', 'denim'] },
    { store: 'stride-and-co', legacyId: '6ab4ff3df1e99f7c11f9f8ea', name: 'Mesh Trucker Cap', category: 'root:accessories', price: 299, mrp: 599, colours: ['White'], sizes: ONE, photos: ['/uploads/quick/fashion/products/cap.webp'], shop: 60,
        description: 'Structured cotton front with a breathable mesh back\nCurved peak and snapback closure\nOne size fits most', tags: ['cap', 'trucker', 'summer', 'accessories'] },
];

async function findCategory(ref, created) {
    if (ref.startsWith('new:')) return created.get(ref.slice(4)) || null;
    if (ref.startsWith('root:')) {
        return Category.findOne({ slug: ref.slice(5), parentId: null, seedTag: { $ne: 'apparel-seed-v1' } });
    }
    return Category.findOne({ slug: ref, seedTag: 'apparel-seed-v1', parentId: { $ne: null } });
}

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error('Missing MONGO_URI');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
    console.log(`Connected to ${mongoose.connection.name}`);

    if (process.argv.includes('--wipe')) {
        const [p, s, c] = await Promise.all([
            Product.collection.deleteMany({ seedTag: SEED_TAG }),
            Seller.collection.deleteMany({ seedTag: SEED_TAG }),
            Category.collection.deleteMany({ seedTag: SEED_TAG }),
        ]);
        console.log(`Deleted ${p.deletedCount} products, ${s.deletedCount} stores and ${c.deletedCount} categories tagged ${SEED_TAG}`);
        await mongoose.disconnect();
        return;
    }

    const zone = await Zone.findOne({ name: 'Indore City', isActive: true });
    if (!zone) throw new Error('Indore City zone not found');

    // Swatches for the extra colours; existing values are left alone.
    const colourAttr = await Attribute.findOne({ key: 'colour' });
    if (colourAttr) {
        const have = new Set(colourAttr.values.map((v) => v.value));
        const add = EXTRA_COLOURS.filter((c) => !have.has(c.value));
        if (add.length) {
            colourAttr.values.push(...add.map((c, i) => ({ value: c.value, hex: c.hex, sortOrder: colourAttr.values.length + i })));
            await colourAttr.save();
        }
        console.log(`Colour attribute: ${add.length} swatches added`);
    }

    const stores = new Map();
    for (const s of STORES) {
        const profileImage = await media(s.profile, `${s.key}/profile.webp`);
        const coverImage = await media(s.cover, `${s.key}/cover.webp`);
        const doc = await Seller.findOneAndUpdate(
            { ownerPhone: s.ownerPhone },
            {
                $set: {
                    sellerName: s.sellerName,
                    ownerName: s.ownerName,
                    ownerEmail: s.ownerEmail,
                    status: 'approved',
                    isActive: true,
                    isAcceptingOrders: true,
                    channels: { quick: s.quick ? approved : none, shop: approved },
                    zoneId: zone._id,
                    addressLine1: s.addressLine1,
                    area: s.area,
                    city: 'Indore',
                    state: 'Madhya Pradesh',
                    pincode: s.pincode,
                    location: {
                        type: 'Point',
                        coordinates: [s.longitude, s.latitude],
                        latitude: s.latitude,
                        longitude: s.longitude,
                        area: s.area,
                        city: 'Indore',
                        pincode: s.pincode,
                        state: 'Madhya Pradesh',
                    },
                    profileImage,
                    coverImage,
                    coverImages: [coverImage],
                    openingTime: '10:00 AM',
                    closingTime: '10:00 PM',
                    openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    estimatedDeliveryTime: s.quick ? '10-15 mins' : '2-4 business days',
                    estimatedDeliveryTimeMinutes: s.quick ? 15 : 2880,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        // Outside the schema, so written to the collection directly: the tag for
        // --wipe, and the placeholder's chain logo and unused fields removed.
        await Seller.collection.updateOne(
            { _id: doc._id },
            { $set: { seedTag: SEED_TAG }, $unset: { logo: '', distanceKm: '', fulfilmentModes: '' } },
        );
        stores.set(s.key, doc);
        console.log(`Store: ${doc.sellerName} (${doc._id}) quick=${doc.channels.quick.status} shop=${doc.channels.shop.status}`);
    }

    // New categories, under the apparel parents (or a parent defined above).
    const apparelSet = await AttributeSet.findOne({ key: 'apparel' });
    const createdCategories = new Map();
    for (const c of NEW_CATEGORIES) {
        let parentId = null;
        if (c.parent) {
            const parent =
                createdCategories.get(c.parent) ||
                (await Category.findOne({ name: c.parent, parentId: null, seedTag: 'apparel-seed-v1' }));
            if (!parent) throw new Error(`Parent category ${c.parent} not found`);
            parentId = parent._id;
        }
        const slug = c.name.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const image = await media(c.image, `categories/${slug}.webp`);
        // A root of the same name with no products (the old empty "Kids") is reused, not duplicated.
        const doc = await Category.findOneAndUpdate(
            parentId ? { name: c.name, parentId } : { name: c.name, parentId: null, sellerId: { $exists: false } },
            {
                $set: {
                    name: c.name,
                    image,
                    parentId,
                    ...(parentId && apparelSet ? { attributeSetId: apparelSet._id, commissionPercent: 10 } : {}),
                    approvalStatus: 'approved',
                    isApproved: true,
                    isActive: true,
                    requiresFssai: false,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        await Category.collection.updateOne({ _id: doc._id }, { $set: { seedTag: SEED_TAG } });
        createdCategories.set(c.name, doc);
        console.log(`Category: ${c.parent ? `${c.parent} > ` : ''}${doc.name} (${doc._id})`);
    }

    let done = 0;
    for (const p of PRODUCTS) {
        const seller = stores.get(p.store);
        const category = await findCategory(p.category, createdCategories);
        if (!category) {
            console.warn(`  skipped ${p.name}: category ${p.category} not found`);
            continue;
        }
        const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const photos = [];
        for (let i = 0; i < p.photos.length; i++) {
            try {
                photos.push(await media(p.photos[i], `${p.store}/${slug}/${i + 1}.webp`));
            } catch (err) {
                console.warn(`  photo ${i + 1} of ${p.name} failed: ${err.message}`);
            }
        }
        if (!photos.length) {
            console.warn(`  skipped ${p.name}: no photo`);
            continue;
        }

        const sellsQuick = Boolean(p.quick) && seller.channels.quick.status === 'approved';
        const channels = { shop: true, quick: sellsQuick };
        const perVariant = (total) => Math.max(1, Math.round(total / (p.sizes.length * p.colours.length)));
        const variants = [];
        for (const colour of p.colours) {
            for (const size of p.sizes) {
                variants.push({
                    name: size === 'Free Size' ? colour : `${size} / ${colour}`,
                    price: p.price,
                    mrp: p.mrp,
                    sku: `${p.store.slice(0, 3).toUpperCase()}-${slug.slice(0, 8).toUpperCase()}-${colour.replace(/\s+/g, '').slice(0, 3).toUpperCase()}-${size.replace(/\s+/g, '')}`,
                    attributes: [
                        { name: 'Size', value: size },
                        { name: 'Colour', value: colour },
                    ],
                    channels: { quick: null, shop: null },
                    stock: { shop: perVariant(p.shop), quick: sellsQuick ? perVariant(p.quick) : null },
                    lowStockThreshold: { shop: 2, quick: 2 },
                    images: photos,
                    isActive: true,
                });
            }
        }

        let doc = p.legacyId && mongoose.isValidObjectId(p.legacyId) ? await Product.findById(p.legacyId) : null;
        if (!doc) doc = await Product.findOne({ sellerId: seller._id, name: p.name });
        if (!doc) doc = new Product({ sellerId: seller._id, name: p.name });

        doc.sellerId = seller._id;
        doc.name = p.name;
        doc.categoryId = category._id;
        doc.categoryName = category.name;
        doc.brand = seller.sellerName;
        doc.packSize = 'Pack of 1';
        doc.description = p.description;
        doc.price = p.price;
        doc.mrp = p.mrp;
        doc.otherPrice = 0;
        doc.gstRate = p.price <= 1000 ? 5 : 12;
        doc.channels = channels;
        doc.stock = { shop: p.shop, quick: sellsQuick ? p.quick : null };
        doc.lowStockThreshold = { shop: 5, quick: sellsQuick ? 5 : null };
        doc.maxQtyPerOrder = 10;
        doc.image = photos[0];
        doc.images = photos;
        doc.variants = variants;
        doc.tags = p.tags;
        doc.foodType = null;
        doc.approvalStatus = 'approved';
        doc.approvedAt = doc.approvedAt || new Date();
        doc.isAvailable = true;
        await doc.save();
        // The placeholder products carried fields the app never reads; the tag is for --wipe.
        await Product.collection.updateOne(
            { _id: doc._id },
            { $set: { seedTag: SEED_TAG }, $unset: { sellerName: '', etaMins: '', options: '', channelsStock: '' } },
        );
        // Ratings come from real reviews only; this clears the placeholder's made-up stars.
        await recomputeProductRating(doc._id);
        done++;
        console.log(`  ${seller.sellerName}: ${p.name} Rs${p.price} (${variants.length} variants) shop=${doc.availableIn?.shop} quick=${doc.availableIn?.quick}`);
    }

    console.log(`\nDone: ${stores.size} stores, ${done}/${PRODUCTS.length} products`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
