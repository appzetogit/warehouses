/**
 * Moves the database off the "food" names, matching the code rename:
 * collections lose their food_ prefix (food_items becomes products), model
 * names stored as refPath values lose their Food prefix, and fields and values
 * that said "food" for a product say "product".
 *
 * Run after 2026-09-remove-food-only-features.mjs.
 *
 *   node scripts/migrations/2026-09-rename-food.mjs           # dry run
 *   node scripts/migrations/2026-09-rename-food.mjs --apply   # write
 *
 * Take a mongodump first; restoring it is the undo.
 *
 * The name lists below are frozen as of this migration on purpose. They say
 * what the names were, and the code that defined them is being renamed.
 */
import mongoose from 'mongoose';
import { config } from '../../src/config/env.js';
import { renameTokensInDb } from './lib/renameTokens.mjs';

/** What followed "Food" in a model name, e.g. FoodOrder, FoodSellerWallet. */
const MODELS = [
    'Admin', 'AdminWallet', 'BusinessSettings', 'CashbackSettings', 'Category', 'ChatConversation',
    'ChatMessage', 'DeliveryCashDeposit', 'DeliveryCashLimit', 'DeliveryCommissionRule',
    'DeliveryEmergencyHelp', 'DeliveryPartner', 'DeliveryWallet', 'DeliveryWithdrawal',
    'DriverRegistrationField', 'EarningAddon', 'EarningAddonHistory', 'ExploreIcon', 'FeatureSetting',
    'FeeSettings', 'HeroBanner', 'Item', 'LandingSettings', 'Notification', 'Offer', 'OfferUsage',
    'Order', 'Otp', 'PageContent', 'ReferralLog', 'ReferralSettings', 'RefreshToken',
    'SafetyEmergencyReport', 'Seller', 'SellerAppBanner', 'SellerCommission', 'SellerOutletTimings',
    'SellerSubscriptionHistory', 'SellerSubscriptionSettings', 'SellerSupportTicket', 'SellerWallet',
    'SellerWithdrawal', 'Settings', 'SubscriptionBillingRun', 'SubscriptionInvoice',
    'SubscriptionTransaction', 'SupportTicket', 'Transaction', 'UnregisteredSeller', 'User', 'UserCart',
    'UserFavorite', 'UserWallet', 'Zone',
];

/** Model names whose plain strip would collide with an existing model or say nothing. */
const MODEL_OVERRIDES = {
    Item: 'Product',
    Transaction: 'OrderTransaction',
    Settings: 'DispatchSettings',
};

const COLLECTION_OVERRIDES = {
    food_items: 'products',
    food_transactions: 'order_transactions',
    food_settings: 'dispatch_settings',
};

/** Values and keys left alone: the veg mark, and the bare module name. */
const KEEP = /^(food|Food|FOOD|foodType|FoodType|FOOD_TYPES|openfoodfacts|fooduser)$/;

const lcfirst = (s) => s[0].toLowerCase() + s.slice(1);

function renameCamel(token) {
    let result = '';
    let i = 0;
    while (i < token.length) {
        const rest = token.slice(i);
        const prev = i === 0 ? '' : token[i - 1];
        const boundary = i === 0 || prev === '_' || (/[a-z0-9]/.test(prev) && rest[0] === 'F');
        const m = /^(food|Food)(?=[A-Z0-9_]|s(?![a-z])|$)/.exec(rest);
        if (m && boundary && !/^(foodType|FoodType)/.test(rest)) {
            const after = rest.slice(4);
            let model = null;
            for (const suf of MODELS) {
                if (!after.startsWith(suf)) continue;
                const next = after[suf.length];
                if ((next === undefined || /[A-Z0-9_s]/.test(next)) && (!model || suf.length > model.length)) model = suf;
            }
            const lowerStart = m[1] === 'food' && i === 0;
            if (model) {
                const mapped = MODEL_OVERRIDES[model] || model;
                result += lowerStart ? lcfirst(mapped) : mapped;
                i += 4 + model.length;
                continue;
            }
            result += lowerStart || m[1] === 'food' ? 'product' : 'Product';
            i += 4;
            continue;
        }
        result += token[i];
        i++;
    }
    return result;
}

/** For field names and stored identifier values. */
export function foodToProduct(token) {
    if (!/food/i.test(token) || KEEP.test(token)) return token;
    if (token === 'foods') return 'products';
    if (token === 'Foods') return 'Products';
    if (/_/.test(token) && /^[a-z0-9_]+$|^[A-Z0-9_]+$/.test(token)) {
        return token
            .split('_')
            .map((p) => ({ food: 'product', foods: 'products', FOOD: 'PRODUCT', FOODS: 'PRODUCTS' }[p] || p))
            .join('_');
    }
    return renameCamel(token);
}

/** For collection names: every food_ collection loses the prefix. */
export function foodCollectionName(name) {
    if (COLLECTION_OVERRIDES[name]) return COLLECTION_OVERRIDES[name];
    return name.startsWith('food_') ? name.slice(5) : name;
}

const isMain = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`
    || import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
    const apply = process.argv.includes('--apply');
    if (!config.mongodbUri) {
        console.error('MONGO_URI is not set');
        process.exit(1);
    }
    await mongoose.connect(config.mongodbUri);
    console.log(apply ? 'Applying.' : 'Dry run — nothing will be written. Pass --apply to write.');
    const summary = await renameTokensInDb(mongoose.connection.db, foodToProduct, {
        apply,
        renameCollection: foodCollectionName,
    });
    console.log(`${summary.collections.length} collections, ${summary.documents} documents, ${summary.indexes} indexes`);
    await mongoose.disconnect();
}
