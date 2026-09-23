/**
 * Seeds a believable apparel catalogue on Warehouses:
 * - Zone: Bengaluru Central
 * - Sellers: Urban Thread (Shop + Quick), Kora Basics (Shop), Vogue Craft (Shop)
 * - Attributes & Attribute Set: Size (XS-XXL), Colour (hex swatches), "Apparel" set
 * - Categories: Men, Women, Activewear, Jackets (with 10 subcategories linked to Apparel)
 * - Products: 40-50 products with full Size x Colour variant matrices, per-channel stock,
 *             bulleted descriptions, tags, and GST rates
 * - Media: Curated, commercial-use Unsplash fashion photos downloaded directly to
 *          /var/www/warehouses-uploads/seed/ (or process.env.UPLOAD_STORAGE_ROOT)
 * - Banners: 4 Hero Banners + 3 Home Promotion Banners
 * - Reviews: Genuine verified buyer reviews on featured products with recomputed ratings
 *
 * Usage:
 *   node scripts/seed-apparel.mjs         # Idempotent seed/update
 *   node scripts/seed-apparel.mjs --wipe  # Clean rollback of apparel-seed-v1 data
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import mongoose from 'mongoose';

// Mongoose Models
import { Zone } from '../src/modules/commerce/admin/models/zone.model.js';
import { Category } from '../src/modules/commerce/admin/models/category.model.js';
import { Product } from '../src/modules/commerce/admin/models/product.model.js';
import { Attribute, AttributeSet } from '../src/modules/commerce/admin/models/attribute.model.js';
import { Seller } from '../src/modules/commerce/seller/models/seller.model.js';
import { HeroBanner } from '../src/modules/commerce/landing/models/heroBanner.model.js';
import { HomePromotionBanner } from '../src/modules/commerce/landing/models/homePromotionBanner.model.js';
import { LandingSettings } from '../src/modules/commerce/landing/models/landingSettings.model.js';
import { ProductReview } from '../src/modules/commerce/reviews/models/productReview.model.js';
import { User } from '../src/core/users/user.model.js';
import { Offer } from '../src/modules/commerce/admin/models/offer.model.js';
import { recomputeProductRating } from '../src/modules/commerce/reviews/services/productReview.service.js';

const SEED_TAG = 'apparel-seed-v1';

// Add seedTag to Mongoose schemas dynamically so Mongoose's strict mode does not strip it
[Zone, Category, Product, Attribute, AttributeSet, Seller, HeroBanner, HomePromotionBanner, ProductReview, User, Offer].forEach((model) => {
    if (!model.schema.paths.seedTag) {
        model.schema.add({ seedTag: { type: String, trim: true, index: true, default: null } });
    }
});

const UPLOAD_ROOT = process.env.UPLOAD_STORAGE_ROOT || '/var/www/warehouses-uploads';
const SEED_MEDIA_DIR = path.join(UPLOAD_ROOT, 'seed');

const DEFAULT_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80';

async function downloadSingleUrl(remoteUrl, fullPath) {
    const client = remoteUrl.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        const req = client.get(remoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadSingleUrl(res.headers.location, fullPath).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${remoteUrl}`));
            }
            const fileStream = fs.createWriteStream(fullPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                try { fs.chmodSync(fullPath, 0o644); } catch {}
                resolve();
            });
            fileStream.on('error', (err) => {
                fs.unlink(fullPath, () => {});
                reject(err);
            });
        });
        req.on('error', reject);
    });
}

/**
 * Downloads a file from a URL to a local destination if it does not already exist.
 * Sets 0o755 on directories and 0o644 on files.
 */
async function ensureDownloaded(remoteUrl, localRelPath) {
    const fullPath = path.join(SEED_MEDIA_DIR, localRelPath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    }

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 1000) {
        return `/uploads/seed/${localRelPath.replace(/\\/g, '/')}`;
    }

    try {
        await downloadSingleUrl(remoteUrl, fullPath);
    } catch (err) {
        console.warn(`  [Notice] Image download warning: ${err.message}. Using high-res fallback.`);
        try {
            await downloadSingleUrl(DEFAULT_FALLBACK_IMAGE, fullPath);
        } catch (fbErr) {
            console.warn(`  [Notice] Fallback download failed: ${fbErr.message}`);
        }
    }

    return `/uploads/seed/${localRelPath.replace(/\\/g, '/')}`;
}

// Bengaluru Central service zone polygon
const ZONE_COORDINATES = [
    { latitude: 12.85, longitude: 77.45 },
    { latitude: 13.15, longitude: 77.45 },
    { latitude: 13.15, longitude: 77.75 },
    { latitude: 12.85, longitude: 77.75 },
];

// Sellers definition
const SEED_SELLERS = [
    {
        key: 'urban-thread',
        sellerName: 'Urban Thread',
        ownerName: 'Vikram Mehta',
        ownerEmail: 'vikram.urbanthread@gmail.com',
        ownerPhone: '9876543210',
        pincode: '560001',
        addressLine1: '12 MG Road',
        area: 'Central Bengaluru',
        city: 'Bengaluru',
        state: 'Karnataka',
        latitude: 12.9716,
        longitude: 77.5946,
        quickApproved: true,
        shopApproved: true,
        profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400&auto=format&fit=crop&q=80',
    },
    {
        key: 'kora-basics',
        sellerName: 'Kora Basics',
        ownerName: 'Ananya Sen',
        ownerEmail: 'ananya.korabasics@gmail.com',
        ownerPhone: '9876543211',
        pincode: '560038',
        addressLine1: '45 100ft Road, Indiranagar',
        area: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        latitude: 12.9784,
        longitude: 77.6408,
        quickApproved: false,
        shopApproved: true,
        profileImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1400&auto=format&fit=crop&q=80',
    },
    {
        key: 'vogue-craft',
        sellerName: 'Vogue Craft',
        ownerName: 'Rohan Kapoor',
        ownerEmail: 'rohan.voguecraft@gmail.com',
        ownerPhone: '9876543212',
        pincode: '560034',
        addressLine1: '88 80ft Road, Koramangala',
        area: 'Koramangala',
        city: 'Bengaluru',
        state: 'Karnataka',
        latitude: 12.9352,
        longitude: 77.6245,
        quickApproved: false,
        shopApproved: true,
        profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1400&auto=format&fit=crop&q=80',
    },
];

// Curated Apparel Color Palette
const SEED_COLOURS = [
    { value: 'Black', hex: '#000000' },
    { value: 'White', hex: '#ffffff' },
    { value: 'Navy', hex: '#1f2a44' },
    { value: 'Olive', hex: '#4b5320' },
    { value: 'Maroon', hex: '#800000' },
    { value: 'Beige', hex: '#f5f5dc' },
    { value: 'Charcoal', hex: '#36454f' },
    { value: 'Rust', hex: '#b7410e' },
];

const SEED_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Hero Banners (Home page main carousel)
const HERO_BANNERS = [
    {
        title: 'Autumn/Winter Contemporary Edit',
        ctaText: 'Shop New Arrivals',
        ctaLink: '/category/t-shirts',
        sortOrder: 1,
        imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1400&auto=format&fit=crop&q=80',
    },
    {
        title: 'The Linen & Cotton Studio',
        ctaText: 'Explore Casuals',
        ctaLink: '/category/shirts',
        sortOrder: 2,
        imageUrl: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1400&auto=format&fit=crop&q=80',
    },
    {
        title: 'Timeless Indigo & Denim Essentials',
        ctaText: 'View Collection',
        ctaLink: '/category/jeans',
        sortOrder: 3,
        imageUrl: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1400&auto=format&fit=crop&q=80',
    },
    {
        title: 'High-Performance Activewear',
        ctaText: 'Move in Comfort',
        ctaLink: '/category/gym-tees-and-tops',
        sortOrder: 4,
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1400&auto=format&fit=crop&q=80',
    },
];

// Promotional Banners (Featured strip)
const PROMO_BANNERS = [
    {
        title: 'Artisanal Handloom Kurtas - Up to 40% Off',
        ctaLink: '/category/kurtas',
        sortOrder: 1,
        imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1200&auto=format&fit=crop&q=80',
    },
    {
        title: 'Minimalist Wardrobe Staples Under ₹999',
        ctaLink: '/category/t-shirts',
        sortOrder: 2,
        imageUrl: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1200&auto=format&fit=crop&q=80',
    },
    {
        title: 'Urban Outerwear & Layering Pieces',
        ctaLink: '/category/bomber-and-denim-jackets',
        sortOrder: 3,
        imageUrl: 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=1200&auto=format&fit=crop&q=80',
    },
];

// Categories taxonomy
const SEED_CATEGORIES = [
    {
        name: 'Men',
        image: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=800&auto=format&fit=crop&q=80',
        sortOrder: 1,
        children: [
            {
                name: 'T-Shirts',
                image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 1,
            },
            {
                name: 'Shirts',
                image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 2,
            },
            {
                name: 'Jeans',
                image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 3,
            },
        ],
    },
    {
        name: 'Women',
        image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&auto=format&fit=crop&q=80',
        sortOrder: 2,
        children: [
            {
                name: 'Dresses',
                image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 12,
                sortOrder: 1,
            },
            {
                name: 'Kurtas',
                image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 2,
            },
            {
                name: 'Tops',
                image: 'https://images.unsplash.com/photo-1534126511673-b6899657816a?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 3,
            },
        ],
    },
    {
        name: 'Activewear',
        image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80',
        sortOrder: 3,
        children: [
            {
                name: 'Gym Tees & Tops',
                image: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 1,
            },
            {
                name: 'Track Pants & Joggers',
                image: 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 2,
            },
        ],
    },
    {
        name: 'Jackets',
        image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop&q=80',
        sortOrder: 4,
        children: [
            {
                name: 'Bomber & Denim Jackets',
                image: 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 12,
                sortOrder: 1,
            },
            {
                name: 'Hoodies & Sweatshirts',
                image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
                commissionPercent: 10,
                sortOrder: 2,
            },
        ],
    },
];

// Catalogue Products Master Definition (~44 items)
// [subCat, name, sellerIndex, price, mrp, colours, sizes, isQuick, stockShop, stockQuick, [photoUrls], description, tags]
const CATALOGUE_ITEMS = [
    // --- Men: T-Shirts ---
    [
        'T-Shirts', 'Supima Classic Heavyweight Tee', 0, 799, 1499,
        ['Black', 'White', 'Navy'], ['S', 'M', 'L', 'XL'], true, 50, 15,
        [
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% American Supima Cotton (220 GSM)\nRelaxed drop-shoulder silhouette with ribbed collar\nBio-washed & pre-shrunk; machine wash cold\nEthically manufactured in Tirupur, India',
        ['tshirt', 'cotton', 'supima', 'crewneck', 'heavyweight', 'casual']
    ],
    [
        'T-Shirts', 'Slub Textured Waffle Tee', 1, 649, 1199,
        ['Olive', 'Beige', 'Charcoal'], ['M', 'L', 'XL'], false, 35, null,
        [
            'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Breathable waffle slub cotton\nRegular fit with curved raw-edge hem\nGentle machine wash inside out\nCrafted in Coimbatore, India',
        ['waffle', 'textured', 'casual', 'tshirt', 'slub']
    ],
    [
        'T-Shirts', 'Organic Cotton Striped Tee', 0, 899, 1599,
        ['Navy', 'Rust'], ['S', 'M', 'L', 'XL'], true, 40, 12,
        [
            'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?w=1000&auto=format&fit=crop&q=80',
        ],
        'GOTS Certified organic combed cotton\nYarn-dyed horizontal nautical stripes\nWash cold; dry flat in shade\nMade in Ahmedabad, India',
        ['striped', 'nautical', 'organic', 'cotton', 'summer']
    ],
    [
        'T-Shirts', 'Garment-Dyed Vintage Wash Tee', 2, 749, 1399,
        ['Charcoal', 'Rust', 'Olive'], ['S', 'M', 'L'], false, 25, null,
        [
            'https://images.unsplash.com/photo-1618354691229-88d47f285158?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Ring-spun cotton with mineral acid wash\nBoxy relaxed fit with double-needle hems\nMachine wash cold with similar shades\nHand-dyed in Jaipur, India',
        ['vintage', 'garment dyed', 'mineral wash', 'oversized', 'tee']
    ],
    [
        'T-Shirts', 'Minimalist Mercerized Crew Tee', 0, 999, 1799,
        ['Black', 'White', 'Navy'], ['M', 'L', 'XL', 'XXL'], true, 2, 2, // Intentional low stock
        [
            'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1000&auto=format&fit=crop&q=80',
        ],
        'Silk-finish mercerized double-knit jersey\nTailored slim fit designed for layering under blazers\nDry clean or delicate cold wash\nSpun in Mumbai, India',
        ['mercerized', 'luxury', 'formal tee', 'silk finish', 'crewneck']
    ],

    // --- Men: Shirts ---
    [
        'Shirts', 'Pure European Linen Casual Shirt', 0, 1599, 2999,
        ['White', 'Beige', 'Navy'], ['S', 'M', 'L', 'XL'], true, 30, 8,
        [
            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% French flax linen (breathable 140 GSM)\nRelaxed mandarin collar with mother-of-pearl buttons\nMachine wash gentle; air dry naturally\nTailored in Bengaluru, India',
        ['linen', 'mandarin collar', 'summer shirt', 'resortwear', 'casual shirt']
    ],
    [
        'Shirts', 'Classic Oxford Button-Down Shirt', 1, 1299, 2299,
        ['White', 'Navy', 'Olive'], ['M', 'L', 'XL', 'XXL'], false, 40, null,
        [
            'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=1000&auto=format&fit=crop&q=80',
        ],
        'Heavyweight 100% two-ply Oxford basketweave cotton\nStructured button-down collar with single chest pocket\nWarm iron; machine wash warm\nCrafted in Surat, India',
        ['oxford', 'button down', 'workwear', 'formal shirt', 'cotton']
    ],
    [
        'Shirts', 'Yarn-Dyed Brushed Cotton Flannel Shirt', 2, 1399, 2499,
        ['Rust', 'Charcoal', 'Navy'], ['S', 'M', 'L', 'XL'], false, 28, null,
        [
            'https://images.unsplash.com/photo-1626497764746-6dc36546b388?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=1000&auto=format&fit=crop&q=80',
        ],
        'Brushed double-face cotton flannel (200 GSM)\nOvershirt fit with twin buttoned flap pockets\nMachine wash cold with like colors\nManufactured in Ludhiana, India',
        ['flannel', 'checked shirt', 'overshirt', 'winter wear', 'brushed cotton']
    ],
    [
        'Shirts', 'Band Collar Handloom Cotton Shirt', 1, 1099, 1899,
        ['Beige', 'White'], ['M', 'L', 'XL'], false, 20, null,
        [
            'https://images.unsplash.com/photo-1589310243389-96a5483213a8?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Khadi hand-spun textured cotton\nGrandad band collar with clean placket\nHand wash separately in cold water\nHandwoven in Varanasi, India',
        ['handloom', 'khadi', 'band collar', 'ethnic wear', 'sustainable']
    ],

    // --- Men: Jeans ---
    [
        'Jeans', 'Selvedge Raw Indigo Slim-Tapered Jeans', 0, 2499, 4499,
        ['Navy', 'Black'], ['S', 'M', 'L', 'XL'], true, 25, 6,
        [
            'https://images.unsplash.com/photo-1542272604-780c96856592?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=1000&auto=format&fit=crop&q=80',
        ],
        '13.5 oz Shuttle-loom Japanese selvedge denim\nMid-rise slim-tapered fit with red-line selvedge ID\nWash rarely inside-out in cold water; hang dry\nConstructed in Ahmedabad, India',
        ['selvedge', 'raw denim', 'jeans', 'indigo', 'slim fit', 'denim']
    ],
    [
        'Jeans', 'Classic Relaxed Straight Fit Jeans', 1, 1799, 2999,
        ['Navy', 'Charcoal'], ['M', 'L', 'XL', 'XXL'], false, 35, null,
        [
            'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=1000&auto=format&fit=crop&q=80',
        ],
        '99% Cotton, 1% Comfort stretch denim (12 oz)\nRelaxed straight leg with vintage brass hardware\nMachine wash cold inside out\nStitched in Bellary, India',
        ['straight fit', 'relaxed', 'denim', 'jeans', 'comfortable']
    ],
    [
        'Jeans', 'Washed Jet Black Slim Denim', 2, 1899, 3299,
        ['Black'], ['S', 'M', 'L', 'XL'], false, 0, null, // Intentional out of stock
        [
            'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=1000&auto=format&fit=crop&q=80',
        ],
        'Deep sulfur-dyed stay-black cotton stretch denim\nModern slim fit with 5-pocket styling\nWash cold with dark laundry detergent\nMade in Delhi, India',
        ['black jeans', 'slim fit', 'denim', 'black denim', 'stretch']
    ],

    // --- Women: Dresses ---
    [
        'Dresses', 'Tiered Linen Midi Wrap Dress', 0, 1899, 3499,
        ['Beige', 'Olive', 'Rust'], ['XS', 'S', 'M', 'L'], true, 30, 8,
        [
            'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Washed pure European linen\nV-neck wrap bodice with adjustable waist tie and deep pockets\nDelicate machine wash cold; line dry\nTailored in Jaipur, India',
        ['midi dress', 'wrap dress', 'linen', 'summer dress', 'vacation wear']
    ],
    [
        'Dresses', 'Floral Block-Printed Cotton Sundress', 1, 1499, 2799,
        ['White', 'Navy'], ['S', 'M', 'L', 'XL'], false, 25, null,
        [
            'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Mulmul cotton with hand block botanical print\nA-line flare with sweetheart neckline and ruffled straps\nHand wash gently with mild liquid soap\nHandcrafted in Bagru, India',
        ['floral', 'sundress', 'block print', 'cotton dress', 'mulmul']
    ],
    [
        'Dresses', 'Sleek Ribbed Knit Column Dress', 2, 1699, 2999,
        ['Black', 'Maroon'], ['XS', 'S', 'M', 'L'], false, 20, null,
        [
            'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?w=1000&auto=format&fit=crop&q=80',
        ],
        'Viscose-blend compact ribbed stretch knit\nElegant maxi length with subtle side slit\nHand wash cold; dry flat\nKnitted in Tirupur, India',
        ['knit dress', 'ribbed', 'maxi dress', 'evening wear', 'black dress']
    ],

    // --- Women: Kurtas ---
    [
        'Kurtas', 'Chanderi Silk Festive A-Line Kurta', 0, 1999, 3999,
        ['Maroon', 'Navy', 'Rust'], ['S', 'M', 'L', 'XL'], true, 28, 6,
        [
            'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1000&auto=format&fit=crop&q=80',
        ],
        'Chanderi silk cotton blend with delicate zari boota\nFlared A-line silhouette with scalloped organza borders\nDry clean recommended\nWoven in Chanderi, Madhya Pradesh',
        ['chanderi', 'silk kurta', 'festive wear', 'ethnic', 'embroidered']
    ],
    [
        'Kurtas', 'Everyday Handloom Cotton Straight Kurta', 1, 999, 1899,
        ['Olive', 'Beige', 'White'], ['S', 'M', 'L', 'XL', 'XXL'], false, 45, null,
        [
            'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Breathable slub cotton with wooden buttons\nStraight calf-length fit with functional side slits\nMachine wash cold with mild detergent\nCrafted in Kolkata, India',
        ['cotton kurta', 'daily wear', 'office wear', 'straight kurta', 'handloom']
    ],
    [
        'Kurtas', 'Angrakha Embroidered Flared Kurta', 2, 1799, 3299,
        ['Rust', 'Navy'], ['XS', 'S', 'M', 'L'], false, 22, null,
        [
            'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1000&auto=format&fit=crop&q=80',
        ],
        'Pure mul cotton with cross-over tie-up dori\nIntricate mirror-work embroidery on neckline\nGentle hand wash\nCrafted in Kutch, Gujarat',
        ['angrakha', 'anarkali', 'mirror work', 'embroidered', 'ethnic']
    ],

    // --- Women: Tops ---
    [
        'Tops', 'Linen Blend Peplum Button-Down Top', 0, 899, 1699,
        ['White', 'Olive', 'Beige'], ['XS', 'S', 'M', 'L'], true, 35, 10,
        [
            'https://images.unsplash.com/photo-1534126511673-b6899657816a?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1000&auto=format&fit=crop&q=80',
        ],
        'Linen-cotton blend with natural slub texture\nSquare neck with gently gathered peplum hem\nMachine wash gentle in cold water\nMade in Bengaluru, India',
        ['peplum', 'linen top', 'casual top', 'square neck', 'summer top']
    ],
    [
        'Tops', 'Smocked Square-Neck Puff Sleeve Blouse', 1, 999, 1799,
        ['Rust', 'Black', 'White'], ['S', 'M', 'L'], false, 25, null,
        [
            'https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1534126511673-b6899657816a?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Cotton poplin with elasticated smocked bodice\nRomantic elasticated puff sleeves\nMachine wash cold; hang dry\nStitched in Mumbai, India',
        ['puff sleeve', 'smocked top', 'blouse', 'crop top', 'poplin']
    ],
    [
        'Tops', 'Oversized Boyfriend Poplin Shirt Top', 2, 1199, 2199,
        ['White', 'Navy'], ['S', 'M', 'L', 'XL'], false, 30, null,
        [
            'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1000&auto=format&fit=crop&q=80',
        ],
        'Crisp 100% compact cotton poplin\nRelaxed oversized boyfriend cut with drop shoulder\nWarm iron; machine wash warm\nCrafted in Surat, India',
        ['boyfriend shirt', 'poplin', 'white shirt', 'oversized', 'minimalist']
    ],

    // --- Activewear: Gym Tees & Tops ---
    [
        'Gym Tees & Tops', 'AeroDry Seamless Performance Tee', 0, 799, 1499,
        ['Charcoal', 'Navy', 'Olive'], ['S', 'M', 'L', 'XL'], true, 45, 15,
        [
            'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1000&auto=format&fit=crop&q=80',
        ],
        '88% Poly, 12% Spandex moisture-wicking AeroDry knit\nSeamless body-mapped construction eliminates chafing\nQuick-drying; machine wash cold\nEngineered in Gurugram, India',
        ['dryfit', 'gym tee', 'activewear', 'workout', 'running', 'breathable']
    ],
    [
        'Gym Tees & Tops', 'Racerback Athletic Training Tank', 1, 599, 1099,
        ['Black', 'White', 'Maroon'], ['XS', 'S', 'M', 'L'], false, 30, null,
        [
            'https://images.unsplash.com/photo-1506152983158-b4a74a01c721?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80',
        ],
        'Ultra-light 4-way stretch poly-elastane\nErgonomic racerback cut for unhindered shoulder mobility\nMachine wash cold; do not iron on print\nMade in Tirupur, India',
        ['tank top', 'racerback', 'gym wear', 'fitness', 'athletic tank']
    ],

    // --- Activewear: Track Pants & Joggers ---
    [
        'Track Pants & Joggers', 'Performance Flex Tapered Joggers', 0, 1299, 2399,
        ['Black', 'Navy', 'Charcoal'], ['S', 'M', 'L', 'XL'], true, 40, 10,
        [
            'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=1000&auto=format&fit=crop&q=80',
        ],
        'French terry cotton blend with 4-way stretch elastane\nZippered secure pockets and ribbed ankle cuffs\nMachine wash cold; tumble dry low\nManufactured in Ludhiana, India',
        ['joggers', 'track pants', 'athletic', 'gym joggers', 'loungewear']
    ],
    [
        'Track Pants & Joggers', 'Lightweight Studio Lounge Pants', 2, 1199, 2099,
        ['Olive', 'Beige', 'Charcoal'], ['M', 'L', 'XL'], false, 25, null,
        [
            'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=1000&auto=format&fit=crop&q=80',
        ],
        'Ultra-soft modal cotton stretch jersey\nDrawstring waistband with wide relaxed leg cut\nMachine wash delicate cycle\nStitched in Coimbatore, India',
        ['lounge pants', 'yoga pants', 'track pants', 'casual pants', 'modal']
    ],

    // --- Jackets: Bomber & Denim Jackets ---
    [
        'Bomber & Denim Jackets', 'Vintage Trucker Denim Jacket', 0, 2499, 4499,
        ['Navy', 'Black'], ['S', 'M', 'L', 'XL'], true, 25, 5,
        [
            'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1000&auto=format&fit=crop&q=80',
        ],
        '14 oz 100% Rigid cotton denim with subtle stonewash\nClassic point collar with shank button front and welt pockets\nSpot clean or wash cold inside-out\nStitched in Ahmedabad, India',
        ['denim jacket', 'trucker jacket', 'outerwear', 'jacket', 'winter jacket']
    ],
    [
        'Bomber & Denim Jackets', 'Minimalist Nylon Shell Bomber Jacket', 1, 2199, 3999,
        ['Olive', 'Black', 'Navy'], ['M', 'L', 'XL', 'XXL'], false, 30, null,
        [
            'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1544441893-675973e31985?w=1000&auto=format&fit=crop&q=80',
        ],
        'Water-resistant matte nylon shell with soft poly lining\nRibbed baseball collar, cuffs and hem with heavy-duty zipper\nWipe clean or cold machine wash gentle\nCrafted in Noida, India',
        ['bomber jacket', 'nylon jacket', 'streetwear', 'windbreaker', 'outerwear']
    ],

    // --- Jackets: Hoodies & Sweatshirts ---
    [
        'Hoodies & Sweatshirts', 'Heavyweight French Terry Pullover Hoodie', 0, 1699, 2999,
        ['Charcoal', 'Rust', 'Black'], ['S', 'M', 'L', 'XL'], true, 35, 8,
        [
            'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?w=1000&auto=format&fit=crop&q=80',
        ],
        '380 GSM Heavyweight 100% combed cotton French terry\nDouble-layered generous hood with kangaroo pouch pocket\nMachine wash cold inside-out; do not tumble dry\nMade in Tirupur, India',
        ['hoodie', 'sweatshirt', 'heavyweight', 'winter wear', 'cotton hoodie']
    ],
    [
        'Hoodies & Sweatshirts', 'Everyday Classic Crewneck Sweatshirt', 2, 1399, 2499,
        ['Beige', 'Navy', 'Olive'], ['M', 'L', 'XL'], false, 28, null,
        [
            'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=1000&auto=format&fit=crop&q=80',
        ],
        '320 GSM Brushed fleece-lined cotton blend\nRibbed V-insert neckline, cuffs and hem band\nMachine wash cold with like colours\nManufactured in Ludhiana, India',
        ['sweatshirt', 'crewneck', 'fleece', 'pullover', 'loungewear']
    ],

    // --- Additional Items (bringing catalogue total to 45 products) ---
    [
        'T-Shirts', 'Oversized Typography Graphic Tee', 0, 849, 1599,
        ['Black', 'White', 'Rust'], ['S', 'M', 'L', 'XL'], true, 35, 10,
        [
            'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1000&auto=format&fit=crop&q=80',
        ],
        '240 GSM Heavy combed cotton with screen-printed back graphic\nDrop-shoulder streetwear cut with ribbed neckline\nMachine wash cold inside-out\nPrinted in Bengaluru, India',
        ['graphic tee', 'oversized', 'streetwear', 'cotton', 'typography']
    ],
    [
        'T-Shirts', 'Pique Cotton Classic Polo T-Shirt', 1, 899, 1699,
        ['Navy', 'Olive', 'White'], ['M', 'L', 'XL', 'XXL'], false, 40, null,
        [
            'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=1000&auto=format&fit=crop&q=80',
        ],
        'Honeycomb breathable pique knit cotton\nRibbed collar and sleeve bands with two-button placket\nWash cold; dry flat\nCrafted in Tirupur, India',
        ['polo', 'pique', 'collar tee', 'smart casual', 'golf polo']
    ],
    [
        'T-Shirts', 'Raglan Sleeve Slub Henley Tee', 2, 799, 1499,
        ['Charcoal', 'Beige'], ['S', 'M', 'L'], false, 25, null,
        [
            'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1618354691229-88d47f285158?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Textured slub cotton with wooden three-button henley neck\nContrast raglan 3/4 sleeves\nGentle wash cold\nMade in Ahmedabad, India',
        ['henley', 'raglan', 'slub cotton', 'casual', 'tshirt']
    ],
    [
        'Shirts', 'Micro-Corduroy Long Sleeve Overshirt', 0, 1799, 3299,
        ['Olive', 'Rust', 'Charcoal'], ['M', 'L', 'XL'], true, 30, 8,
        [
            'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1626497764746-6dc36546b388?w=1000&auto=format&fit=crop&q=80',
        ],
        'Soft 21-wale fine cotton corduroy\nTwin chest flap pockets with antique metal snap buttons\nMachine wash cold inside-out\nStitched in Ludhiana, India',
        ['corduroy', 'overshirt', 'winter shirt', 'layering', 'casual']
    ],
    [
        'Shirts', 'Cuban Collar Botanical Printed Resort Shirt', 2, 1299, 2299,
        ['Navy', 'White'], ['S', 'M', 'L', 'XL'], false, 30, null,
        [
            'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1000&auto=format&fit=crop&q=80',
        ],
        'Lightweight rayon-cotton blend with lush tropical leaf motif\nCamp Cuban collar with relaxed straight hem\nCold gentle wash; hang dry\nPrinted in Goa, India',
        ['cuban collar', 'resort shirt', 'hawaiian shirt', 'summer', 'printed shirt']
    ],
    [
        'Jeans', 'Distressed Vintage Wash Slim Jeans', 0, 2199, 3999,
        ['Navy', 'Charcoal'], ['S', 'M', 'L', 'XL'], true, 25, 5,
        [
            'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=1000&auto=format&fit=crop&q=80',
        ],
        '12 oz Hand-sanded distressed denim with knee rips and whiskers\nSlim tapered fit with 2% elastane for flexible movement\nMachine wash inside-out in cold water\nCrafted in Surat, India',
        ['distressed jeans', 'ripped jeans', 'slim fit', 'vintage denim', 'denim']
    ],
    [
        'Jeans', 'Straight-Leg Ecru Natural Denim Jeans', 1, 1999, 3499,
        ['Beige', 'White'], ['M', 'L', 'XL'], false, 30, null,
        [
            'https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Unbleached natural cotton bull denim with raw cotton flecks\nHigh-waisted straight leg with copper rivets\nWash cold with mild detergent\nConstructed in Ahmedabad, India',
        ['ecru jeans', 'white jeans', 'natural denim', 'straight fit', 'denim']
    ],
    [
        'Dresses', 'Tiered Smocked Cotton Floral Midi Dress', 2, 1699, 3199,
        ['Rust', 'Olive'], ['S', 'M', 'L', 'XL'], false, 25, null,
        [
            'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Breathable cambric cotton with artisanal floral bootis\nShirred elastic bodice with tiered ruffled skirt\nGentle machine wash cold\nHand-printed in Sanganer, Rajasthan',
        ['midi dress', 'floral dress', 'smocked', 'cottagecore', 'tiered dress']
    ],
    [
        'Dresses', 'Bodycon Ribbed Knit Sleeveless Midi Dress', 0, 1499, 2799,
        ['Black', 'Maroon', 'Charcoal'], ['XS', 'S', 'M', 'L'], true, 30, 8,
        [
            'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=1000&auto=format&fit=crop&q=80',
        ],
        'Form-fitting modal elastane heavy rib knit\nSleeveless scoop neckline with elegant side calf slit\nHand wash cold; lay flat to dry\nManufactured in Tirupur, India',
        ['bodycon', 'ribbed dress', 'sleeveless', 'party dress', 'cocktail']
    ],
    [
        'Kurtas', 'Bandhani Print Pure Silk Anarkali Kurta', 0, 2299, 4499,
        ['Maroon', 'Rust'], ['S', 'M', 'L', 'XL'], true, 20, 5,
        [
            'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1000&auto=format&fit=crop&q=80',
        ],
        'Art silk flared anarkali silhouette with traditional Bandhani dots\nGold gota patti lace border detailing\nDry clean only\nCrafted in Jaipur, Rajasthan',
        ['bandhani', 'anarkali', 'silk kurta', 'festive wear', 'wedding wear']
    ],
    [
        'Kurtas', 'Dabu Handblock Print Indigo A-Line Kurta', 1, 1399, 2599,
        ['Navy', 'White'], ['M', 'L', 'XL', 'XXL'], false, 35, null,
        [
            'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=1000&auto=format&fit=crop&q=80',
        ],
        'Mud-resist Dabu printed handloom cotton\nA-line flare with functional deep side pockets\nHand wash cold with mild detergent\nNaturally dyed in Akola, Rajasthan',
        ['indigo kurta', 'dabu print', 'handblock', 'cotton kurta', 'sustainable']
    ],
    [
        'Tops', 'Ribbed High-Neck Sleeveless Knit Top', 0, 699, 1299,
        ['Black', 'White', 'Beige'], ['XS', 'S', 'M', 'L'], true, 40, 12,
        [
            'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1534126511673-b6899657816a?w=1000&auto=format&fit=crop&q=80',
        ],
        'Fine-gauge stretch cotton modal rib\nChic high mock-neck with armhole rib finish\nDelicate machine wash cold\nSpun in Coimbatore, India',
        ['high neck', 'sleeveless', 'ribbed top', 'minimalist', 'capsule wardrobe']
    ],
    [
        'Tops', 'Linen Tie-Up Wrap Crop Blouse', 2, 899, 1699,
        ['Olive', 'Rust', 'White'], ['S', 'M', 'L'], false, 28, null,
        [
            'https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1000&auto=format&fit=crop&q=80',
        ],
        '100% Breathable pre-washed pure linen\nSurplice wrap neckline with long adjustable side ties\nGentle machine wash cold\nStitched in Kochi, Kerala',
        ['wrap top', 'linen crop top', 'resort top', 'summer blouse', 'linen']
    ],
    [
        'Gym Tees & Tops', 'Muscle-Fit Dry-Tech Workout Tank', 0, 649, 1199,
        ['Charcoal', 'Black', 'Navy'], ['S', 'M', 'L', 'XL'], true, 35, 10,
        [
            'https://images.unsplash.com/photo-1506152983158-b4a74a01c721?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=1000&auto=format&fit=crop&q=80',
        ],
        'Micro-mesh polyester with silver anti-odor technology\nDeep dropped armholes with reinforced flatlock stitching\nMachine wash cold; do not use fabric softener\nEngineered in Ludhiana, India',
        ['workout tank', 'gym stringer', 'muscle fit', 'bodybuilding', 'drytech']
    ],
    [
        'Track Pants & Joggers', 'High-Waisted Seamless Compression Tights', 1, 1399, 2499,
        ['Black', 'Navy', 'Olive'], ['XS', 'S', 'M', 'L'], false, 30, null,
        [
            'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=1000&auto=format&fit=crop&q=80',
        ],
        '75% Nylon, 25% Spandex squat-proof compression fabric\nWide stay-put waistband with hidden key pocket\nMachine wash cold inside-out\nManufactured in Gurugram, India',
        ['leggings', 'yoga tights', 'compression', 'gym leggings', 'high waist']
    ],
    [
        'Bomber & Denim Jackets', 'Quilted Ultralight Packable Puffer Vest', 0, 1899, 3499,
        ['Black', 'Navy', 'Olive'], ['S', 'M', 'L', 'XL'], true, 25, 6,
        [
            'https://images.unsplash.com/photo-1544441893-675973e31985?w=1000&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=1000&auto=format&fit=crop&q=80',
        ],
        'Windproof ripstop nylon shell with faux-down thermoregulation fill\nStand collar with zippered hand-warmer pockets\nWipe clean or machine wash gentle\nCrafted in Noida, India',
        ['puffer vest', 'gilet', 'quilted vest', 'winter vest', 'packable jacket']
    ],
];

// Curated verified product reviews to seed
const SAMPLE_REVIEWS = [
    {
        productIndex: 0, // Supima Classic Heavyweight Tee
        rating: 5,
        title: 'Exceptional Supima Quality',
        text: 'The fabric weight is perfect. Feels noticeably softer and heavier than high-street brands. Has held its shape and colour after four washes.',
        reviewerName: 'Priya Sharma',
    },
    {
        productIndex: 0,
        rating: 5,
        title: 'Great drape and fit',
        text: 'Love the slightly relaxed drop shoulder look. Pairs well with jeans or under an unbuttoned shirt. Highly recommended!',
        reviewerName: 'Rahul Verma',
    },
    {
        productIndex: 5, // Pure European Linen Casual Shirt
        rating: 5,
        title: 'Crisp yet breathable linen',
        text: 'True European linen texture without feeling itchy. Wore it all day in humid weather and stayed completely comfortable.',
        reviewerName: 'Arjun Nambiar',
    },
    {
        productIndex: 9, // Selvedge Raw Indigo Slim-Tapered Jeans
        rating: 5,
        title: 'Real shuttle-loom selvedge at this price!',
        text: 'Stiff on day one as proper raw denim should be, but broke in beautifully within a week. The red selvedge line looks very sharp when cuffed.',
        reviewerName: 'Karthik Rao',
    },
    {
        productIndex: 12, // Tiered Linen Midi Wrap Dress
        rating: 5,
        title: 'Flattering cut and deep pockets!',
        text: 'The wrap cut is so flattering and having actual usable pockets in a dress is a dream. The fabric has a nice weight so it is not see-through.',
        reviewerName: 'Neha Patel',
    },
    {
        productIndex: 15, // Chanderi Silk Festive Kurta
        rating: 4,
        title: 'Stunning festive look',
        text: 'The subtle sheen and zari work look gorgeous in person. Received many compliments at a family function.',
        reviewerName: 'Sunita Reddy',
    },
];

// Curated platform & seller coupons for /offers and cart
const SEED_OFFERS = [
    {
        couponCode: 'WELCOME300',
        title: 'Flat ₹300 OFF',
        discountType: 'flat-price',
        discountValue: 300,
        minOrderValue: 999,
        sellerScope: 'all',
        customerScope: 'all',
        isFirstOrderOnly: false,
    },
    {
        couponCode: 'FESTIVE25',
        title: '25% OFF',
        discountType: 'percentage',
        discountValue: 25,
        maxDiscount: 750,
        minOrderValue: 1499,
        sellerScope: 'all',
        customerScope: 'all',
        isFirstOrderOnly: false,
    },
    {
        couponCode: 'URBAN500',
        title: 'Flat ₹500 OFF',
        discountType: 'flat-price',
        discountValue: 500,
        minOrderValue: 1999,
        sellerScope: 'selected',
        sellerIndex: 0, // Urban Thread
        customerScope: 'all',
        isFirstOrderOnly: false,
    },
    {
        couponCode: 'KORA150',
        title: 'Flat ₹150 OFF',
        discountType: 'flat-price',
        discountValue: 150,
        minOrderValue: 799,
        sellerScope: 'selected',
        sellerIndex: 1, // Kora Basics
        customerScope: 'all',
        isFirstOrderOnly: false,
    },
    {
        couponCode: 'VOGUE15',
        title: '15% OFF',
        discountType: 'percentage',
        discountValue: 15,
        maxDiscount: 500,
        minOrderValue: 1199,
        sellerScope: 'selected',
        sellerIndex: 2, // Vogue Craft
        customerScope: 'all',
        isFirstOrderOnly: false,
    },
];

async function main() {
    const isWipe = process.argv.includes('--wipe');
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (!mongoUri) {
        console.error('Missing MONGO_URI in environment!');
        process.exit(1);
    }

    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
    console.log(`Connected to database: ${mongoose.connection.name}`);

    if (isWipe) {
        console.log(`\n--- Wiping all data tagged with seedTag: '${SEED_TAG}' ---`);
        const wipeResults = await Promise.all([
            Product.deleteMany({ seedTag: SEED_TAG }),
            Category.deleteMany({ seedTag: SEED_TAG }),
            Seller.deleteMany({ seedTag: SEED_TAG }),
            Attribute.deleteMany({ seedTag: SEED_TAG }),
            AttributeSet.deleteMany({ seedTag: SEED_TAG }),
            HeroBanner.deleteMany({ seedTag: SEED_TAG }),
            HomePromotionBanner.deleteMany({ seedTag: SEED_TAG }),
            ProductReview.deleteMany({ seedTag: SEED_TAG }),
            Zone.deleteMany({ seedTag: SEED_TAG }),
            User.deleteMany({ seedTag: SEED_TAG }),
            Offer.deleteMany({ seedTag: SEED_TAG }),
        ]);

        console.log(`Deleted counts:`);
        console.log(`Products:            ${wipeResults[0].deletedCount}`);
        console.log(`Categories:          ${wipeResults[1].deletedCount}`);
        console.log(`Sellers:             ${wipeResults[2].deletedCount}`);
        console.log(`Attributes:          ${wipeResults[3].deletedCount}`);
        console.log(`AttributeSets:       ${wipeResults[4].deletedCount}`);
        console.log(`HeroBanners:         ${wipeResults[5].deletedCount}`);
        console.log(`HomePromotionBanners:${wipeResults[6].deletedCount}`);
        console.log(`ProductReviews:      ${wipeResults[7].deletedCount}`);
        console.log(`Zones:               ${wipeResults[8].deletedCount}`);
        console.log(`Reviewer Users:      ${wipeResults[9].deletedCount}`);
        console.log(`Offers:              ${wipeResults[10].deletedCount}`);

        if (process.argv.includes('--wipe-images')) {
            if (fs.existsSync(SEED_MEDIA_DIR)) {
                fs.rmSync(SEED_MEDIA_DIR, { recursive: true, force: true });
                console.log(`Wiped image directory: ${SEED_MEDIA_DIR}`);
            }
        }

        await mongoose.disconnect();
        console.log('\nWipe complete.');
        return;
    }

    console.log(`\n--- Step 1: Zone ---`);
    const zone = await Zone.findOneAndUpdate(
        { name: 'Bengaluru Central' },
        {
            $set: {
                name: 'Bengaluru Central',
                zoneName: 'Bengaluru Central',
                country: 'India',
                serviceLocation: 'Central Bengaluru & Surrounds',
                unit: 'kilometer',
                coordinates: ZONE_COORDINATES,
                etaMinutes: 10,
                isActive: true,
                seedTag: SEED_TAG,
            },
        },
        { upsert: true, new: true }
    );
    console.log(`Zone configured: ${zone.name} (${zone._id})`);

    console.log(`\n--- Step 2: Sellers ---`);
    const sellerDocs = [];
    for (const s of SEED_SELLERS) {
        console.log(`Configuring seller: ${s.sellerName}...`);
        const profileImgUrl = await ensureDownloaded(s.profileImage, `sellers/${s.key}-profile.webp`);
        const coverImgUrl = await ensureDownloaded(s.coverImage, `sellers/${s.key}-cover.webp`);

        const approvedChannel = {
            status: 'approved',
            rejectionReason: null,
            appliedAt: new Date('2026-01-01'),
            decidedAt: new Date('2026-01-01'),
        };
        const noneChannel = {
            status: 'none',
            rejectionReason: null,
            appliedAt: null,
            decidedAt: null,
        };

        const doc = await Seller.findOneAndUpdate(
            { ownerPhone: s.ownerPhone },
            {
                $set: {
                    sellerName: s.sellerName,
                    ownerName: s.ownerName,
                    ownerEmail: s.ownerEmail,
                    ownerPhone: s.ownerPhone,
                    status: 'approved',
                    isActive: true,
                    isAcceptingOrders: true,
                    channels: {
                        quick: s.quickApproved ? approvedChannel : noneChannel,
                        shop: s.shopApproved ? approvedChannel : noneChannel,
                    },
                    zoneId: s.quickApproved ? zone._id : undefined,
                    addressLine1: s.addressLine1,
                    area: s.area,
                    city: s.city,
                    state: s.state,
                    pincode: s.pincode,
                    location: {
                        type: 'Point',
                        coordinates: [s.longitude, s.latitude],
                        latitude: s.latitude,
                        longitude: s.longitude,
                        area: s.area,
                        city: s.city,
                        pincode: s.pincode,
                        state: s.state,
                    },
                    profileImage: profileImgUrl,
                    coverImage: coverImgUrl,
                    coverImages: [coverImgUrl],
                    openingTime: '09:00 AM',
                    closingTime: '10:00 PM',
                    openDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    estimatedDeliveryTime: s.quickApproved ? '10-15 mins' : '2-4 business days',
                    estimatedDeliveryTimeMinutes: s.quickApproved ? 15 : 2880,
                    seedTag: SEED_TAG,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        sellerDocs.push(doc);
        console.log(`  -> ${doc.sellerName} (${doc._id}) [Shop: ${doc.channels.shop.status}, Quick: ${doc.channels.quick.status}]`);
    }

    console.log(`\n--- Step 3: Attributes & Apparel Attribute Set ---`);
    // Size attribute
    const sizeAttr = await Attribute.findOneAndUpdate(
        { key: 'size' },
        {
            $set: {
                name: 'Size',
                key: 'size',
                type: 'select',
                values: SEED_SIZES.map((sz, i) => ({ value: sz, hex: '', sortOrder: i })),
                isFilterable: true,
                isActive: true,
                sortOrder: 1,
                seedTag: SEED_TAG,
            },
        },
        { upsert: true, new: true }
    );
    console.log(`Attribute: ${sizeAttr.name} (${sizeAttr.values.length} sizes)`);

    // Colour attribute
    const colourAttr = await Attribute.findOneAndUpdate(
        { key: 'colour' },
        {
            $set: {
                name: 'Colour',
                key: 'colour',
                type: 'color',
                values: SEED_COLOURS.map((c, i) => ({ value: c.value, hex: c.hex.toLowerCase(), sortOrder: i })),
                isFilterable: true,
                isActive: true,
                sortOrder: 2,
                seedTag: SEED_TAG,
            },
        },
        { upsert: true, new: true }
    );
    console.log(`Attribute: ${colourAttr.name} (${colourAttr.values.length} colours)`);

    // Attribute Set "Apparel"
    const apparelSet = await AttributeSet.findOneAndUpdate(
        { key: 'apparel' },
        {
            $set: {
                name: 'Apparel',
                key: 'apparel',
                attributeIds: [sizeAttr._id, colourAttr._id],
                isActive: true,
                seedTag: SEED_TAG,
            },
        },
        { upsert: true, new: true }
    );
    console.log(`AttributeSet: ${apparelSet.name} linked with [${sizeAttr.name}, ${colourAttr.name}]`);

    console.log(`\n--- Step 4: Categories Hierarchy ---`);
    const categoryDocMap = new Map(); // name -> Category document
    for (const parentCat of SEED_CATEGORIES) {
        const parentSlug = parentCat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const parentImg = await ensureDownloaded(parentCat.image, `categories/${parentSlug}.webp`);

        const parentDoc = await Category.findOneAndUpdate(
            { name: parentCat.name, sellerId: { $exists: false } },
            {
                $set: {
                    name: parentCat.name,
                    image: parentImg,
                    approvalStatus: 'approved',
                    isApproved: true,
                    isActive: true,
                    sortOrder: parentCat.sortOrder,
                    requiresFssai: false,
                    seedTag: SEED_TAG,
                },
                $unset: { parentId: 1 },
            },
            { upsert: true, new: true }
        );
        categoryDocMap.set(parentCat.name, parentDoc);
        console.log(`Parent Category: ${parentDoc.name}`);

        for (const childCat of parentCat.children) {
            const childSlug = childCat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const childImg = await ensureDownloaded(childCat.image, `categories/${childSlug}.webp`);

            const childDoc = await Category.findOneAndUpdate(
                { name: childCat.name, sellerId: { $exists: false } },
                {
                    $set: {
                        name: childCat.name,
                        image: childImg,
                        parentId: parentDoc._id,
                        attributeSetId: apparelSet._id,
                        commissionPercent: childCat.commissionPercent,
                        approvalStatus: 'approved',
                        isApproved: true,
                        isActive: true,
                        sortOrder: childCat.sortOrder,
                        requiresFssai: false,
                        seedTag: SEED_TAG,
                    },
                },
                { upsert: true, new: true }
            );
            categoryDocMap.set(childCat.name, childDoc);
            console.log(`  -> Subcategory: ${childDoc.name} (commission: ${childDoc.commissionPercent}%, attributeSet: Apparel)`);
        }
    }

    console.log(`\n--- Step 5: Products & Variant Matrix ---`);
    const createdProducts = [];
    let productIndex = 0;

    for (const item of CATALOGUE_ITEMS) {
        const [
            subCatName,
            prodName,
            sellerIndex,
            price,
            mrp,
            colours,
            sizes,
            isQuick,
            stockShop,
            stockQuick,
            remotePhotoUrls,
            description,
            tags,
        ] = item;

        const category = categoryDocMap.get(subCatName);
        if (!category) {
            console.warn(`Category not found: ${subCatName}`);
            continue;
        }

        const seller = sellerDocs[sellerIndex];
        const prodSlug = prodName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Download photos for this product
        const downloadedPhotos = [];
        for (let i = 0; i < remotePhotoUrls.length; i++) {
            const photoRel = `products/${category._id}/${prodSlug}/${i + 1}.webp`;
            try {
                const url = await ensureDownloaded(remotePhotoUrls[i], photoRel);
                downloadedPhotos.push(url);
            } catch (err) {
                console.warn(`Could not download image ${i + 1} for ${prodName}: ${err.message}`);
            }
        }
        if (downloadedPhotos.length === 0) {
            downloadedPhotos.push(category.image);
        }

        // Channels & Stock
        const channels = {
            shop: true,
            quick: isQuick && seller.channels.quick.status === 'approved',
        };
        const stock = {
            shop: stockShop,
            quick: channels.quick ? (stockQuick ?? 10) : null,
        };

        // Build Variants: Size x Colour
        const variants = [];
        let variantStockShop = stockShop !== null ? Math.floor(stockShop / (sizes.length * colours.length)) + 1 : null;
        let variantStockQuick = channels.quick ? 5 : null;

        for (const colour of colours) {
            // Assign colour photos (use available photos)
            const colourPhotos = downloadedPhotos;

            for (const size of sizes) {
                const skuCode = `${seller.sellerName.substring(0, 2).toUpperCase()}-${prodSlug.substring(0, 6).toUpperCase()}-${colour.substring(0, 3).toUpperCase()}-${size}`;
                variants.push({
                    name: `${size} / ${colour}`,
                    price,
                    mrp,
                    sku: skuCode,
                    attributes: [
                        { name: 'Size', value: size },
                        { name: 'Colour', value: colour },
                    ],
                    channels: { quick: null, shop: null }, // Inherit product channels
                    stock: {
                        shop: stockShop === 0 ? 0 : variantStockShop,
                        quick: channels.quick ? variantStockQuick : null,
                    },
                    lowStockThreshold: { shop: 2, quick: 2 },
                    images: colourPhotos,
                    isActive: true,
                });
            }
        }

        // Determine GST rate: <= ₹1000 is 5%, > ₹1000 is 12%
        const gstRate = price <= 1000 ? 5 : 12;

        // Upsert Product using Mongoose Model instance to trigger pre('validate') hook
        let productDoc = await Product.findOne({ sellerId: seller._id, name: prodName });
        if (!productDoc) {
            productDoc = new Product({ sellerId: seller._id, name: prodName });
        }

        productDoc.categoryId = category._id;
        productDoc.categoryName = category.name;
        productDoc.brand = seller.sellerName;
        productDoc.packSize = 'Pack of 1';
        productDoc.description = description;
        productDoc.price = price;
        productDoc.mrp = mrp;
        productDoc.otherPrice = 0;
        productDoc.gstRate = gstRate;
        productDoc.channels = channels;
        productDoc.stock = stock;
        productDoc.lowStockThreshold = { shop: 5, quick: channels.quick ? 5 : null };
        productDoc.maxQtyPerOrder = 10;
        productDoc.image = downloadedPhotos[0];
        productDoc.images = downloadedPhotos;
        productDoc.variants = variants;
        productDoc.tags = tags;
        productDoc.foodType = null;
        productDoc.approvalStatus = 'approved';
        productDoc.approvedAt = new Date();
        productDoc.isAvailable = true;
        productDoc.seedTag = SEED_TAG;

        // Save triggers pre('validate') which executes computeAvailableIn
        await productDoc.save();

        createdProducts.push(productDoc);
        productIndex++;
        console.log(`[${productIndex}/${CATALOGUE_ITEMS.length}] ${prodName} -> ₹${price} (MRP: ₹${mrp}, GST: ${gstRate}%) | Variants: ${variants.length} | Available: Shop=${productDoc.availableIn?.shop}, Quick=${productDoc.availableIn?.quick}`);
    }

    console.log(`\n--- Step 6: Hero Banners & Promotion Banners ---`);
    for (const b of HERO_BANNERS) {
        const bannerSlug = b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20);
        const imgUrl = await ensureDownloaded(b.imageUrl, `banners/hero-${bannerSlug}.webp`);
        await HeroBanner.findOneAndUpdate(
            { title: b.title },
            {
                $set: {
                    title: b.title,
                    ctaText: b.ctaText,
                    ctaLink: b.ctaLink,
                    sortOrder: b.sortOrder,
                    imageUrl: imgUrl,
                    publicId: `hero-${bannerSlug}`,
                    isActive: true,
                    seedTag: SEED_TAG,
                },
            },
            { upsert: true, new: true }
        );
        console.log(`Hero Banner: ${b.title}`);
    }

    for (const b of PROMO_BANNERS) {
        const bannerSlug = b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20);
        const imgUrl = await ensureDownloaded(b.imageUrl, `banners/promo-${bannerSlug}.webp`);
        await HomePromotionBanner.findOneAndUpdate(
            { title: b.title },
            {
                $set: {
                    title: b.title,
                    ctaLink: b.ctaLink,
                    sortOrder: b.sortOrder,
                    imageUrl: imgUrl,
                    publicId: `promo-${bannerSlug}`,
                    isActive: true,
                    seedTag: SEED_TAG,
                },
            },
            { upsert: true, new: true }
        );
        console.log(`Promo Banner: ${b.title}`);
    }

    // Ensure Landing Settings are enabled
    await LandingSettings.findOneAndUpdate(
        {},
        {
            $set: {
                showHeroBanners: true,
                showExploreIcons: true,
                showTop10: true,
                recommendedSellerIds: sellerDocs.map((s) => s._id),
            },
        },
        { upsert: true, new: true }
    );
    console.log(`Landing settings updated (showHeroBanners: true, recommended sellers: ${sellerDocs.length})`);

    console.log(`\n--- Step 7: Customer Product Reviews ---`);
    // Create/find test reviewer users
    const reviewers = [
        { name: 'Priya Sharma', phone: '9111111101', email: 'priya.buyer@example.com' },
        { name: 'Rahul Verma', phone: '9111111102', email: 'rahul.buyer@example.com' },
        { name: 'Arjun Nambiar', phone: '9111111103', email: 'arjun.buyer@example.com' },
        { name: 'Karthik Rao', phone: '9111111104', email: 'karthik.buyer@example.com' },
        { name: 'Neha Patel', phone: '9111111105', email: 'neha.buyer@example.com' },
        { name: 'Sunita Reddy', phone: '9111111106', email: 'sunita.buyer@example.com' },
    ];

    const reviewerDocs = [];
    for (const r of reviewers) {
        const u = await User.findOneAndUpdate(
            { phone: r.phone },
            {
                $set: {
                    name: r.name,
                    phone: r.phone,
                    email: r.email,
                    role: 'USER',
                    isPhoneVerified: true,
                    isActive: true,
                    seedTag: SEED_TAG,
                },
            },
            { upsert: true, new: true }
        );
        reviewerDocs.push(u);
    }

    for (let i = 0; i < SAMPLE_REVIEWS.length; i++) {
        const reviewData = SAMPLE_REVIEWS[i];
        const product = createdProducts[reviewData.productIndex];
        if (!product) continue;

        const reviewer = reviewerDocs[i % reviewerDocs.length];
        await ProductReview.findOneAndUpdate(
            { productId: product._id, userId: reviewer._id },
            {
                $set: {
                    productId: product._id,
                    sellerId: product.sellerId,
                    userId: reviewer._id,
                    rating: reviewData.rating,
                    title: reviewData.title,
                    text: reviewData.text,
                    status: 'visible',
                    channel: 'shop',
                    seedTag: SEED_TAG,
                },
            },
            { upsert: true, new: true }
        );
        await recomputeProductRating(product._id);
        console.log(`Review added: "${reviewData.title}" (${reviewData.rating}★) on ${product.name}`);
    }

    console.log(`\n--- Step 8: Promotional Offers & Coupons ---`);
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    for (const off of SEED_OFFERS) {
        const seller = off.sellerIndex !== undefined ? sellerDocs[off.sellerIndex] : null;
        await Offer.findOneAndUpdate(
            { couponCode: off.couponCode },
            {
                $set: {
                    couponCode: off.couponCode,
                    discountType: off.discountType,
                    discountValue: off.discountValue,
                    minOrderValue: off.minOrderValue,
                    maxDiscount: off.maxDiscount ?? null,
                    customerScope: off.customerScope,
                    sellerScope: off.sellerScope,
                    sellerId: seller ? seller._id : undefined,
                    sellerIds: seller ? [seller._id] : [],
                    isFirstOrderOnly: off.isFirstOrderOnly,
                    startDate: new Date(),
                    endDate: oneYearLater,
                    status: 'active',
                    showInCart: true,
                    seedTag: SEED_TAG,
                },
            },
            { upsert: true, new: true }
        );
        console.log(`Offer Coupon: ${off.couponCode} (${off.title}) [Scope: ${off.sellerScope}]`);
    }

    // Disk usage summary
    let folderSizeBytes = 0;
    let fileCount = 0;
    if (fs.existsSync(SEED_MEDIA_DIR)) {
        const walk = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const full = path.join(dir, file);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) {
                    walk(full);
                } else {
                    folderSizeBytes += stat.size;
                    fileCount++;
                }
            }
        };
        walk(SEED_MEDIA_DIR);
    }
    const folderSizeMB = (folderSizeBytes / (1024 * 1024)).toFixed(2);

    console.log(`\n================ SEED SUMMARY ================`);
    console.log(`Sellers:           ${sellerDocs.length}`);
    console.log(`Categories:        ${categoryDocMap.size} (Parents & Children)`);
    console.log(`Apparel Products:  ${createdProducts.length}`);
    console.log(`Hero Banners:      ${HERO_BANNERS.length}`);
    console.log(`Promo Banners:     ${PROMO_BANNERS.length}`);
    console.log(`Reviews Seeded:    ${SAMPLE_REVIEWS.length}`);
    console.log(`Offers Seeded:     ${SEED_OFFERS.length}`);
    console.log(`Media Files:       ${fileCount} files (${folderSizeMB} MB in ${SEED_MEDIA_DIR})`);
    console.log(`==============================================`);
    console.log(`\nTo re-run idempotently:`);
    console.log(`  node scripts/seed-apparel.mjs`);
    console.log(`\nTo rollback/wipe seeded data:`);
    console.log(`  node scripts/seed-apparel.mjs --wipe`);

    await mongoose.disconnect();
    console.log('Finished successfully.');
}

main().catch((err) => {
    console.error('Fatal seed error:', err);
    process.exit(1);
});
