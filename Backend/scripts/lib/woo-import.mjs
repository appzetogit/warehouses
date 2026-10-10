/**
 * Pure mapping from a WooCommerce Store API export (the old thewarehousess.com
 * shop) to Warehouses products. No database or file access here, so the rules
 * can be tested on their own; scripts/import-woocommerce.mjs does the writing.
 */

const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    hellip: '…', bull: '•', times: '×',
};

export function decodeEntities(text) {
    return String(text ?? '')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** "Best Floral Print Crop Top &#8211; The Warehousess" -> "Best Floral Print Crop Top". */
export function cleanName(name) {
    return decodeEntities(name)
        .replace(/\s*[–—-]\s*the\s+warehousess?\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Description HTML -> plain paragraphs, with list items as "• " lines. */
export function htmlToText(html) {
    const text = decodeEntities(
        String(html ?? '')
            .replace(/<li[^>]*>/gi, '\n• ')
            .replace(/<\/(p|h[1-6]|li|ul|ol|div)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
    );
    const lines = [];
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\s+/g, ' ').trim();
        if (!line) continue;
        // WooCommerce wraps <li> content in newlines, leaving "•" alone on a line.
        if (lines.at(-1) === '•') lines[lines.length - 1] = line === '•' ? '•' : `• ${line}`;
        else lines.push(line);
    }
    // Paragraphs and headings are separated by a blank line; list items are not.
    return lines
        .filter((line) => line !== '•')
        .map((line, i, all) => (i && !(line.startsWith('• ') && all[i - 1].startsWith('• ')) ? `\n${line}` : line))
        .join('\n');
}

/** Store API prices are strings in minor units ("7900" with minor unit 2 -> 79). */
export function toRupees(minor, minorUnit = 2) {
    const n = Number(minor);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n) / 10 ** minorUnit;
}

/**
 * Units on hand from WooCommerce's stock text: "3 in stock" -> 3,
 * "Out of stock" -> 0, and no text (stock not tracked) -> null, which here
 * means not counted, as it did there.
 */
export function parseStock(item) {
    const text = String(item?.stock_availability?.text ?? '').trim();
    const counted = text.match(/^(\d+)\s+in stock/i);
    if (counted) return Number(counted[1]);
    if (item?.is_in_stock === false || /out of stock/i.test(text)) return 0;
    return null;
}

const SIZE_ALIASES = { XXXL: '3XL', XXXXL: '4XL', XXXXXL: '5XL', 'FREE SIZE': 'Free Size', FREESIZE: 'Free Size' };

function titleCase(value) {
    return value.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}

/** WooCommerce attribute -> ours: "size"/"Size" -> Size, "Color" -> Colour, with tidied values. */
export function normaliseAttribute(name, value) {
    const key = String(name ?? '').trim().toLowerCase();
    const raw = decodeEntities(value).trim();
    if (key === 'size' || key === 'pa_size') {
        const upper = raw.toUpperCase();
        return { name: 'Size', value: SIZE_ALIASES[upper] ?? (/^[0-9]*X*[SML]$|^[0-9]XL$/.test(upper) ? upper : titleCase(raw)) };
    }
    if (key === 'color' || key === 'colour' || key === 'pa_color') {
        return { name: 'Colour', value: titleCase(raw.replace(/\s+colou?r\b/i, '')) };
    }
    return { name: titleCase(String(name).trim()), value: raw };
}

/** "Size: M, Color: Red" -> [{Size, M}, {Colour, Red}]. */
export function parseVariationLabel(label) {
    return decodeEntities(label)
        .split(/,\s*(?=[^,:]+:)/)
        .map((part) => part.split(':'))
        .filter((pair) => pair.length >= 2 && pair[0].trim() && pair.slice(1).join(':').trim())
        .map(([name, ...rest]) => normaliseAttribute(name, rest.join(':')));
}

/**
 * Target categories, as "Parent > Child". WooCommerce category names map
 * straight across; products with no category (or only "Sold Out") are placed
 * by their name, accessory words first so "Ring Earring" is an earring and
 * clothing before "ring" so "Ring Detail Fitted Top" is a top.
 */
export const TARGET_CATEGORIES = {
    kurtas: ['Women', 'Kurtas'],
    tops: ['Women', 'Tops'],
    dresses: ['Women', 'Dresses'],
    skirts: ['Women', 'Skirts'],
    pants: ['Women', 'Pants'],
    coords: ['Women', 'Co-ord Sets'],
    earrings: ['Accessories', 'Earrings'],
    neckpieces: ['Accessories', 'Neckpieces'],
    rings: ['Accessories', 'Rings'],
    bracelets: ['Accessories', 'Bracelets'],
    watches: ['Accessories', 'Watches'],
};

const BY_WOO_CATEGORY = {
    'kurta set': 'kurtas',
    'short kurti': 'kurtas',
    'western tops for women': 'tops',
    'western shirt for women': 'tops',
    'western dresses': 'dresses',
    skirts: 'skirts',
    pants: 'pants',
    'co ord set': 'coords',
    earrings: 'earrings',
    neckpiece: 'neckpieces',
    rings: 'rings',
    bracelets: 'bracelets',
    watch: 'watches',
};

const BY_NAME = [
    [/earring|jhumk|\bstuds?\b|ear ?cuff/i, 'earrings'],
    [/necklace|neckpiece|choker|pendant|mangalsutra|\bchain\b/i, 'neckpieces'],
    [/\bwatch/i, 'watches'],
    [/bracelet|bangle|\bkada\b/i, 'bracelets'],
    [/kurta|kurti|suit set|anarkali/i, 'kurtas'],
    [/co.?ord/i, 'coords'],
    [/dress|gown/i, 'dresses'],
    [/skirt/i, 'skirts'],
    [/\bpants?\b|trouser|palazzo|jogger/i, 'pants'],
    [/\btops?\b|shirt|\btee\b|t-shirt|blouse|tank|crop|corset|cami/i, 'tops'],
    [/\brings?\b/i, 'rings'],
];

export function categoryKeyFor(product) {
    for (const c of product?.categories ?? []) {
        const key = BY_WOO_CATEGORY[decodeEntities(c.name).trim().toLowerCase()];
        if (key) return key;
    }
    const name = cleanName(product?.name);
    for (const [pattern, key] of BY_NAME) if (pattern.test(name)) return key;
    return null;
}

/** Image URLs in display order, without repeats. */
function imageUrls(images) {
    return [...new Set((images ?? []).map((img) => img?.src).filter(Boolean))];
}

/**
 * One WooCommerce product -> the fields of our Product, with image URLs still
 * pointing at the old site (`imageFor` swaps them for uploaded copies).
 */
export function mapProduct(product, { imageFor = (url) => url } = {}) {
    const minorUnit = Number(product?.prices?.currency_minor_unit ?? 2);
    const images = imageUrls(product.images).map(imageFor).filter(Boolean);
    const details = (product._variationDetails ?? []).filter((v) => v && !v.error);

    const variants = details.map((v) => {
        const attributes = parseVariationLabel(v.variation);
        const price = toRupees(v.prices?.price, minorUnit);
        const mrp = toRupees(v.prices?.regular_price, minorUnit);
        const own = imageUrls(v.images).map(imageFor).filter(Boolean);
        return {
            name: attributes.map((a) => a.value).join(' / ') || cleanName(v.name),
            price,
            mrp: mrp > price ? mrp : null,
            sku: String(v.sku ?? '').trim(),
            attributes,
            channels: { quick: null, shop: null },
            stock: { shop: parseStock(v), quick: null },
            lowStockThreshold: { shop: null, quick: null },
            images: own.length ? own : images.slice(0, 1),
            isActive: true,
        };
    }).filter((v) => v.price > 0);

    const basePrice = toRupees(product.prices?.price, minorUnit);
    const baseMrp = toRupees(product.prices?.regular_price, minorUnit);

    // A simple product that names a single size ("Size: Free Size") as an
    // attribute rather than a variation carries it as its only option, so its
    // page shows the size like every other product.
    if (!variants.length && basePrice > 0) {
        const sizeAttr = (product.attributes || []).find((a) => /^(pa_)?size$/i.test(String(a?.name || a?.taxonomy || '')) && (a.terms || []).length === 1);
        if (sizeAttr) {
            const attribute = normaliseAttribute('size', sizeAttr.terms[0].name);
            variants.push({
                name: attribute.value,
                price: basePrice,
                mrp: baseMrp > basePrice ? baseMrp : null,
                sku: String(product.sku ?? '').trim(),
                attributes: [attribute],
                channels: { quick: null, shop: null },
                stock: { shop: parseStock(product), quick: null },
                lowStockThreshold: { shop: null, quick: null },
                images: images.slice(0, 1),
                isActive: true,
            });
        }
    }
    const cheapest = variants.length ? variants.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    const price = cheapest ? cheapest.price : basePrice;
    const mrp = cheapest ? cheapest.mrp : (baseMrp > basePrice ? baseMrp : null);

    // A lone "Free Size" stays a variant: the product page shows "Size: Free
    // Size" (chosen already, being the only one), as the old shop did.
    const keepVariants = variants.length > 0;
    const stockShop = keepVariants ? null : parseStock(product);

    return {
        name: cleanName(product.name),
        description: htmlToText(product.description) || htmlToText(product.short_description),
        price,
        mrp,
        sku: String(product.sku ?? '').trim(),
        image: images[0] ?? '',
        images,
        variants: keepVariants ? variants : [],
        stock: { shop: stockShop, quick: null },
        channels: { shop: true, quick: false },
        categoryKey: categoryKeyFor(product),
        packSize: 'Pack of 1',
        legacy: {
            source: 'woocommerce',
            id: product.id,
            slug: product.slug,
            permalink: product.permalink,
        },
    };
}
