# Customer app API

Endpoints for the customer app and website. Read
[FLUTTER_API_SPEC.md](FLUTTER_API_SPEC.md) first: it covers the base URL, the
response envelope, login and token refresh, push, sockets and data
conventions. Every path below is under `/api/v1`.

**Auth** column: `—` is public, `USER` needs a customer token, `any` needs any
logged-in token.

## Login

| Method | Path | Auth | |
|---|---|---|---|
| POST | `/auth/user/request-otp` | — | `{ phone }`; returns `otp` outside production |
| POST | `/auth/user/verify-otp` | — | `{ phone, otp, name?, ref?, fcmToken?, platform? }` → tokens, `user`, `isNewUser` |
| POST | `/auth/refresh-token` | — | `{ refreshToken }` → new `accessToken` |
| POST | `/auth/logout` | any | `{ refreshToken, fcmToken?, platform? }` |
| GET | `/auth/me` | any | The logged-in account |

`isNewUser: true` means the account has no name yet; ask for one and save it
with `PATCH /user/profile`. `ref` is a referral code from a share link.

## Location and zones

The store only serves inside delivery zones, so resolve the location first.

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/content/zones/detect` | — | Which zone a `lat`/`lng` falls in |
| GET | `/content/zones/nearby` | — | Zones near a point |
| GET | `/content/zones/public` | — | All active zones |

Pass the resulting `zoneId` to catalog and order calls. Outside every zone,
show the out-of-zone screen.

## Home and content

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/content/hero-banners/public` | — | Home hero banners |
| GET | `/content/hero-banners/home-promotion/public` | — | Promotion banners |
| GET | `/content/top-banners/public` | — | Top strip banners |
| GET | `/content/explore-icons/public` | — | "Explore" shortcut icons |
| GET | `/content/landing/settings/public` | — | Which home sections are on |
| GET | `/content/pages/:key` | — | CMS page (about, terms, privacy, refund, shipping, cancellation, help) |
| GET | `/content/referral-settings` | — | Referral rewards to show |
| GET | `/settings/business` | — | Company name, logo, support email and phone |
| GET | `/settings/fees` | — | Delivery / platform fee rules (display only; the server prices orders) |
| GET | `/settings/features` | — | Feature flags |
| GET | `/settings/cashback` | — | Cashback rules |

## Catalog

All public and cached; send the token anyway on `/catalog/offers` to get
offers personalised (first-order offers, for example).

| Method | Path | |
|---|---|---|
| GET | `/catalog/categories` | Category tree |
| GET | `/catalog/products` | Product listing |
| GET | `/catalog/stores` | Approved stores |
| GET | `/catalog/stores/:id` | One store |
| GET | `/catalog/stores/:id/products` | A store's products, grouped by category |
| GET | `/catalog/stores/:id/timings` | Opening hours |
| GET | `/catalog/offers` | Coupons the customer can use |
| GET | `/catalog/search/products` | Product search; parameters below |
| GET | `/catalog/search/unified` | Stores matching a query, each with its matching product: `q`, `lat`, `lng`, `radiusKm`, `zoneId`, `strictZone`, `categoryId`, `minRating`, `maxDeliveryTime`, `isVeg`, `page`, `limit`. Results are marked `matchType: 'seller'` or `'product'` |
| GET | `/catalog/search/categories/admin` | Admin-defined search categories (`zoneId`) |
| GET | `/catalog/stores/nearby` | Approved stores nearest first: `lat`, `lng`, `radiusKm` (default 5, max 50), `limit`. Each has `distanceKm` |
| GET | `/catalog/attributes` | Attributes offered as filters (Size, Color…), with their values and colour swatches |
| GET | `/catalog/categories/:id/attributes` | The attributes a category's products vary by, in display order |

**Product search parameters** (`/catalog/search/products`):

| Parameter | |
|---|---|
| `q` | Words to find. Each must appear in the name, brand, tags or category (as a prefix or inside a word). When nothing has every word, word forms are matched instead ("shirts" → "Shirt"); `matchedBy` says which (`'words'` or `'text'`) |
| `zoneId`, `categoryId` | Scope |
| `minPrice`, `maxPrice` | Against an active variant's price, or the product's |
| `brand` | Comma list, any case |
| `attr[Name]` | Comma list of values, e.g. `attr[Size]=M,L&attr[Color]=Red`. All chosen attributes must be on the same variant |
| `isVeg`, `inStockOnly`, `quickOnly` | `true` to filter |
| `sort` | `relevance` (default), `price_asc`, `price_desc`, `rating`, `newest` |
| `facets` | `true` adds `facets: { brands, priceRange, attributes }` with counts, for the filter sheet |
| `page`, `limit` | `limit` up to 50 |

Each product carries `displayPrice` (the cheapest active variant's price, for "from ₹X"), `quickEligible`, `inStock` and its `variants`.

**Products and variants.** A product has `price`, optional `mrp`, `image`/`images`, `isAvailable`, `quickEligible`, `tags`, stock fields and the optional `foodType` mark, and may have `variants`. Each variant has `_id`, `name`, `price`, `mrp`, `attributes: [{ name, value }]`, `images` (empty means use the product's), `isActive` and `inStock`. When a product has variants, the customer must pick one: send its `_id` as the cart line's `variantId`. Grey out variants where `inStock` is false.

## Profile and account

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/user/profile` | USER | |
| PATCH | `/user/profile` | USER | name, email, etc. |
| POST | `/user/profile/profile-image` | USER | multipart `file` |
| DELETE | `/user/profile` | USER | Delete the account |

## Addresses

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/user/addresses` | USER | |
| POST | `/user/addresses` | USER | `{ label, street, additionalDetails?, city, state, zipCode?, phone?, latitude, longitude }` |
| PATCH | `/user/addresses/:addressId` | USER | Any of the same fields |
| PATCH | `/user/addresses/:addressId/default` | USER | Make default |
| DELETE | `/user/addresses/:addressId` | USER | |

`label` is `Home`, `Office` or `Other`. Adding an address with a label the
customer already has **replaces** that address rather than adding a second
one.

## Cart

| Method | Path | Auth | |
|---|---|---|---|
| PUT | `/user/cart` | USER | Save the whole cart: `{ items: [...], pricing? }` → `{ synced, itemCount }` |

The cart lives on the device; this call keeps a server copy in step so it
survives reinstalls and powers abandoned-cart reminders. There is no GET.
Each item carries its `sellerId`. Today one cart holds one seller's items;
the multi-seller cart arrives in Phase 2b.

## Placing an order

1. **Price it.** `POST /orders/calculate`

   ```json
   {
     "sellerId": "…",
     "items": [{ "itemId": "…", "name": "Milk 1L", "variantId": "…", "price": 64, "quantity": 2, "isVeg": true }],
     "deliveryAddressId": "…",
     "zoneId": "…",
     "couponCode": "WELCOME50",
     "deliveryMode": "quick"
   }
   ```

   Returns `{ items, priceChanges, pricing }`. `pricing` holds the subtotal,
   tax, fees, discount and total, plus `quickDeliveryFee` and
   `deliveryPromiseMinutes` to show before the customer commits.
   `priceChanges` lists lines whose price differs from what the app sent.
   **The server always reprices**, so show the returned numbers, not your own.

2. **Place it.** `POST /orders`

   ```json
   {
     "sellerId": "…",
     "items": [ …same as calculate… ],
     "address": { "label": "Home", "street": "…", "city": "…", "state": "…", "latitude": 12.97, "longitude": 77.59 },
     "pricing": { "subtotal": 128, "total": 147, "couponCode": "WELCOME50" },
     "paymentMethod": "razorpay",
     "deliveryMode": "quick",
     "note": "…",
     "deliveryInstructions": "…",
     "scheduledAt": "2026-09-22T10:30:00Z"
   }
   ```

   `paymentMethod` is one of `razorpay`, `razorpay_qr`, `card`, `wallet`,
   `cash`. `cash` and `razorpay_qr` are paid at the door; `cash` returns a
   clear error when COD is switched off.

3. **Pay (online methods).** The response is `{ order, razorpay }`; for an
   online method `razorpay` holds the Razorpay order. Open the
   Razorpay checkout with it, then call `POST /orders/verify-payment` with
   `{ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }`.
   Until then the order is `pending_payment`. If the customer backs out, call
   `DELETE /orders/:orderId/pending-payment` to release the stock.

## Orders

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/orders` | USER | My orders |
| GET | `/orders/:orderId` | USER | One order |
| GET | `/orders/:orderId/route` | USER | Route for the live tracking map |
| GET | `/orders/:orderId/drop-otp` | USER | OTP to give the rider at handover |
| GET | `/orders/:orderId/payments` | USER | Payment attempts for the order |
| PATCH | `/orders/:orderId/cancel` | USER | `{ reason? }` |
| PATCH | `/orders/:orderId/instructions` | USER | `{ instructions }` for the rider |
| PATCH | `/orders/:orderId/ratings` | USER | `{ sellerRating, sellerComment?, deliveryPartnerRating?, deliveryPartnerComment?, itemRatings?: [{ itemId, rating, comment? }] }`, ratings 1–5 |

For live tracking, also join the order's socket room (`join-tracking`) and
listen for `order_status_update`, `location-update` and `delivery_drop_otp`.

## Wallet, refunds and cashback

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/user/wallet` | USER | Balance and history |
| POST | `/user/wallet/topup/order` | USER | `{ amount }` → a Razorpay order |
| POST | `/user/wallet/topup/verify` | USER | The Razorpay handler's response; the wallet is credited with what Razorpay actually captured, once |
| GET | `/payments/wallet/balance` | any | Balance only |
| GET | `/payments/wallet/transactions` | any | Transactions |
| GET | `/user/refunds` | USER | Refunds on my orders |
| GET | `/user/cashback` | USER | Cashback earned |

## Favourites

| Method | Path | Auth |
|---|---|---|
| GET | `/user/favorites` | USER |
| POST / DELETE | `/user/favorites/products/:productId` | USER |
| POST / DELETE | `/user/favorites/sellers/:sellerId` | USER |

## Referrals

| Method | Path | Auth |
|---|---|---|
| GET | `/user/referrals/details` | USER |
| GET | `/user/referrals/stats` | USER |

## Support and safety

| Method | Path | Auth | |
|---|---|---|---|
| POST | `/user/support/ticket` | USER | Raise a ticket |
| GET | `/user/support/my-tickets` | USER | My tickets |
| GET | `/user/safety-emergency-reports` | USER | |
| POST | `/user/safety-emergency-reports` | USER | Report a safety emergency on an order |
| GET | `/chat/conversations` | any | |
| POST | `/chat/conversations` | any | Open a conversation (e.g. with the rider for an order) |
| GET | `/chat/messages` | any | |
| POST | `/chat/messages` | any | |
| PATCH | `/chat/conversations/:conversationId/read` | any | |

## Push and inbox

See [FLUTTER_API_SPEC.md](FLUTTER_API_SPEC.md#push-notifications).
