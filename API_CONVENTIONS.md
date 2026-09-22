# API conventions for the apps

The shared rules for every client of the API (the web app today, and any future mobile app). Each app's
endpoints are listed in its own file:

| App | Endpoints |
|---|---|
| Customer app and website | [USER_APP_API.md](USER_APP_API.md) |
| Seller app and seller panel | [SELLER_API_SPEC.md](SELLER_API_SPEC.md) |
| Delivery (rider) app | [DELIVERY_API_SPEC.md](DELIVERY_API_SPEC.md) |

The source of truth for which endpoints exist is
`Backend/test/fixtures/routes.txt`. `npm test` fails if a route is added or
removed without updating it, so a path listed in these docs and missing there
is a doc bug.

## Base URL and path layout

All endpoints are under `/api/v1`, grouped by who calls them:

| Prefix | Caller | Auth |
|---|---|---|
| `/auth` | everyone (login, refresh, logout) | none, except `/auth/me`, `/auth/logout` |
| `/catalog` | anyone browsing: categories, products, stores, search, offers | none |
| `/content` | anyone: banners, CMS pages, zones | none for reads; writes are admin-only |
| `/settings` | anyone: business, fee, feature settings | none |
| `/user` | customer account: profile, addresses, cart, wallet, favourites | `USER` |
| `/orders` | customer orders | `USER` |
| `/payments` | wallet balance and payment trails | any logged-in role, limited to the caller's own data |
| `/seller` | seller account and store operations | `SELLER`, except registration |
| `/delivery` | rider account and trips | `DELIVERY_PARTNER`, except registration |
| `/notifications` | in-app inbox | `USER`, `SELLER`, `DELIVERY_PARTNER` |
| `/chat` | order chat | any logged-in role |
| `/ai` | shopping assistant chat | none (token optional) |
| `/fcm-tokens` | push token registration | any logged-in role |
| `/uploads` | image upload | see [Uploads](#uploads) |
| `/admin` | admin panel only; not documented for the apps | `ADMIN` |
| `/health` | uptime checks (`/health/rate-limit` outside production only) | none |

Outside `/api/v1`: `GET /health`, `GET /ready`, the share-link pages
`GET /product-detail?id=…` and `GET /seller-detail/:id`, and
`GET /.well-known/assetlinks.json` for Android app links.

There is no `/api/v1/food` prefix and no alias for it. Quick (~30 min) and
standard delivery are chosen with a `deliveryMode` field (`'quick' | 'basic'`),
not a separate path tree.

## Response envelope

Every JSON response has the same shape:

```json
{ "success": true, "message": "Human-readable text", "data": { } }
```

Errors return `success: false` and a `message`, with no `data`:

```json
{ "success": false, "message": "Phone must contain only digits" }
```

| Status | Meaning |
|---|---|
| 400 | Validation failed. `message` names the first problem, for example `items.0.quantity: …` |
| 401 | Missing, invalid or expired token, or the session was replaced (see below) |
| 403 | Logged in with the wrong role, or the resource belongs to someone else |
| 404 | Not found, or not visible to the caller |
| 429 | Rate limited |

## Authentication

Every app logs in with a phone OTP. The OTP is 4 digits.

1. `POST /auth/{user|seller|delivery}/request-otp` with `{ "phone": "9876543210" }`
   (digits only, 8–15 long). Outside production, the response includes
   `data.otp` so testers don't need SMS.
2. `POST /auth/{role}/verify-otp` with `{ phone, otp, fcmToken?, platform? }`.
   `platform` is `'mobile'` or `'web'`. The customer endpoint also takes
   `name` (first login) and `ref` (referral code).

A successful login returns:

```json
{ "accessToken": "…", "refreshToken": "…", "user": { }, "isNewUser": false }
```

The customer endpoint returns `isNewUser`. The seller and delivery endpoints
return `needsRegistration` instead, and when it is `true` there are no tokens:
the phone is verified but has no account yet, so the app goes to registration.
Delivery login can also return `pendingApproval: true` (with `isRejected` and
`rejectionReason`) for a rider who registered but isn't approved yet. A seller
whose registration is pending or rejected gets a 401 with an explanatory
message.

Send the access token on every request:

```
Authorization: Bearer <accessToken>
```

Tokens last 15 minutes (access) and 7 days (refresh) by default. On a 401,
call `POST /auth/refresh-token` with `{ refreshToken }` to get a new
`accessToken`, then retry once. If the refresh also fails, log the user out.

**One device per account.** Each login of a customer, seller or rider
invalidates that account's earlier sessions. The old device's next request
returns 401 with *"You have been signed out because this account was used on
another device"*, and its refresh is refused too. Show that message rather
than a generic "session expired".

`POST /auth/logout` with `{ refreshToken, fcmToken?, platform? }` revokes the
refresh token and removes the push token. `GET /auth/me` returns the logged-in
account.

## Push notifications

After login, register the device's FCM token:

- `POST /fcm-tokens/mobile/save` from the apps
- `POST /fcm-tokens/save` from the web

`DELETE /fcm-tokens/remove` (or `/remove/:token`) unregisters it. Passing
`fcmToken` to verify-otp and logout does the same thing in one call.
`GET /fcm-tokens/check` is a public service check, and `POST /fcm-tokens/test`
sends a test push to the logged-in account.

Push `data` always carries a `type`, and usually `orderId` or `id`, so the app
can deep-link. The same notifications also appear in the inbox:

| Method | Path | |
|---|---|---|
| GET | `/notifications/inbox` | List |
| PATCH | `/notifications/:id/read` | Mark one read |
| PATCH | `/notifications/inbox/read-all` | Mark all read |
| DELETE | `/notifications/:id` | Delete one |
| DELETE | `/notifications/inbox/all` | Clear the inbox |

## Realtime (Socket.IO)

Connect to the API origin with the access token in `auth.token`, the
`Authorization` header or the `token` query parameter. The server puts each
socket into its own room from the token: `USER`, `SELLER` or `DELIVERY_PARTNER`
by account id.

| Direction | Event | Used by |
|---|---|---|
| client → server | `join-tracking` (orderId), `leave-tracking` | customer, to follow a live order |
| server → client | `order_status_update` | customer, seller |
| server → client | `location-update` | customer (rider position on the tracking map) |
| server → client | `delivery_drop_otp` | customer (handover OTP) |
| server → client | `new_order` | seller (an order to accept) and rider (a delivery offer) |
| server → client | `order_deleted`, `admin_notification` | seller |
| client → server | `join-delivery` (own id), `update-location`, `resync` | rider |
| server → client | `order_status_update`, `new_order_available`, `order_claimed`, `order_deassigned`, `order_ready`, `resync_complete` | rider |
| both | `chat:message`, `chat:typing`, `chat:conversation_update` | order chat |

Sockets are for live updates only. Every state they report can also be read
over HTTP, so re-fetch after a reconnect.

## Uploads

Most uploads go with the resource (`multipart/form-data` on the endpoint that
owns the image, such as a seller's cover image or a rider's documents). The
generic `POST /uploads/image` takes a `file` field and a `folder`
(letters, digits, `/`, `_`, `-`), and returns `{ url, path, filename, mimeType, size }`.

## Data conventions

- Ids are Mongo ObjectId strings. Money is in rupees as a number (not paise),
  except inside Razorpay payloads, which use paise as Razorpay does.
- Dates are ISO 8601 strings in UTC.
- Coordinates: saved addresses return flat `latitude` / `longitude`; GeoJSON
  fields are `[longitude, latitude]`. Order endpoints accept either form.
- `foodType` on a product is an optional veg/non-veg mark: `'Veg'`,
  `'Non-Veg'` or `null` (not applicable, e.g. electronics). Cart and order
  lines carry the same thing as `isVeg`: `true`, `false` or `null`.
- Order ids shown to people look like `ORD-…` (orders placed before the rename
  keep their `FOD-…` ids). Use `_id` in API paths unless an endpoint says
  otherwise.

## Order status

`orderStatus` moves through:

`pending_payment` → `created` → `confirmed` → `preparing` →
`ready_for_pickup` → `reached_pickup` → `picked_up` → `reached_drop` →
`delivered`

or ends in `cancelled_by_user`, `cancelled_by_seller` or `cancelled_by_admin`.
`pending_payment` is an online-payment order whose payment hasn't been verified
yet. Rider assignment is tracked separately in `dispatch.status`
(`unassigned`, `assigned`, `accepted`, `rejected`, `cancelled`).

## What changed from the old spec

For anyone porting code written against the previous version of these docs:

- `/api/v1/food/...` is gone. Paths are grouped by caller as in the table above,
  for example `/api/v1/food/user/profile` → `/api/v1/user/profile` and
  `/api/v1/food/seller/sellers/:id` → `/api/v1/catalog/stores/:id`.
- "restaurant" is "seller" everywhere: paths, fields (`sellerId`,
  `sellerName`), roles (`SELLER`) and socket rooms.
- Removed with no replacement: dining and table booking, add-ons, cutlery,
  cuisines, pure-veg stores, gourmet / under-250 / coffee collections.
- Search results mark product matches with `matchType: 'product'`
  (was `'food'`). Seller product create/update and approval responses return
  the product under `product` (was `food`).
- The share link for a product is `/product-detail?id=…` (was `/food-detail`).
