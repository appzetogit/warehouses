import mongoose from 'mongoose';
import { Product } from '../../admin/models/product.model.js';
import { Category } from '../../admin/models/category.model.js';
import { Order } from '../../orders/models/order.model.js';
import { Offer } from '../../admin/models/offer.model.js';
import { getCoinBalance } from '../../coins/services/coin.service.js';
import { logger } from '../../../../utils/logger.js';
import { config } from '../../../../config/env.js';
import { callGemini, hasGeminiKey } from './geminiClient.js';
import { effectiveModel } from './aiSettings.service.js';

/** The assistant's persona and scope, named after the configured brand. */
const systemInstruction = () => `You are the shopping assistant for ${config.brand.name}, a marketplace with quick delivery and standard courier shipping.
You help customers:
1. Discover products, compare variants, and find the best deals.
2. Track existing orders and delivery phases.
3. Understand coins, rewards and coupons.
4. Distinguish between Quick Delivery (about 30 minutes from nearby stores) and Standard courier shipping.
You cannot place, cancel or refund orders; point the customer to the app for that.
Keep answers concise and helpful. Suggest relevant actions when useful.`;

// Words that say nothing about the product wanted.
const NOISE_WORDS = new Set(`find show give me search for buy get looking look want need i a an the some any please pls of in
with to my can you do have is are there hi hello hey ok okay thanks thank yes no see more other another all also and or on at
popular trending latest new best good nice top products product items item something anything stuff clothes clothing collection
filter low lowest first price prices cheap cheapest budget chahiye dikhao mujhe koi ka ki ke wala wali hai`.split(/\s+/));

// Spellings of the same thing; each key is matched by its pattern in names and categories.
const TERM_PATTERNS = {
    tshirt: 't[\\s-]?shirts?|tees?',
    women: "wom[ae]n(?:'?s)?|ladies|lady|girls?",
    men: "m[ae]n(?:'?s)?|gents?|boys?",
    kids: 'kids?|child(?:ren)?',
};
const TERM_ALIASES = {
    woman: 'women', womens: 'women', ladies: 'women', lady: 'women', girl: 'women', girls: 'women',
    man: 'men', mens: 'men', gents: 'men', boy: 'men', boys: 'men',
    kid: 'kids', children: 'kids', child: 'kids',
};

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The product words in a message: "find the t-shirt" -> ['tshirt']. */
function searchTerms(text) {
    const cleaned = String(text || '').toLowerCase()
        .replace(/\bt[\s-]?shirts?\b|\btees?\b/g, 'tshirt')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const terms = cleaned.split(/\s+/)
        .filter((w) => w && !NOISE_WORDS.has(w) && !/^\d+$/.test(w))
        .map((w) => TERM_ALIASES[w] || w);
    return [...new Set(terms)].slice(0, 6);
}

const termRegex = (term) => {
    if (TERM_PATTERNS[term]) return new RegExp(`\\b(?:${TERM_PATTERNS[term]})\\b`, 'i');
    const stem = term.length > 3 ? term.replace(/(es|s)$/, '') : term;
    return new RegExp(`\\b${escapeRegex(stem)}(?:s|es)?\\b`, 'i');
};

/** Categories a term names, with their subcategories: "women" covers Tops, Kurtas... */
async function categoryIdsForTerm(regex) {
    const hits = await Category.find({ name: regex, isActive: { $ne: false } }).select('_id').lean();
    if (!hits.length) return [];
    const ids = hits.map((c) => c._id);
    const children = await Category.find({ parentId: { $in: ids } }).select('_id').lean();
    return [...ids, ...children.map((c) => c._id)];
}

/**
 * Tool 1: Search products from live catalogue. Every term has to match, in any
 * order, in the name, brand or category; the description only if nothing does.
 */
async function toolSearchProducts(terms, { maxPrice = null, sort = null } = {}) {
    const base = { isDeleted: { $ne: true }, isAvailable: true, approvalStatus: 'approved' };
    if (maxPrice && Number(maxPrice) > 0) base.price = { $lte: Number(maxPrice) };

    const clauses = await Promise.all((terms || []).map(async (term) => {
        const regex = termRegex(term);
        const categoryIds = await categoryIdsForTerm(regex);
        return {
            regex,
            or: [
                { name: regex },
                { brand: regex },
                { categoryName: regex },
                ...(categoryIds.length ? [{ categoryId: { $in: categoryIds } }] : []),
            ],
        };
    }));

    const run = (filter) => Product.find(filter)
        .select('_id name brand price mrp image images categoryName sellerId isAvailable availableIn variants')
        .sort(sort || { createdAt: -1 })
        .limit(6)
        .lean();

    let items = await run(clauses.length ? { ...base, $and: clauses.map((c) => ({ $or: c.or })) } : base);
    if (!items.length && clauses.length) {
        items = await run({ ...base, $and: clauses.map((c) => ({ $or: [...c.or, { description: c.regex }] })) });
    }

    return items.map((p) => {
        const primaryImage = p.image || p.images?.[0] || '';
        return {
            id: p._id,
            name: p.name,
            brand: p.brand || '',
            price: p.price,
            mrp: p.mrp || p.price,
            discount: p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
            image: primaryImage,
            hasVariants: Array.isArray(p.variants) && p.variants.length > 0,
            inStock: p.isAvailable !== false,
            availableIn: { quick: p.availableIn?.quick !== false, shop: p.availableIn?.shop !== false },
        };
    });
}

/**
 * Tool 2: Get user's recent orders.
 */
async function toolGetUserOrders(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return [];
    const orders = await Order.find({ userId: new mongoose.Types.ObjectId(String(userId)) })
        .sort({ createdAt: -1 })
        .limit(3)
        .select('order_id orderId orderStatus deliveryState pricing items fulfilmentMode createdAt')
        .lean();

    return orders.map((o) => ({
        orderId: o.order_id || o.orderId || String(o._id),
        status: o.orderStatus,
        phase: o.deliveryState?.currentPhase || o.orderStatus,
        total: o.pricing?.total || 0,
        mode: o.fulfilmentMode || 'quick',
        itemCount: o.items?.length || 0,
        items: (o.items || []).slice(0, 3).map((it) => it.name || it.dishName || 'Item'),
        date: o.createdAt,
    }));
}

/**
 * Tool 3: Get user's coin balance.
 */
async function toolGetCoinBalance(userId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return null;
    return getCoinBalance(userId).catch(() => null);
}

/**
 * Tool 4: Get active offers.
 */
async function toolGetActiveOffers() {
    const now = new Date();
    const offers = await Offer.find({
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now },
    })
        .select('title couponCode discountType discountValue minOrderAmount maxDiscount')
        .limit(4)
        .lean();
    return offers;
}

/**
 * Process a user chat message with intelligent local intent resolution
 * and optional Google Gemini API augmentation.
 */
export async function handleAssistantChat({ message, userId = null, history = [], settings = null, audience = 'customer' }) {
    // Sellers get how-to help only: none of the shopper shortcuts below run for them.
    if (audience === 'seller') return handleSellerHelpChat({ message, history, settings });
    const text = String(message || '').trim();
    if (!text) {
        return {
            reply: "Hi there! I'm the assistant. How can I help you today? You can search products, check order status, or explore coins!",
            products: [],
            suggestions: ['Find latest offers', 'Track my order', 'My coins', 'Quick vs Standard'],
        };
    }

    const lower = text.toLowerCase();

    // 1. Check intent: Coins & Rewards
    if (lower.includes('coin') || lower.includes('reward') || lower.includes('balance') || lower.includes('spin')) {
        let coinData = null;
        if (userId) {
            coinData = await toolGetCoinBalance(userId);
        }
        const balanceText = coinData
            ? `You currently have **${coinData.usable} usable coins** (worth ₹${coinData.usableValue})!`
            : `coins can be earned through order refunds, referrals, and the Daily Lucky Wheel!`;

        return {
            reply: `${balanceText}\n\n💡 **How it works:**\n- 1 Coin = ₹1 discount on checkouts.\n- You can pay up to **50%** of any order total using coins.\n- Refund coins give you 80% usable balance with instant credit.`,
            suggestions: ['Play Daily Lucky Wheel', 'Explore trending items', 'Track my order'],
            action: { type: 'coins', data: coinData },
            toolCalls: [{ name: 'getCoinBalance', args: null }],
        };
    }

    // 2. Check intent: Order tracking
    if (lower.includes('order') || lower.includes('track') || lower.includes('where is my') || lower.includes('status')) {
        if (!userId) {
            return {
                reply: 'To track your live orders, please log in to your account. I can show you live courier tracking and delivery stages right here!',
                suggestions: ['Browse products', 'Check available offers'],
            };
        }
        const orders = await toolGetUserOrders(userId);
        if (!orders.length) {
            return {
                reply: "You don't have any recent orders placed yet. Would you like to check out some trending products or active coupons?",
                suggestions: ['Show popular products', 'Active coupons'],
            };
        }

        const latest = orders[0];
        const readablePhase = (latest.phase || latest.status || 'placed').replace(/_/g, ' ').toUpperCase();
        return {
            reply: `Here is your latest order **#${latest.orderId}**:\n- **Status:** ${readablePhase}\n- **Mode:** ${latest.mode === 'quick' ? '⚡ Quick Delivery (15-30m)' : '📦 Standard Courier'}\n- **Amount:** ₹${latest.total}\n- **Items:** ${latest.items.join(', ')}`,
            orders,
            toolCalls: [{ name: 'getUserOrders', args: null }],
            suggestions: ['Need help with this order?', 'Browse more products', 'Check coins balance'],
        };
    }

    // 3. Check intent: Offers & Discounts
    if (lower.includes('offer') || lower.includes('coupon') || lower.includes('discount') || lower.includes('promo') || lower.includes('deal')) {
        const offers = await toolGetActiveOffers();
        const offerList = offers.length
            ? offers.map((o) => `🏷️ **${o.couponCode}**: ${o.title} (${o.discountType === 'percentage' ? `${o.discountValue}% OFF` : `₹${o.discountValue} OFF`})`).join('\n')
            : 'Check out our daily discounts on popular category pages!';

        return {
            toolCalls: [{ name: 'getActiveOffers', args: null }],
            reply: `Here are the top promotions available today:\n\n${offerList}\n\nApply these codes at checkout or redeem your coins for up to 50% off!`,
            suggestions: ['Search clothing', 'Find electronics', 'How to use coins'],
        };
    }

    // 4. Check intent: Product search
    const priceMatch = text.match(/(?:under|below|less than|within)\s*(?:rs\.?|inr|₹)?\s*(\d+)/i);
    const maxPrice = priceMatch ? parseInt(priceMatch[1], 10) : null;
    const withoutPrice = priceMatch ? text.replace(priceMatch[0], ' ') : text;
    const sort = /low(est)? price|cheap/i.test(text) ? { price: 1 } : null;

    // A question about the store goes to the assistant, not the catalogue.
    const wantsProducts = /\b(find|show|search|buy|recommend|suggest|looking|want|need|products?|popular|trending|latest|chahiye|dikhao)\b/i.test(text);
    const isInfo = !wantsProducts && (/\?|^(what|how|why|when|where|who|does|can|is|are|do)\b/i.test(text)
        || /\b(quick|delivery|shipping|courier|return|refund|cancel|payment|cod|support|contact|help|policy)\b/i.test(text));

    if (!isInfo) {
        // "1" answers the numbered list in the assistant's last message.
        const picked = /^\d{1,2}$/.test(text) ? pickFromLastList(history, Number(text)) : '';
        const terms = searchTerms(picked || withoutPrice);
        const prior = priorShoppingTerms(history, text);

        // A short message refines what was being looked for: "women" after "t-shirt".
        const attempts = [];
        if (terms.length <= 2 && prior.length) {
            attempts.push([...prior, ...terms]);
            if (prior.length > 1 && terms.length) attempts.push([prior[prior.length - 1], ...terms]);
        }
        if (terms.length) attempts.push(terms);
        else if (!prior.length && (wantsProducts || maxPrice || sort)) attempts.push([]);

        for (const attempt of attempts) {
            const unique = [...new Set(attempt)];
            const foundProducts = await toolSearchProducts(unique, { maxPrice, sort });
            if (foundProducts.length > 0) {
                const label = unique.map((t) => (t === 'tshirt' ? 't-shirts' : t)).join(' ');
                return {
                    reply: `Here ${foundProducts.length > 1 ? `are ${foundProducts.length} options` : 'is 1 option'}${label ? ` for "${label}"` : ''}${maxPrice ? ` under ₹${maxPrice}` : ''}:`,
                    products: foundProducts,
                    toolCalls: [{ name: 'searchProducts', args: { query: label, maxPrice } }],
                    suggestions: productSuggestions(foundProducts, maxPrice),
                };
            }
        }
    }

    // Nothing to show: never let the assistant make up what the store sells.
    const categories = await sellingCategoryNames();

    // 5. Ask Gemini when a key is configured (the caller has already checked
    //    the enabled switch, the daily cap and the monthly budget).
    if (hasGeminiKey()) {
        try {
            const addendum = String(settings?.systemPromptAddendum || '').trim();
            const priorTurns = toGeminiTurns(history);
            const catalogue = `What the store sells right now: ${categories.join(', ') || 'see the categories in the app'}.
Rules:
- Only mention these categories. Never invent products, styles, brands or prices.
- Our product search already ran for this message and found nothing. If the customer asked for something not listed, say plainly we don't have it yet and suggest the closest category above.
- Ask at most one short question, and never repeat a question from earlier in this chat. Do not give numbered lists of options.`;
            const result = await callGemini({
                model: effectiveModel(settings),
                systemText: `${systemInstruction()}\n\n${catalogue}${addendum ? `\n\nAdditional guidance from the store:\n${addendum}` : ''}`,
                contents: [...priorTurns, { role: 'user', parts: [{ text }] }],
                generationConfig: { maxOutputTokens: 400 },
            });
            if (result.text) {
                return {
                    reply: result.text,
                    usage: result.usage,
                    model: result.model,
                    suggestions: isInfo ? ['Search popular products', 'My coins', 'Track latest order'] : categories.slice(0, 4),
                };
            }
            return fallbackReply(categories, isInfo, { usage: result.usage, model: result.model });
        } catch (geminiErr) {
            // The message only; the request config (with its headers) is never logged.
            logger.warn(`Gemini API call skipped/failed: ${geminiErr.message}`);
        }
    }

    return fallbackReply(categories, isInfo);
}

/** The label of option `n` in the assistant's last numbered list, if it wrote one. */
function pickFromLastList(history, n) {
    const last = [...(Array.isArray(history) ? history : [])].reverse().find((h) => h && h.role !== 'user' && typeof h.text === 'string');
    if (!last) return '';
    const line = last.text.match(new RegExp(`(?:^|\\n|\\s)${n}[.)]\\s*\\**([^*:\\n]+)`));
    return line ? line[1].trim() : '';
}

/** What the customer was looking for earlier in this chat, oldest first. */
function priorShoppingTerms(history, currentText) {
    const earlier = (Array.isArray(history) ? history : [])
        .filter((h) => h && h.role === 'user' && typeof h.text === 'string' && h.text.trim() !== currentText)
        .slice(-2);
    return [...new Set(earlier
        .filter((h) => !/\b(coin|reward|wallet|order|track|offer|coupon|deal|quick|delivery|standard)/i.test(h.text))
        .flatMap((h) => searchTerms(h.text)))];
}

/** Next steps that exist: the categories in these results, and a price filter. */
function productSuggestions(products, maxPrice) {
    const names = [...new Set(products.map((p) => p.categoryName).filter(Boolean))].slice(0, 2);
    return [...names, ...(maxPrice ? [] : ['Under ₹500']), 'Lowest price first', 'Check active coupons'].slice(0, 4);
}

/** Names of the subcategories that have products on sale, for honest answers. */
async function sellingCategoryNames() {
    try {
        const names = await Product.distinct('categoryName', { isDeleted: { $ne: true }, isAvailable: true, approvalStatus: 'approved' });
        return names.filter(Boolean).slice(0, 20);
    } catch {
        return [];
    }
}

function fallbackReply(categories = [], isInfo = false, extra = {}) {
    if (!isInfo && categories.length) {
        return {
            reply: `I couldn't find that right now. We currently have: ${categories.slice(0, 8).join(', ')}. Pick one and I'll show you what's available.`,
            suggestions: categories.slice(0, 4),
            ...extra,
        };
    }
    return {
        reply: `I can help you explore products, check available deals, track your courier shipments, or manage coins. What would you like to discover?`,
        suggestions: ['Search popular products', 'What is Quick Delivery?', 'Check today’s coupons', 'My coins'],
        ...extra,
    };
}

/** The last few chat turns in Gemini's shape, opening with a user turn as Gemini requires. */
function toGeminiTurns(history) {
    const turns = (Array.isArray(history) ? history : []).slice(-6)
        .filter((h) => h && typeof h.text === 'string' && h.text.trim())
        .map((h) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text.slice(0, 1000) }] }));
    while (turns.length && turns[0].role !== 'user') turns.shift();
    return turns;
}

/* ------------------------------------------------------------ seller help */

/**
 * The seller help persona: how to use the seller panel and app. It carries no
 * seller data (orders, earnings, documents, phone); the model only explains.
 */
const sellerSystemInstruction = () => `You are the seller help assistant for ${config.brand.name}, a marketplace where stores sell through two channels: Quick (about 30-minute delivery from the store to nearby customers) and Shop (standard courier shipping).
You help sellers use the seller panel and the seller app. Explain step by step, using the panel's own names:
- Products: Inventory > add a product with name, category, price, MRP, stock and photos (clear, well lit, plain background). Products with options (size, colour, pack size) get variants, each with its own price and stock. New and edited products go to admin approval before customers see them; a rejected product shows the reason, fix it and resubmit. Each product can be offered on Quick, Shop or both.
- Orders: new orders appear in Live orders. Accept the order, mark it Preparing while you pack it, then Ready so the delivery partner (Quick) or courier (Shop) can pick it up. Past orders are in Order history; customer issues are under Complaints.
- Store: Store Timings sets opening hours and the open or closed switch (a closed store gets no Quick orders). Store Info holds the store details; Zone setup and the store location decide which customers can order on Quick.
- Payouts: Payouts shows earnings, settlements, invoices and withdrawals; Bank details is where the payout account is set. Settlements follow delivered orders, after the platform commission.
- Documents and approval: a new store uploads its documents (such as ID, GST or FSSAI where needed) and waits for admin approval; each channel (Quick, Shop) is approved separately.
- Support: for anything you cannot solve here, raise a ticket from Help > Support.
You cannot see or change the seller's account, orders, earnings or documents, and you must not claim to. Never invent policies, fees, commission rates or payout dates; for account-specific questions, point the seller to the right panel page or to a Support ticket.
Keep answers short and practical, with numbered steps when there is a process.`;

export const SELLER_SUGGESTIONS = ['How do I add a product?', 'How do variants work?', 'How do I accept an order?', 'When do I get paid?'];

const SELLER_SUPPORT_LINE = 'If you still need help, raise a ticket from Help > Support and our team will get back to you.';

/** Short how-to answers used when the model is off, so sellers still get something useful. */
const SELLER_TOPICS = [
    { re: /variant|size|colou?r|pack/i, reply: 'To add options such as size or colour, open the product in Inventory and add variants. Each variant has its own price and stock.' },
    { re: /photo|image|picture/i, reply: 'Add product photos from the product form in Inventory. Use clear, well lit photos on a plain background; the first photo is the one customers see first.' },
    { re: /approv|reject|document|kyc|gst|fssai/i, reply: 'New and edited products, and your store documents, are reviewed by the admin team. A rejected item shows the reason: fix it and resubmit. Quick and Shop are approved separately.' },
    { re: /product|inventory|stock|catalog/i, reply: 'To add a product, open Inventory, tap Add product, fill in the name, category, price, MRP and stock, add photos, choose Quick, Shop or both, and submit it for approval.' },
    { re: /order|accept|prepar|ready|pick ?up/i, reply: 'New orders appear in Live orders. Accept the order, mark it Preparing while you pack it, then mark it Ready so it can be picked up. Past orders are in Order history.' },
    { re: /timing|hours|open|close|holiday/i, reply: 'Set your opening hours and the open or closed switch from Store Timings. While the store is closed it gets no Quick orders.' },
    { re: /quick|shop|courier|channel/i, reply: 'Quick is about 30-minute delivery from your store to nearby customers; Shop is standard courier shipping. Each product can be offered on either or both.' },
    { re: /pay|settle|earning|withdraw|bank|invoice|commission/i, reply: 'Your earnings, settlements, invoices and withdrawals are under Payouts, and your payout account is under Bank details.' },
    { re: /zone|location|area|address|map/i, reply: 'Your store location and Zone setup decide which nearby customers can order from you on Quick. Update them from Store Info and Zone setup.' },
    { re: /ticket|support|help|complain/i, reply: 'Raise a ticket from Help > Support. Customer complaints about orders are listed under Complaints.' },
];

function sellerFallbackReply(text, extra = {}) {
    const topic = SELLER_TOPICS.find((t) => t.re.test(text || ''));
    return {
        reply: topic
            ? `${topic.reply}\n\n${SELLER_SUPPORT_LINE}`
            : `I can explain how to add products and variants, handle orders, set store timings, and understand payouts. ${SELLER_SUPPORT_LINE}`,
        suggestions: SELLER_SUGGESTIONS,
        ...extra,
    };
}

/**
 * Seller "AI Help": how-to answers about the seller panel. No catalogue,
 * order, coin or cart lookups, and no seller data in the prompt. Never throws
 * for a missing key or a failed model call; it falls back to a plain answer.
 */
export async function handleSellerHelpChat({ message, history = [], settings = null }) {
    const text = String(message || '').trim();
    if (!text) {
        return { reply: 'Hi! Ask me how to do something in the seller panel, such as adding a product or accepting an order.', suggestions: SELLER_SUGGESTIONS };
    }
    if (hasGeminiKey()) {
        try {
            const result = await callGemini({
                model: effectiveModel(settings),
                systemText: sellerSystemInstruction(),
                contents: [...toGeminiTurns(history), { role: 'user', parts: [{ text }] }],
                generationConfig: { maxOutputTokens: 500 },
            });
            if (result.text) {
                return { reply: result.text, usage: result.usage, model: result.model, suggestions: SELLER_SUGGESTIONS };
            }
            return sellerFallbackReply(text, { usage: result.usage, model: result.model });
        } catch (geminiErr) {
            // The message only; the request config (with its headers) is never logged.
            logger.warn(`Gemini seller help call skipped/failed: ${geminiErr.message}`);
        }
    }
    return sellerFallbackReply(text);
}
