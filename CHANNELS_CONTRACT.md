# Channels contract: Quick and Shop

Decided 2026-09-22. A seller can sell in Quick (rider, minutes), Shop (courier), or both.
A product can be listed in Quick only, Shop only, or both, and each channel has its own stock.
Nothing is live, so old fields are replaced outright (a migration converts dev data).

`channel` is always `'quick'` or `'shop'`. An order's `fulfilmentMode` maps to a channel:
`quick` → `quick`, `standard` → `shop`.

## Seller

```js
channels: {
  quick: { status: 'none'|'pending'|'approved'|'rejected', rejectionReason: String|null, appliedAt: Date|null, decidedAt: Date|null },
  shop:  { status: 'none'|'pending'|'approved'|'rejected', rejectionReason: String|null, appliedAt: Date|null, decidedAt: Date|null },
}
```
- The account-level `status` (pending/approved/rejected) stays: it is the KYC/account approval.
- A seller sells in a channel only when the account is approved AND that channel is `approved`.
- Registration (`POST /api/v1/seller/register`, multipart) takes `channels` = `quick`, `shop` or `quick,shop`
  (at least one). Each picked channel starts `pending`; the others start `none`.
- Channel requirements, checked on apply and on approve:
  - quick: the seller has a zone and a location inside it (existing zone logic); FSSAI rules stay as they are.
  - shop: the seller has a pickup address with a 6-digit pincode.
- Seller API:
  - `GET /api/v1/seller/current` includes `channels`.
  - `POST /api/v1/seller/channels/:channel/apply`: moves `none`/`rejected` to `pending`. It returns 400 when the channel's requirements are missing, with a message saying what's missing.
- Admin API:
  - `PATCH /api/v1/admin/sellers/:id/channels/:channel` with body `{ action: 'approve'|'reject', reason? }`. Reject requires a reason.
  - The existing admin seller list/detail responses include `channels`. The seller list accepts an optional `channel=quick|shop` and `channelStatus=pending|approved|rejected|none` filter.
  - A channel request (`pending`) shows in the admin as a join request for that channel.
- Notifications: push the seller when a channel is approved or rejected.

## Product

```js
channels: { quick: Boolean (default true), shop: Boolean (default true) }   // at least one true
stock:    { quick: Number|null, shop: Number|null }                          // null = not counted (always in stock)
lowStockThreshold: { quick: Number|null, shop: Number|null }
availableIn: { quick: Boolean, shop: Boolean }                               // server-computed, read-only
```
Variant:
```js
channels: { quick: Boolean|null, shop: Boolean|null }   // null = inherit the product's
stock:    { quick: Number|null, shop: Number|null }     // null = draws on the product's stock for that channel (pack sizes)
lowStockThreshold: { quick: Number|null, shop: Number|null }
```
- These replace `stockQty`, `quickEligible` and the scalar `lowStockThreshold` on both product and variant.
- `isAvailable` stays as "available in at least one channel" for old readers. New code uses `availableIn`.
- A product can only enable a channel its seller is approved for. The server rejects anything else with a 400 on create/update.
- Seller and admin product create/update accept `channels`, `stock` and `lowStockThreshold` on the product and on each variant.
- Stock update endpoint: the existing seller stock route takes `{ channel, qty, variantId? }`, setting the absolute count for that channel. Low-stock list: `GET` the existing low-stock route with an optional `channel`. Each row says its channel.

## Orders and inventory

- Reservation, restock, release and low-stock alerts all work on the order's channel only.
- Checkout and order creation reject with a 400 when:
  - an item isn't enabled in the order's channel;
  - the variant isn't enabled in the order's channel;
  - the seller isn't approved for that channel.

## Catalogue

- Storefront endpoints with `fulfilmentMode`:
  - search
  - `/catalog/products`
  - store menu
  - store list
- For those endpoints, "can appear in this channel" means all of:
  - the seller is approved for the channel;
  - the product is enabled for it;
  - it is in stock (or not counted) for that channel.

  Variants not enabled for the channel are dropped from the response.
- Responses include `channels`, `stock` for the requested channel as `stockForChannel`, and `availableIn`.
- Admin panels: `/admin/quick` product lists filter `channels.quick = true`, and `/admin/shop` filters `channels.shop = true`. The seller list filters to sellers who have that channel (any status except `none`).
