# Implementation Plan — Multi-Vendor E-Commerce + Quick Commerce

Source: *Scope of Work — E-Commerce + Quick Delivery Platform* (60-day build, 1-year maintenance).
Baseline: this repo (`Backend/` Node/Express/Mongo, `Frontend/` React/Vite admin + seller + customer web + rider web).

> **Scope change (2026-09-22):** the native Flutter apps (customer, seller, delivery) are **out of scope** for this project. The deliverable is the backend, the admin and seller panels, and the customer website (desktop and mobile web). The API docs stay client-neutral so any future app can use them.

The code today does quick commerce from one seller per order. It started as a food-delivery product and still reads like one. The SOW asks for three things on top of that:

1. **A real multi-vendor marketplace.** One cart can hold items from several sellers, products get true variants, and orders that aren't quick go through a courier.
2. **New engagement features.** Refund coins (usable up to 80%), a spin wheel, and a Gemini assistant.
3. **No food leftovers.** The naming, API paths, collections and food-only features all go.

Most of the rest already exists and needs extending, not rebuilding (see §1).

---

## 1. Where we start from (gap analysis)

| SOW area | Status today | Work needed |
|---|---|---|
| Customer auth, profile, multi-address with coordinates | **Exists.** Phone OTP, GeoJSON addresses | Rename only. Optional email/Google login |
| Categories / sub-categories | **Exists.** 2 levels, global or per-seller | Rename. Attach attribute sets to categories |
| Products | **Exists.** brand, packSize, MRP, GST, SKU, barcode, stock | Rename `FoodItem` → `Product`. Drop veg/addon fields |
| Attributes & variants (Size × Color × Price) | **Partial.** Variants are only `{name, price}`, stock is per product | **New:** attribute model, variant matrix, per-variant SKU, price, MRP, stock and images |
| Search & filter | **Partial.** Regex on name and brand, category/zone/stock filters | Add filters for price, brand and attributes, facets, sort, and a text index |
| Cart & checkout | **Partial.** Single-seller cart, both server-side and client-side | **New:** multi-seller cart and a split checkout |
| Vendor/store selection, location-based discovery | **Exists.** Zones plus a polygon check at order time | Add a "nearby stores" list and a store page |
| Quick delivery (~30 min) | **Exists.** `deliveryMode: quick`, promise minutes, dispatch at 3/5/8/12 km | Add per-product/per-store eligibility and show the promise across the UI |
| Standard (non-quick) e-commerce delivery | **Missing.** Every order uses in-house riders | **New:** fulfilment mode, courier integration (e.g. Shiprocket), shipment tracking |
| Payments: UPI, card, gateway, COD | **Exists.** Razorpay, Razorpay QR, cash, wallet | Put the gateway behind an interface (client picks it). Add UPI intent on the apps |
| Refunds | **Exists.** Refund model, refunds to wallet by default | Send eligible refunds to **coins** instead (§3.5) |
| Platform coins, 80% usage rule | **Missing.** An admin page stub exists, no backend | **New:** coin ledger, redemption cap, expiry |
| Coupons, first-order offer, referral | **Exists.** `offer.model` (`isFirstOrderOnly`), referral settings and logs | Surface them in the apps. Add auto-applied first-order offer |
| Spin wheel | **Missing** | **New** |
| Push notifications, campaigns | **Exists.** FCM, BullMQ queue, broadcast model | Complete the event matrix (§3.9). Add coin and refund events |
| Customer support chat | **Exists.** Chat over sockets, support tickets | Hand off from the AI bot to a human |
| AI / Gemini | **Missing** | **New** (§3.8) |
| Seller: hours, offers, reports, commission, payouts | **Exists** | Rename. Add variant, stock and shipment screens |
| Delivery partner: availability, assignment, GPS, earnings, incentives, COD cash | **Exists** | Rename. Add a courier-order view for admin |
| Admin panel | **Exists.** About 140 pages | Rename and prune. Add coins, spin, AI, attributes and shipments pages. Extend reports |
| Customer website | **Exists** at `/food/user/*` | Move to the site root, make it responsive, add SEO basics |
| iOS builds | Not done. APNs headers are already set in FCM | Build and sign all three apps for iOS (§3.11) |

**Food leftovers to remove.** They are spread across the codebase: "food" appears about 2.6k times in the backend and 4k in the frontend, and "seller" about 4.7k and 10.5k times. The leftovers are:

- Dining/table booking (`modules/food/dining`, Dining pages)
- Veg/non-veg (`foodType`, `isVeg`, `pureVegSeller`)
- Addons
- Cutlery
- FSSAI as a mandatory field
- Cuisines
- Gourmet and Under-250 banners
- Hyperpure page
- `sellerMenu`
- `/api/v1/food/*` paths
- About 65 `food_*` collections
- `Food*` model names and the `FOD-` order prefix

**Security items from `REMEDIATION_PLAN.txt`, closed in Phase 0:**

- **H1:** wallet balance changes are single conditional updates, so concurrent orders cannot overdraw a wallet and concurrent credits cannot overwrite each other.
- **Wallet top-ups (found in Phase 0):** credited the amount the client claimed, and accepted any paid Razorpay order, including a food order's payment. Top-ups now credit what Razorpay captured, only for a top-up order created for that user, once.
- **C3 (wider than listed):** any logged-in user could run settlements, and read any seller's or rider's wallet or any order's payment trail by id. Admin routes are admin-only; wallets and order trails are limited to their owners.
- **C4:** the public FCM test routes are removed.
- **C5:** the deploy webhook takes `DEPLOY_WEBHOOK_SECRET` and is off without it. The old secret is in git history and must be rotated wherever it was configured.
- C1 (server-side pricing) and C2 (banner writes) were already fixed.

---

## 2. Target architecture — key design decisions

### 2.1 Rename strategy (food → commerce)
We rename the whole thing in one clean break. Nothing is live, so no old paths or names are kept for compatibility. *(Done in Phase 1.)*

| Layer | From | To |
|---|---|---|
| Backend module folder | `src/modules/food/*` | `src/modules/commerce/*` (`restaurant/` → `seller/`) |
| API prefix | `/api/v1/food/...` | `/api/v1/{auth,catalog,content,settings,user,orders,payments,seller,delivery,admin,chat,notifications}`, grouped by caller |
| Model names | `FoodItem`, `FoodRestaurant`, `FoodOrder`, `FoodUser` | `Product`, `Seller`, `Order`, `User` |
| Collections | `food_*` | Unprefixed (`food_items` → `products`). Renamed by the 2026-09 migrations; undo by restoring the `mongodump` taken first |
| Order ids | `FOD-…` | `ORD-…` for new orders. Existing ids unchanged |
| Frontend | `modules/Food`, `@food`, `/food/user/*` | `modules/Store`, `@store`; customer site at `/` |
| Roles / JWT | `RESTAURANT` | `SELLER`. No alias |

**Compatibility:** none needed. The migrations still run first on a restored copy of production (§3.12).

### 2.2 Fulfilment modes (the core of "e-commerce + quick commerce")
- Each **seller** has a `fulfilmentModes` setting: `quick` for a dark store or nearby shop using in-house riders, `standard` for courier shipping, or both.
- Each **product/variant** has `quickEligible` (default true for sellers with quick enabled).
- At checkout, each seller's portion of the cart is sent one way:
  - **Quick:** when the seller is quick-enabled, the address is inside the seller's zone, every line is quick-eligible and in stock, and a rider is available. Uses the existing dispatch, rider app and 30-minute promise.
  - **Standard:** otherwise. The seller packs, a courier is booked through a `ShippingProvider` interface, and the customer tracks via the AWB. Standard delivery can go to any serviceable pincode, not only inside zones.
- The existing order states stay. Standard orders add a `shipment` subdocument with courier, AWB, label, tracking events and ETA date, and they move through `packed → shipped → out_for_delivery → delivered` (plus RTO).

### 2.3 Multi-seller cart and split orders
- The cart holds lines from any number of sellers, grouped by seller in the UI.
- Checkout creates **one `Checkout` (order group)**: one payment, one coupon/coin application, one customer-facing reference. It also creates **one child `Order` per seller** so each seller only sees their own order.
- **Discount allocation:**
  - Platform coupons and coins are spread across child orders in proportion to each child's subtotal, reusing the proportional logic already in `pricing` for GST.
  - Seller coupons apply only to that seller's child order.
- **Refunds and cancellations are per child order.** The group's payment is refunded partially through the gateway, or partially in coins.
- Delivery fee is charged per child order. Admin can set a "free above X" per mode.

### 2.4 Variants
- New `Attribute` model (e.g. Size: S/M/L; Color: Red/Blue, with a hex value) managed by admin. An `attributeSet` is linked to a category.
- `Product.variants[]` = `{ _id, sku, attributes: {size:'M', color:'Red'}, price, mrp, stockQty, lowStockThreshold, images[], isActive }`.
- A product with no variants keeps its product-level price and stock (every current grocery product).
- **Stock:** every place that reserves or releases stock moves to `(productId, variantId?)`. That covers the atomic reserve, restock on cancel, low-stock checks and the auto-hide at zero.
- Cart and order lines store `variantId` plus a snapshot of the attributes.

### 2.5 Coins (separate from wallet)
The wallet is real money: top-ups and cashback. Coins are a promotional liability with different rules, so they get their own ledger and are never mixed into the wallet balance.
- `CoinAccount { userId, balance }` + `CoinLedger { userId, type: credit|debit|expire|reverse, amount, source: refund|spin|referral|admin|campaign, refId, expiresAt, remaining }`.
- Every change to the balance is atomic: `findOneAndUpdate` with `balance >= amount`, inside a Mongo transaction when paired with an order write.
- Rules live in admin settings:
  - **Redemption cap** (80%). As written in the SOW, 1,000 coins credited can be used for at most ₹800. How it applies per order is decision **B2**.
  - Coin-to-₹ rate (1:1)
  - Expiry in days
  - Maximum coins per order (as a % of order value)
  - Minimum order value
  - Which refund reasons pay out in coins and which go back to the original payment method
- Expiry is first in, first out by lot (`remaining` on each credit), run by a daily job on the existing maintenance worker.

### 2.6 Payment gateway abstraction
- A `PaymentGateway` interface with `createOrder`, `verify`, `refund`, `webhook`, and Razorpay as the first implementation.
- The SOW says the client supplies the gateway, so swapping means adding one adapter instead of editing the order service.
- UPI goes through the gateway checkout on the web. COD keeps the current cash-limit and deposit flow for riders. Standard COD orders are reconciled against the courier's COD remittance.

### 2.7 AI (Gemini)
- A backend-only `ai` module. The API key stays on the server and is set in admin (the same pattern as the Maps and Firebase keys).
- The model gets read-only tools, called through Gemini function calling:
  - `searchProducts`
  - `getProductDetails`
  - `getMyOrders` / `getOrderStatus` (limited to the logged-in user)
  - `getCoinBalance`
  - `getOffers`
  - `createSupportTicket` (hand-off to a human)
- Guardrails:
  - Rate limit per user
  - Token and cost cap per day
  - An admin toggle for each use case
  - Transcripts stored for 30 days for review
  - The bot never performs cancel, refund or payment itself
- Recommendations: "frequently bought together" and "customers also viewed" come from order co-occurrence (a nightly Mongo aggregation), not the LLM. The LLM only rewrites natural-language queries into search filters.

---

## 3. Workstreams and tasks

Tags: **[BE]** backend · **[AD]** admin web · **[SW]** seller web · **[CW]** customer website · **[CA]** customer app · **[SA]** seller app · **[DA]** delivery app

### 3.1 Phase 0 — Foundations (week 1)
- [ ] Get sign-off on the business decisions in §5. Coins, courier and gateway choices block Phase 2.
- [x] Close remediation items H1, C4 and C5. Re-verify C2, C3 and C7. (C3 was still open and is now fixed; C7: no `.env` files are tracked.)
- [ ] Set up a staging environment: a copy of production Mongo, Redis and BullMQ on, and separate Firebase and gateway test keys.
- [x] Run the four `*.selfcheck.mjs` files, and exercise the atomic stock decrement and restock against a real Mongo (still marked untested in `QUICK_COMMERCE_CHANGES.md`).
- [x] Add a minimal test harness (`node --test` + in-memory Mongo replica set, `npm test` in `Backend/`).
- [ ] Extend it into an API smoke suite covering checkout, cancel, refund and dispatch. All the refactors below depend on it.
- [x] Agree on the brand name (decided: "The Warehouses", from config).

### 3.2 Phase 1 — De-food and rename (weeks 1–2)

Nothing is live, so the rename is a clean break: there is no `/api/v1/food` alias and no old-role alias, and a migration's undo is restoring the `mongodump` taken before it.

- [x] **[BE]** Move `modules/food` → `modules/commerce` and `restaurant` → `seller`. Rename models and refs (`FoodItem` → `Product`, `FoodRestaurant` → `Seller`, and so on).
- [x] **[BE]** Collection-rename migrations in `Backend/scripts/migrations/` (2026-09-*, run in date order). Each is a dry run unless given `--apply`. Undo is the `mongodump` taken first, not a reverse mode. Covered by tests on an in-memory replica set.
- [x] **[BE]** Route tree at `/api/v1/{auth,catalog,content,settings,user,orders,payments,seller,delivery,admin,chat,notifications}`, grouped by caller. Quick vs standard is a `deliveryMode` field, not a path tree. `FLUTTER_API_SPEC.md` (shared conventions), `USER_APP_API.md`, `SELLER_API_SPEC.md` and `DELIVERY_API_SPEC.md` are rewritten against `test/fixtures/routes.txt`.
- [x] **[BE]** Remove dining, table booking, add-ons, cutlery, cuisines, pure-veg stores, veg-scoped categories, gourmet/under-250/coffee/hyperpure and the saved menu layout. Veg/non-veg stays as an optional mark (`foodType`: `'Veg' | 'Non-Veg' | null`). FSSAI is optional everywhere; making it required per category moves to Phase 2a.
- [x] **[BE]** Role `RESTAURANT` → `SELLER`, socket rooms `seller:<id>`, notification sources and stored values renamed. The last bare "food" values (`module`, favourites, approvals, upload folders) are migrated by `2026-09-rename-food-values.mjs`. New orders are numbered `ORD-…`.
- [x] **[AD][SW][CW]** `modules/Food` → `modules/Store` (`@store`). Dining, gourmet, Under250, Coffee and Hyperpure pages deleted. On-screen copy says product/order, the brand name comes from business settings (`VITE_BRAND_NAME` until they load), and `/` opens the store. **Moving the customer site to `/` and the rider app off `/food/delivery` happens with the Phase 2 storefront**, as decided.
- **Done when:** a `grep -ri "food\|restaurant\|dining\|veg"` over `src/` returns only the optional veg mark, the `/food/*` web URLs that move in Phase 2, comments, and internal identifiers users never see (the `food` Redux slice, local variables). *Status: met.* The smoke suite (§3.1) still has to be written.

### 3.3 Phase 2a — Catalogue: attributes and variants (weeks 2–3)
- [ ] **[BE]** `Attribute` / `AttributeSet` models and admin CRUD. Link attribute sets to categories.
- [ ] **[BE]** Product variant schema (§2.4). Migrate the existing `{name, price}` variants to single-attribute variants.
- [ ] **[BE]** Move stock reserve and release, low-stock checks and auto-hide to the variant level. Extend `PATCH /products/stock` to take `variantId`.
- [ ] **[BE]** Search: a text index (name, brand, tags) plus the existing prefix regex fallback. Add filters for price range, brand and attributes, facet counts, sorting (relevance, price, rating, newest), and a nearby-stores endpoint.
- [ ] **[BE]** Add `quickEligible` to products and variants.
- [ ] **[AD][SW][SA]** Variant-matrix editor: pick attributes, generate combinations, then edit price, MRP, stock, SKU and image for each. Bulk stock import by CSV/XLSX (`exceljs` is already installed).
- [ ] **[CW][CA]** Variant picker on the product page (swatches and sizes, with out-of-stock combinations greyed out), a filter sheet, and store listing and store pages.
- [ ] **[BE][AD][SW]** `requiresFssai` on categories: a seller selling in a flagged (grocery/food) category must give an FSSAI licence.
- [ ] **[CW]** Replace the customer product page (`pages/user/ProductDetail.jsx`): it is a static mock with a hardcoded catalogue and generated sample reviews, and nothing links to it. The real page carries the variant picker.

### 3.4 Phase 2b — Multi-seller cart, split checkout, standard delivery (weeks 3–5)
- [ ] **[BE]** Cart model v2: lines keyed by `(sellerId, productId, variantId)`, no single-seller restriction, and server-side revalidation of price and stock on read.
- [ ] **[BE]** `Checkout` (order group) model. `createCheckout` prices each seller's portion with the existing `calculateOrderPricing`, splits discounts and coins, reserves stock for all lines atomically (releasing everything if any line fails), then creates the child orders. One gateway order per checkout.
- [ ] **[BE]** Route each portion to quick or standard (§2.2), with the delivery promise returned per portion.
- [ ] **[BE]** A `ShippingProvider` interface with a Shiprocket adapter (or the client's courier): serviceability by pincode, rate, create shipment, label, pickup request, tracking webhook, cancel, and RTO. Add a `shipment` subdocument and the standard status flow.
- [ ] **[BE]** Per-child cancel and refund with a partial gateway refund, and refund-to-coins as policy dictates.
- [ ] **[BE]** Commission and settlement per child order (the existing `sellerCommission` becomes `sellerCommission`). Add a commission rule per category or per seller, and courier cost in the settlement.
- [ ] **[SW][SA]** Standard-order flow: accept, pack, "ready to ship" (books the courier and prints the label), then the tracking timeline.
- [ ] **[AD]** Order-group view with its child orders. A shipments page: NDR (failed delivery attempts) and RTO queue, COD remittance reconciliation.
- [ ] **[CW][CA]** Cart grouped by seller with a promise and fee for each group, checkout summary, order detail showing child orders and their tracking (live map for quick, courier timeline for standard).

### 3.5 Phase 3a — Refunds and coins (week 5)
- [ ] **[BE]** Coin models, service and admin settings (§2.5). Atomic credit and debit. Daily expiry job.
- [ ] **[BE]** Hook refunds in: eligible refunds credit coins (100% credited, redemption capped per rule B2). Other refunds go back to the original payment method as today.
- [ ] **[BE]** Checkout: `coinsToApply` validated against the cap, the per-order limit and expiry, then spread across child orders (§2.3). Reversal when an order is cancelled.
- [ ] **[AD]** Coin settings, a manual credit/debit with a required reason (audit-logged), a user coin ledger, and a coin liability report (issued, redeemed, expired, outstanding). This replaces the `loyalty-point` stub.
- [ ] **[CW][CA]** Coin balance, ledger and expiry notices. A "use coins" toggle at checkout showing the maximum usable.

### 3.6 Phase 3b — Promotions and engagement (weeks 5–6)
- [ ] **[BE]** First-order offer: the auto-applied, best-eligible first-order coupon (the `isFirstOrderOnly` flag already exists). Block abuse by one phone per device and by address.
- [ ] **[BE]** Spin wheel:
  - `SpinCampaign` with segments: label, reward (coupon, coins, free delivery, or nothing), weight, stock/budget.
  - Eligibility rules: per day, after an order, first N users.
  - `SpinResult`
  - The outcome is chosen **on the server** with a crypto RNG. The client only animates to the returned segment.
  - Budget caps stop a segment from paying out once it runs out.
- [ ] **[BE]** Referral: confirm the existing referral flow and allow coins as a reward type.
- [ ] **[AD]** Spin campaign builder showing the probability of each segment, a spin report, and a campaign scheduler for pushes by segment (all users, zone, inactive for N days, cart abandoners).
- [ ] **[CW][CA]** Spin screen, offers page, and coupon picker at checkout.

### 3.7 Phase 3c — Payments (runs in parallel, weeks 4–6)
- [ ] **[BE]** Refactor to the `PaymentGateway` interface. Checkout-level payment, with idempotent webhooks keyed on the gateway payment id.
- [ ] **[BE]** Reconciliation report: gateway settlements vs checkouts vs refunds. COD ledger split by rider (quick) and courier (standard).

### 3.8 Phase 4a — AI assistant (week 6)
- [ ] **[BE]** `ai` module: a Gemini client, the tool definitions (§2.7), conversation storage, rate limits and cost caps. An admin setting for the key, model, system prompt and each use case.
- [ ] **[BE]** Query rewriting for search ("red tshirt under 500 size M" → filters), plus co-purchase recommendations built by a nightly job.
- [ ] **[CW][CA]** Chat widget, with a "talk to support" hand-off into the existing chat or ticket flow. "You may also like" and "frequently bought together" rails.
- [ ] **[AD]** AI settings, a conversation log viewer, and a usage and cost panel.

### 3.9 Phase 4b — Notifications matrix (week 6)
Wire and test every event through the existing BullMQ notification queue:

| Event | Customer | Seller | Rider | Admin |
|---|---|---|---|---|
| Order placed / confirmed | ✓ | ✓ new order | | ✓ (large or flagged orders) |
| Status change (packed, shipped, out for delivery, delivered) | ✓ | | | |
| Rider assigned / offer | ✓ | ✓ | ✓ offer | |
| Pickup / delivery updates | ✓ | ✓ | ✓ | |
| Cancellation / refund / coins credited / coins expiring | ✓ | ✓ | | |
| Low stock, courier NDR/RTO | | ✓ | | ✓ |
| Promotions / campaigns | ✓ | | | |
| System alerts (no rider found, payment mismatch) | | | | ✓ |

On iOS, push delivery needs the APNs auth key uploaded to Firebase (§3.11).

### 3.10 Phase 4c — Reports and analytics (weeks 6–7)
Extend the existing report pages and add these:
- Orders and sales by day, mode (quick or standard), zone, category and seller
- Seller performance: acceptance rate, prep time, cancellations, ratings
- Customer activity: new vs repeat, cohorts, abandoned carts
- Delivery performance:
  - % of quick orders delivered within their promise
  - Average assignment time
  - Rider utilisation
  - Courier SLA and RTO %
- Commission earned
- Payments and COD
- Refunds
- Coins issued, redeemed, expired and outstanding
- Spin payouts
- Rider incentives

All reports export to XLSX. Heavy aggregations are pre-computed nightly into a `daily_metrics` collection so the dashboard stays fast.

### 3.11 Phase 5 — Customer website (weeks 2–8, alongside the backend)
- **Customer website:**
  - Responsive pass at phone, tablet and desktop widths
  - Per-route meta tags, `sitemap.xml` and `robots.txt`
  - Product and store pages reachable by URL
  - Optional pre-rendering of category and product pages if SEO matters to the client


### 3.12 Phase 6 — QA, UAT, launch (weeks 8–9)
- [ ] End-to-end scripts for:
  - Quick order, for each payment method
  - Standard order through courier sandbox to delivery
  - A mixed cart (one quick seller + one standard seller)
  - Partial cancel → coin refund → redemption at the 80% cap
  - Spin → coupon → order
  - AI order-status lookup
- [ ] Load test checkout and dispatch (the `REMEDIATION_PLAN` targets 10k orders/day).
- [ ] Production migration rehearsal on a restored backup, then the live migration in a maintenance window.
- [ ] Handover: updated API specs, an admin user guide, a runbook, and the start of the 1-year maintenance period.

---

## 4. Timeline (60 days)

| Week | Backend | Web (admin / seller / customer) |
|---|---|---|
| 1 | Phase 0 + start rename | Rename `modules/Food`, remove food pages |
| 2 | Rename + migration done; attributes/variants | Variant editor |
| 3 | Variant stock, search facets; cart v2 | Filters, store pages |
| 4 | Split checkout, gateway interface | Grouped cart and checkout |
| 5 | Courier integration, coins | Shipments admin, coin settings |
| 6 | Spin, first-order, AI, notifications | Spin builder, AI settings |
| 7 | Reports, hardening | Reports |
| 8 | Load test, migration rehearsal | UAT fixes |
| 9 (days 57–60) | Production migration + launch | Launch |

The critical path is Phase 0 decisions → multi-seller checkout → coins and courier. The dependencies below come from SOW §16:

| Needed from the client | By |
|---|---|
| Courier account | End of week 2 |
| Gateway credentials | End of week 3 |
| Apple Developer account | Week 1 |
| Gemini API key | Week 5 |
| Brand assets | Week 1 |

Each week one of these slips moves launch by about a week.

---

## 5. Decisions (all settled; the client can override any by config or admin settings)

| # | Decision | Why it blocks | Suggested default |
|---|---|---|
| B1 | Which refund reasons pay out in coins and which go back to the original payment | Refund logic | **Decided (2026-09-21):** refunds go back to the original payment method by default; at cancellation the customer may choose coins instead, credited in full with the 80% rule applied. Coins spent on the order always come back as coins. Cash orders have nothing to refund |
| B2 | ~~How the 80% rule applies~~ | — | **Decided (2026-09-21):** 1,000 coins credited, at most 800 ever spendable; the other 20% is never redeemable |
| B3 | ~~Coin expiry and per-order limit~~ | — | **Decided:** 90 days, oldest coins used first; coins pay at most 50% of an order. Both editable in admin |
| B4 | Courier/shipping provider (Shiprocket, Delhivery, …) | Real shipping only | **Decided (2026-09-21):** Shiprocket, an aggregator in front of Delhivery, Blue Dart, Xpressbees, Ekart and others, so coverage is not tied to one network. `ShiprocketProvider` is used when `SHIPROCKET_*` is set; the mock otherwise |
| B5 | Payment gateway | Gateway adapter | **Decided:** Razorpay, behind a `PaymentGateway` interface (`core/payments/gateway`) with a reconciliation report |
| B6 | ~~Mix quick and standard in one checkout?~~ | — | **Decided:** no. Separate storefronts and carts; a checkout is all quick or all standard |
| B7 | Commission basis (per seller, per category, flat + %) | Settlement | **Decided (2026-09-21):** a seller-specific rule (percentage or flat) wins; otherwise each line pays its category's `commissionPercent` (inherited from the parent) on its share of the subtotal after discounts. Tax, delivery and packaging are never commissioned. The platform bears coins and platform coupons; sellers bear their own coupons |
| B8 | Spin eligibility and budget (daily / after order) | Spin rules | **Decided (2026-09-21):** one spin per customer per day (store timezone), weighted rewards, a monthly coin budget per wheel, campaigns scheduled from admin. Daily rather than per order, so it brings customers back without rewarding order-splitting |
| B9 | AI use cases in scope (SOW §11 lists 5 as "potential") | AI effort | **Decided (2026-09-21):** shopping assistant (product search and help) and order-status answers on Gemini 2.5 Flash, key in `GEMINI_API_KEY`, 20 messages a minute per customer. Recommendations stay rule-based (no LLM cost per page view) |
| B10 | Brand name, domain, app ids | Rename, store listings | **Decided (2026-09-21):** brand from `BRAND_NAME` (default "Warehouses"); domain is `FRONTEND_URL`; Both can be swapped by config |
| B11 | ~~Keep the old `/api/v1/food` alias until when?~~ | — | Settled: no alias, since nothing is live |

---

## 6. Risks

- **60 days is tight** for a multi-seller checkout, courier integration, coins, spin, AI, 3 apps × 2 platforms and a full rename. To protect the date, we ship the rename and multi-vendor core first and treat AI recommendations and advanced reports as the first items to slip to maintenance.
- **Rename migration on live data:** it touches every collection and the apps in the field. We mitigate with dry-run migrations covered by tests, a `mongodump` before each run and a rehearsal on a backup.
- **Money correctness:** partial refunds across split orders, and coin and wallet races. We mitigate with Mongo transactions, idempotency keys and the test harness from Phase 0.
- **App Store review:** background location for riders, and payments in the customer app (physical goods, so the gateway is allowed, not Apple in-app purchase).
- **30-minute promise:** only as good as rider supply and seller packing time. The promise is shown per order, never as a guaranteed SLA (SOW §5 already says this).

---

## 7. Definition of done (per SOW deliverable)
- Customer app (Android + iOS), seller app (Android + iOS), delivery app (Android + iOS) published.
- Customer website on the root domain, responsive.
- Admin panel covering every §7 SOW item, including coins, spin, AI settings and the new reports.
- One backend with API specs updated and no `food`/`restaurant` naming left in code or data (the optional veg mark aside).
- E2E scripts from §3.12 pass on staging; migration rehearsed; runbook handed over.
