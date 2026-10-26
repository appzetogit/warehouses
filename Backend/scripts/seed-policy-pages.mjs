/**
 * Fills the storefront's policy pages (Privacy, Terms, Refund & Return,
 * Shipping, Cancellation, About) with The Warehousess's real policies, written
 * from the rules the code enforces. Admins edit them afterwards in
 * Pages & Social Media.
 *
 * Only empty pages are written, so an admin's later edits are never replaced;
 * --force overwrites them. The store's contact email is set too while it is
 * still the placeholder admin@example.com, and the address while it is blank.
 *
 *   node scripts/seed-policy-pages.mjs --dry-run
 *   node scripts/seed-policy-pages.mjs
 *   node scripts/seed-policy-pages.mjs --force
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { PageContent } from '../src/modules/commerce/admin/models/pageContent.model.js';
import { BusinessSettings } from '../src/modules/commerce/admin/models/businessSettings.model.js';
import { upsertAboutPage, upsertLegalPage } from '../src/modules/commerce/admin/services/pageContent.service.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');

const BRAND = 'The Warehousess';
const EMAIL = 'help.thewarehousess@gmail.com';
const ADDRESS = '401, 5th Floor, A Block, Corporate House, RNT Marg, Indore, Madhya Pradesh 452001, India';
const SITE = 'thewarehousess.com';
const UPDATED = '26 October 2026';

const contactBlock = `
<h2>Contact us</h2>
<p>${BRAND}<br>${ADDRESS}<br>Email: <a href="mailto:${EMAIL}">${EMAIL}</a></p>`;

const PAGES = {
    privacy: {
        title: 'Privacy Policy',
        content: `
<p><em>Last updated: ${UPDATED}</em></p>
<p>This Privacy Policy explains how ${BRAND} ("we", "us") collects, uses and protects your information when you use ${SITE} and our mobile apps for customers, sellers and delivery partners (together, the "Platform"). By using the Platform you agree to this policy.</p>

<h2>Information we collect</h2>
<ul>
<li><strong>Account details:</strong> your mobile number (we sign you in with a one-time password sent by SMS), name and email if you add them.</li>
<li><strong>Delivery details:</strong> the addresses you save, including their map location, so orders reach the right place and we can show what is available near you.</li>
<li><strong>Location:</strong> your device location, when you allow it, to find stores and delivery options in your area. Delivery partners share their live location while on a delivery so customers can track the order.</li>
<li><strong>Orders and payments:</strong> what you buy, order history, returns and refunds. Card, UPI and net-banking details are entered on our payment partner's secure page; we do not store your card number or UPI PIN.</li>
<li><strong>Coins, wallet and rewards:</strong> your coin and wallet balance, cashback, referrals and spin-wheel rewards.</li>
<li><strong>Device data:</strong> a push-notification token so we can send order updates, and basic technical data (browser or app version, IP address) to keep the Platform secure.</li>
<li><strong>Support and assistant chats:</strong> messages you send to support or to our shopping assistant.</li>
<li><strong>Sellers and delivery partners:</strong> business, KYC and bank details needed to onboard you and pay you.</li>
</ul>

<h2>How we use it</h2>
<ul>
<li>To create your account, take and deliver orders, process payments, refunds and returns.</li>
<li>To send order updates by SMS and push notification, and, if you agree, offers and reminders (for example, coins about to expire).</li>
<li>To show products, stores and delivery times relevant to your location.</li>
<li>To prevent fraud and misuse (for example, the same payment used to claim a first-order offer twice).</li>
<li>To answer support requests and improve the Platform.</li>
<li>To meet legal, tax and accounting obligations.</li>
</ul>

<h2>Who we share it with</h2>
<p>We do not sell your personal data. We share only what each party needs:</p>
<ul>
<li><strong>Sellers</strong> on the Platform receive your name, phone number and delivery address to fulfil your order.</li>
<li><strong>Delivery partners and courier companies</strong> (through Shiprocket) receive your name, phone number and address to deliver or pick up a parcel.</li>
<li><strong>Service providers</strong> who run parts of the Platform for us: Razorpay (payments and refunds), Google (maps, location search, Firebase push notifications, and Gemini for the shopping assistant and AI product photos), and our SMS provider (sign-in codes and order messages). They may use the data only to provide their service to us.</li>
<li><strong>Authorities</strong>, when the law requires it or to protect the rights and safety of our users.</li>
</ul>

<h2>How long we keep it</h2>
<p>We keep your account data while your account is open. Assistant conversations are kept for a limited period (90 days by default) and then deleted. Order, payment and invoice records are kept as long as tax and consumer laws require, even after an account is deleted.</p>

<h2>Your choices and rights</h2>
<ul>
<li>You can view and edit your profile and saved addresses in the app or website.</li>
<li>You can turn off location access and notifications in your device settings.</li>
<li>You can delete your account from your profile. This removes your account and wallet; past order records are kept for legal reasons.</li>
<li>You can write to us to access, correct or delete your data, or to withdraw consent.</li>
</ul>

<h2>Security</h2>
<p>Data is sent over encrypted connections (HTTPS), access to it is limited to people who need it, and payment details are handled by a PCI-DSS compliant payment partner. No system is completely secure, so please keep your phone and sign-in codes private.</p>

<h2>Children</h2>
<p>The Platform is meant for people aged 18 and over. Minors may use it only with a parent or guardian.</p>

<h2>Changes to this policy</h2>
<p>We may update this policy. The date at the top shows the latest version, and significant changes will be announced on the Platform.</p>

<h2>Grievance Officer</h2>
<p>For any privacy concern or complaint, write to our Grievance Officer at <a href="mailto:${EMAIL}">${EMAIL}</a>. We acknowledge complaints within 48 hours and resolve them within 30 days.</p>
${contactBlock}`,
    },

    terms: {
        title: 'Terms & Conditions',
        content: `
<p><em>Last updated: ${UPDATED}</em></p>
<p>These Terms govern your use of ${SITE} and the ${BRAND} apps (the "Platform"). By creating an account or placing an order you accept them. If you do not agree, please do not use the Platform.</p>

<h2>About the Platform</h2>
<p>${BRAND} is an online marketplace. Products are listed and sold by independent sellers ("stores"); we provide the Platform, payments, delivery coordination and customer support. Each product page shows the store selling it. The Platform has two ways to buy:</p>
<ul>
<li><strong>Quick:</strong> fast delivery by our delivery partners from stores near you, available in the cities and areas we serve.</li>
<li><strong>Shop:</strong> delivery anywhere we can ship in India, through courier partners.</li>
</ul>

<h2>Your account</h2>
<ul>
<li>You sign in with your mobile number and a one-time password. Keep your phone and codes private; you are responsible for activity on your account.</li>
<li>You must be 18 or older, or use the Platform under a parent's or guardian's supervision.</li>
<li>Give accurate details, especially your delivery address and phone number.</li>
<li>We may suspend accounts used for fraud, abuse of offers, or anything unlawful.</li>
</ul>

<h2>Orders, prices and payment</h2>
<ul>
<li>Prices are in Indian Rupees and include GST unless shown otherwise. Your bill at checkout shows the item total, delivery fee, platform fee, taxes and any discounts before you pay.</li>
<li>An order is confirmed once the store accepts it. A store may decline an order (for example, if an item is out of stock), in which case any payment is refunded.</li>
<li>You can pay online (UPI, cards, net banking, wallets through Razorpay), with your ${BRAND} wallet, or cash on delivery where offered. Available methods can change.</li>
<li>An online order that is not paid within 30 minutes is cancelled automatically.</li>
<li>We try to show products, prices and stock accurately. If a clear error is found, we or the store may cancel the order and refund you in full.</li>
</ul>

<h2>Delivery, cancellation, returns and refunds</h2>
<p>These are covered in our <a href="/profile/shipping">Shipping Policy</a>, <a href="/profile/cancellation">Cancellation Policy</a> and <a href="/profile/refund">Refund &amp; Return Policy</a>, which form part of these Terms.</p>

<h2>Coins, wallet and rewards</h2>
<ul>
<li>Coins are reward points (1 coin = ₹1) earned through offers, referrals, the spin wheel or refunds. They are not cash, cannot be transferred and cannot be withdrawn.</li>
<li>80% of the coins in each credit can be spent; coins can pay for at most 50% of an order, and they expire 90 days after they are credited.</li>
<li>Cashback, referral rewards, coupons and the daily spin wheel follow the rules shown with each offer. We may change or end an offer, and may withhold rewards gained through misuse (for example, multiple accounts or repeat first-order claims).</li>
<li>Wallet money can be used to pay for orders on the Platform.</li>
</ul>

<h2>Shopping assistant and AI features</h2>
<p>Our shopping assistant and AI product photos are powered by an AI model and may occasionally be inaccurate. Product details, prices and stock on the product page are what count.</p>

<h2>Acceptable use</h2>
<p>Do not misuse the Platform: no fraudulent orders or payments, fake reviews, attempts to break or overload the Platform, scraping, or harassment of sellers, delivery partners or our team.</p>

<h2>Reviews and content</h2>
<p>Reviews and photos you post must be honest and lawful. You let us show them on the Platform. We may remove content that breaks these Terms.</p>

<h2>Sellers and delivery partners</h2>
<p>Stores and delivery partners also agree to the commercial terms shared with them at onboarding, including commission, fees and payouts. Sellers are responsible for the quality, legality, description and warranty of the products they list.</p>

<h2>Liability</h2>
<p>The Platform is provided "as is". To the extent the law allows, ${BRAND} is not liable for indirect or consequential loss, and our total liability for any order is limited to the amount you paid for it. Nothing in these Terms limits your rights under the Consumer Protection Act, 2019.</p>

<h2>Changes and law</h2>
<p>We may update these Terms; the date above shows the latest version. These Terms are governed by the laws of India, and the courts at Indore, Madhya Pradesh have jurisdiction.</p>

<h2>Grievances</h2>
<p>Write to <a href="mailto:${EMAIL}">${EMAIL}</a>. We acknowledge complaints within 48 hours and resolve them within 30 days.</p>
${contactBlock}`,
    },

    refund: {
        title: 'Refund & Return Policy',
        content: `
<p><em>Last updated: ${UPDATED}</em></p>

<h2>Returns</h2>
<ul>
<li><strong>Shop orders</strong> (delivered by courier) can be returned within <strong>7 days of delivery</strong>.</li>
<li><strong>Quick orders</strong> cannot be returned. If something is missing, damaged or wrong, contact us on the day of delivery and we will sort it out.</li>
<li>Items must be unused, with original tags and packaging.</li>
</ul>

<h2>How to request a return</h2>
<ol>
<li>Open the order in <strong>My Orders</strong> and choose <strong>Return</strong>.</li>
<li>Pick the items and quantity, tell us the reason and add photos (up to 5) if the item is damaged or not as described.</li>
<li>Choose a <strong>refund</strong> or a <strong>replacement</strong> (the same item or another size or colour, if in stock).</li>
<li>Our team reviews the request, usually within 48 hours. Once approved, a courier picks the item up from your address.</li>
</ol>
<p>A return may be declined if the item is used, damaged by the customer, missing tags or parts, or the request is made after the return window. We will tell you why.</p>

<h2>Replacements</h2>
<p>A replacement is sent as a new order at no extra cost once the returned item is picked up. If the replacement cannot be sent (for example, it went out of stock), you get a refund instead.</p>

<h2>Refunds</h2>
<ul>
<li><strong>When:</strong> after the returned item reaches us and passes a quick check; or straight away when an order is cancelled.</li>
<li><strong>Amount:</strong> the price you paid for the returned items, including their share of GST and less their share of any coupon discount. Delivery and platform fees are not refunded on returns.</li>
<li><strong>Paid online (UPI, card, net banking):</strong> refunded to the same payment method. It usually reaches you in <strong>5–7 working days</strong>, depending on your bank.</li>
<li><strong>Paid from the ${BRAND} wallet:</strong> credited back to your wallet immediately.</li>
<li><strong>Coins</strong> used on the order are returned to your coin balance.</li>
<li><strong>Cash on delivery:</strong> nothing is charged for a cancelled COD order. For a returned COD order, write to us and we will arrange the refund.</li>
<li>You may also choose to receive a refund as coins, which can be used on your next order.</li>
</ul>

<h2>Need help?</h2>
<p>If a refund has not reached you within 7 working days, write to us with your order ID.</p>
${contactBlock}`,
    },

    shipping: {
        title: 'Shipping Policy',
        content: `
<p><em>Last updated: ${UPDATED}</em></p>

<h2>Quick delivery</h2>
<ul>
<li>Available in the cities and areas we serve (currently Indore). Enter or allow your location to see if Quick delivers to you.</li>
<li>Orders are packed by a store near you and delivered by our delivery partners, usually the same day and often within the hour. The estimated time is shown before you order and you can track the rider live.</li>
<li>A one-time delivery code may be asked for at the door, to make sure the order reaches you.</li>
</ul>

<h2>Shop delivery (courier)</h2>
<ul>
<li>We ship across India through trusted courier partners (via Shiprocket).</li>
<li>Most orders are delivered within <strong>2–4 business days</strong> after the store ships them. Remote areas can take longer. The expected delivery date is shown at checkout.</li>
<li>You get a tracking link once the order is shipped.</li>
</ul>

<h2>Delivery charges</h2>
<p>Any delivery fee, platform fee and taxes are shown in your bill before you pay. Offers may reduce or waive these.</p>

<h2>Cash on delivery</h2>
<p>Cash on delivery is available on eligible orders where shown at checkout. Please keep the exact amount ready.</p>

<h2>Failed delivery</h2>
<p>If the courier cannot deliver (address not found, phone not reachable, nobody available), we will try to contact you and arrange another attempt. If delivery still fails, the parcel is returned to the store and the order is cancelled; prepaid orders are refunded in full.</p>

<h2>Damaged or missing items</h2>
<p>If a parcel arrives damaged or something is missing, please do not accept a visibly tampered package, and contact us within 48 hours of delivery with photos and your order ID.</p>
${contactBlock}`,
    },

    cancellation: {
        title: 'Cancellation Policy',
        content: `
<p><em>Last updated: ${UPDATED}</em></p>

<h2>Cancelling an order</h2>
<ul>
<li>You can cancel from <strong>My Orders</strong> until the order is picked up by the delivery partner (Quick) or handed to the courier (Shop). Please tell us the reason.</li>
<li>Once a Shop order is with the courier it cannot be cancelled, but you can return it after delivery (see the <a href="/profile/refund">Refund &amp; Return Policy</a>).</li>
<li>Delivered orders cannot be cancelled.</li>
</ul>

<h2>Cancellations by the store or by us</h2>
<ul>
<li>A store may decline an order, for example if an item or size is out of stock or they cannot ship to your address. You will be told the reason.</li>
<li>Quick orders that the store does not accept within a few minutes are cancelled automatically, so you are not left waiting.</li>
<li>Online orders that are not paid within 30 minutes are cancelled automatically.</li>
<li>We may cancel orders that look fraudulent or were placed at a clearly wrong price.</li>
</ul>

<h2>Refunds on cancellation</h2>
<ul>
<li><strong>Paid online:</strong> refunded in full to the original payment method, usually within <strong>5–7 working days</strong>.</li>
<li><strong>Paid from the wallet:</strong> credited back to your wallet immediately.</li>
<li><strong>Coins</strong> used on the order are returned to your balance.</li>
<li><strong>Cash on delivery:</strong> nothing is charged.</li>
</ul>
${contactBlock}`,
    },
};

const ABOUT = {
    appName: BRAND,
    description: `${BRAND} is an Indore-based online marketplace for fashion and everyday essentials. We bring local stores online with two ways to shop: Quick, for fast delivery from stores near you, and Shop, for delivery anywhere in India by courier. Every product is listed by a verified store, every payment is secured by Razorpay, and our support team is here if anything goes wrong. Write to us at ${EMAIL}.`,
    features: [
        { icon: 'Clock', title: 'Quick delivery', description: 'Order from stores near you in Indore and get it delivered the same day, with live tracking.', color: 'text-amber-600', bgColor: 'bg-amber-50' },
        { icon: 'Award', title: 'Shop across India', description: 'Courier delivery anywhere in India, usually in 2–4 business days.', color: 'text-teal-700', bgColor: 'bg-teal-50' },
        { icon: 'Shield', title: 'Safe payments', description: 'UPI, cards, net banking and cash on delivery, with refunds to your original payment method.', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
        { icon: 'Heart', title: 'Easy returns', description: '7-day returns on Shop orders, with a refund or a replacement.', color: 'text-rose-600', bgColor: 'bg-rose-50' },
        { icon: 'Users', title: 'Local stores', description: 'We help Indore businesses sell online and reach customers across the country.', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
        { icon: 'Star', title: 'Rewards', description: 'Earn coins, cashback and daily spin-wheel prizes on your orders.', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
    ],
};

const isEmpty = (doc, key) => {
    if (!doc) return true;
    if (key === 'about') return !String(doc.about?.description || '').trim();
    return !String(doc.legal?.content || '').trim();
};

async function main() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const results = [];

    for (const [key, page] of Object.entries(PAGES)) {
        const existing = await PageContent.findOne({ key, module: 'ALL' }).lean();
        if (!FORCE && !isEmpty(existing, key)) {
            results.push(`${key}: kept (already has content; use --force to replace)`);
            continue;
        }
        if (!DRY_RUN) {
            await upsertLegalPage(key, { title: page.title, content: page.content.trim(), email: EMAIL, mobile: '' }, null, 'ALL');
        }
        results.push(`${key}: ${DRY_RUN ? 'would write' : 'written'} (${page.content.length} chars)`);
    }

    const about = await PageContent.findOne({ key: 'about', module: 'ALL' }).lean();
    if (FORCE || isEmpty(about, 'about')) {
        if (!DRY_RUN) await upsertAboutPage(ABOUT, null, 'ALL');
        results.push(`about: ${DRY_RUN ? 'would write' : 'written'}`);
    } else {
        results.push('about: kept (already has content; use --force to replace)');
    }

    // The store's contact email and address, while they are still placeholders.
    const settings = await BusinessSettings.findOne().select('email address state pincode').lean();
    const set = {};
    if (!settings?.email || /@(example|test|localhost)\b/i.test(settings.email)) set.email = EMAIL;
    if (!String(settings?.address || '').trim()) {
        set.address = '401, 5th Floor, A Block, Corporate House, RNT Marg, Indore';
        set.state = 'Madhya Pradesh';
        set.pincode = '452001';
    }
    if (Object.keys(set).length) {
        if (!DRY_RUN) await BusinessSettings.updateOne({}, { $set: set });
        results.push(`business settings: ${DRY_RUN ? 'would set' : 'set'} ${Object.keys(set).join(', ')}`);
    } else {
        results.push('business settings: contact details already set, left alone');
    }

    console.log(results.join('\n'));
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
