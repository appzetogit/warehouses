# Seller app API

Endpoints for the seller app and the seller web panel (`/seller`). Read
[API_CONVENTIONS.md](API_CONVENTIONS.md) first: it covers the base URL, the
response envelope, login and token refresh, push, sockets and data
conventions. Every path below is under `/api/v1`.

All `/seller/*` endpoints need a `SELLER` token except the four registration
endpoints marked **public**.

## Login and registration

| Method | Path | |
|---|---|---|
| POST | `/auth/seller/request-otp` | `{ phone }` |
| POST | `/auth/seller/verify-otp` | `{ phone, otp, fcmToken?, platform? }` |
| POST | `/seller/register` | **public**. Multipart: store details plus documents, for a phone that came back `needsRegistration: true` |
| POST | `/seller/onboarding-fee/order` | **public**. Razorpay order for the onboarding fee, when the admin charges one |
| POST | `/seller/upload-attachment` | **public**. Single `file` upload used by the registration form |
| POST | `/seller/unregistered` | **public**. "Notify me" lead from a seller who isn't ready to register |

Login outcomes:

- tokens and `user` → signed in
- `needsRegistration: true` → verified phone with no store; go to registration
- 401 *"Your store registration is pending approval."* or *"…has been rejected…"*
  → show the message; the admin approves stores in the admin panel

## Store profile and status

| Method | Path | |
|---|---|---|
| GET | `/seller/current` | The logged-in store |
| PATCH | `/seller/profile` | Store details |
| PATCH | `/seller/availability` | Open / close for orders |
| GET | `/seller/outlet-timings` | Opening hours |
| PUT | `/seller/outlet-timings` | Replace opening hours |
| DELETE | `/seller/current` | Delete the store account |
| POST | `/seller/profile/profile-image` | Multipart `file` |
| POST | `/seller/profile/cover-images` | Multipart |
| POST | `/seller/profile/menu-image`, `/seller/profile/menu-images` | Catalogue photos (multipart) |
| GET | `/seller/media` | Cover image and gallery |
| POST | `/seller/media/cover-image` | Multipart `file` |
| POST | `/seller/media/gallery` | Multipart `files` (up to 10) |
| DELETE | `/seller/media/gallery` | Remove a gallery image |

## Products

| Method | Path | |
|---|---|---|
| GET | `/seller/menu` | All the store's products, grouped by category |
| POST | `/seller/products` | Create; goes to admin approval |
| PATCH | `/seller/products/:id` | Update; a changed product may go back to approval |
| DELETE | `/seller/products/:id` | |
| PATCH | `/seller/products/stock` | Bulk stock update (below) |
| GET | `/seller/products/low-stock` | Products at or under their threshold |
| GET | `/seller/bulk-upload/template` | XLSX template |
| POST | `/seller/bulk-upload` | Multipart `file`: the filled template |

Product fields accepted on create and update:

| Field | |
|---|---|
| `name` | Required on create, up to 200 characters |
| `price`, `otherPrice` | Selling price, optional strike-through price |
| `mrp` | Printed MRP; `price` may not exceed it |
| `variants` | See below |
| `categoryId` or `categoryName` | A category marked as needing FSSAI (groceries, food) refuses the product unless the store's FSSAI number is on file and not expired |
| `tags` | Search keywords, list or comma string, up to 20 |
| `quickEligible` | `false` for items that can't go by quick delivery (bulky, made to order). Default `true` |
| `description`, `brand`, `packSize`, `sku`, `barcode`, `expiryDate` | |
| `gstRate` | 0–100, or `null` to use the default |
| `image`, `images` | URLs from an upload |
| `foodType` | `'Veg'`, `'Non-Veg'` or `null` (not applicable) |
| `isAvailable`, `isRecommended`, `preparationTime` | |
| `stockQty`, `lowStockThreshold`, `maxQtyPerOrder` | Leave `stockQty` unset for "not tracked" |

The create and update responses return the product under `data.product`.

**Variants.** Each entry of `variants`:

```json
{
  "attributes": [{ "name": "Size", "value": "M" }, { "name": "Color", "value": "Red" }],
  "price": 399, "mrp": 499, "sku": "TEE-M-RED", "stockQty": 12, "lowStockThreshold": 3,
  "images": ["https://…/red.jpg"], "isActive": true
}
```

- `attributes` can also be an object: `{ "Size": "M", "Color": "Red" }`. `name`
  defaults to the values joined ("M / Red").
- If the category has attributes (`GET /catalog/categories/:id/attributes`),
  only those attributes and their listed values are accepted, respelled as the
  admin wrote them.
- Two variants with the same options are refused. A variant's `price` may not
  exceed its own `mrp`, or the product's when it has none.
- `stockQty: null` (or leaving it out) means the variant shares the product's
  `stockQty`, as pack sizes of one item do. A number counts it separately.
- Send the variant's `_id` back when editing, or it is treated as a new
  variant (and orders that point at the old id can no longer find it).

**Bulk stock:** `PATCH /seller/products/stock` takes an array (or
`{ items: [...] }`) of up to 500 entries:

```json
[{ "itemId": "…", "stockQty": 40, "lowStockThreshold": 5, "maxQtyPerOrder": 6, "isAvailable": true }]
```

Add `variantId` to an entry to set that variant instead: its `stockQty`
(`null` hands it back to the shared count), `lowStockThreshold` or `isActive`.

It returns per-item `updated` and `failed` lists, so one bad id doesn't reject
the rest. A product is hidden from customers automatically once nothing on it
can be sold, and comes back on restock unless you switched it off by hand. The
low-stock list includes variants counted on their own (with `variantId`).

## Categories

| Method | Path | |
|---|---|---|
| GET | `/seller/categories` | Global categories plus the store's own |
| POST | `/seller/categories` | Create a store category |
| PATCH | `/seller/categories/:id` | |
| DELETE | `/seller/categories/:id` | |

## Orders

| Method | Path | |
|---|---|---|
| GET | `/seller/orders` | The store's orders (paginated) |
| GET | `/seller/orders/:orderId` | One order |
| PATCH | `/seller/orders/:orderId/status` | `{ orderStatus, note? }` |
| POST | `/seller/orders/:orderId/resend-notification` | Re-alert riders for an order nobody has accepted |

`orderStatus` a seller can set: `confirmed` (accept), `preparing`,
`ready_for_pickup`, or `cancelled_by_seller` (reject). The rider moves the
order on from pickup.

New orders arrive as a push notification and as the `new_order` socket event
in the store's room. Status changes arrive as `order_status_update`.

## Offers and banners

| Method | Path | |
|---|---|---|
| GET | `/seller/my-offers` | The store's coupons |
| POST | `/seller/my-offers` | Create a coupon for this store |
| PATCH | `/seller/my-offers/:id/status` | Enable / disable |
| DELETE | `/seller/my-offers/:id` | |
| GET | `/seller/banners` | Store page banners |
| POST | `/seller/banners` | Multipart |
| PATCH | `/seller/banners/order` | Reorder |
| DELETE | `/seller/banners` | |
| GET | `/seller/app-banners` | Announcements from the admin for the seller app |

## Money

| Method | Path | |
|---|---|---|
| GET | `/seller/finance` | Earnings, commission, settlements |
| GET | `/seller/analytics` | Sales dashboard |
| POST | `/seller/withdraw` | Request a payout |
| GET | `/seller/withdrawals` | Payout history |
| GET | `/payments/seller/:sellerId/wallet` | Wallet (own `sellerId` only) |
| GET | `/seller/subscription/overview` | Subscription plan and status |
| GET | `/seller/subscription/invoices` | |
| GET | `/seller/subscription/invoices/:invoiceId` | |
| GET | `/seller/subscription/transactions` | |
| GET | `/seller/subscription-history` | |
| GET | `/settings/seller-subscription` | Plans on offer (public) |

## Support

| Method | Path | |
|---|---|---|
| GET | `/seller/complaints` | Customer complaints about the store |
| POST | `/seller/support/tickets` | Raise a ticket |
| GET | `/seller/support/tickets` | My tickets |
| POST | `/seller/feedback-experience` | App feedback |

## Push, inbox and chat

See [API_CONVENTIONS.md](API_CONVENTIONS.md#push-notifications). The seller
uses the same `/notifications/*`, `/chat/*` and `/fcm-tokens/*` endpoints as
the other apps.
