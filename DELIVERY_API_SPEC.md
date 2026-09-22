# Delivery (rider) app API

Endpoints for the delivery app and the rider web app. Read
[API_CONVENTIONS.md](API_CONVENTIONS.md) first: it covers the base URL, the
response envelope, login and token refresh, push, sockets and data
conventions. Every path below is under `/api/v1`.

All `/delivery/*` endpoints need a `DELIVERY_PARTNER` token except the three
marked **public**.

## Login and registration

| Method | Path | |
|---|---|---|
| POST | `/auth/delivery/request-otp` | `{ phone }` |
| POST | `/auth/delivery/verify-otp` | `{ phone, otp, fcmToken?, platform? }` |
| GET | `/delivery/registration-fields` | **public**. The sign-up form, as configured by the admin |
| GET | `/delivery/check-vehicle/:number` | **public**. Whether a vehicle number is already registered |
| POST | `/delivery/register` | **public**. Multipart: the registration form plus documents |

Login outcomes:

- tokens and `user` → signed in
- `needsRegistration: true` → verified phone with no rider account; go to sign-up
- `pendingApproval: true` → registered but not approved. When `isRejected` is
  true, show `rejectionReason`; otherwise show `message` and wait for approval

`POST /delivery/reverify` (rider token) puts a rejected application back in
the admin's queue.

## Profile

| Method | Path | |
|---|---|---|
| PATCH | `/delivery/profile` | Profile and documents (multipart) |
| PATCH | `/delivery/profile/details` | Profile fields (JSON) |
| POST | `/delivery/profile/photo-base64` | Profile photo as base64 |
| PATCH | `/delivery/profile/bank-details` | Bank / UPI details (multipart, for a UPI QR image) |
| DELETE | `/delivery/profile/account` | Delete the account |

## Going online

`PATCH /delivery/availability` with `{ status, latitude, longitude }`
(`lat`/`lng` are also accepted) takes the rider on or off duty. Only online
riders get offers.

While online, send the position over the socket every few seconds:

```
emit('update-location', { lat, lng, heading?, speed?, accuracy?, orderId? })
```

Include `orderId` during a trip so the customer's tracking map and the seller
see the rider move.

## Trips

Offers arrive as a push notification and the `new_order` socket event. They
expire if nobody accepts them in time, and the order goes to the next rider.

| Method | Path | |
|---|---|---|
| GET | `/delivery/orders/available` | Offers open to this rider |
| GET | `/delivery/orders/current` | The active trip, if any |
| GET | `/delivery/orders/:orderId` | One order |
| GET | `/delivery/orders/:orderId/route` | Route for the map |
| PATCH | `/delivery/orders/:orderId/accept` | Accept an offer |
| PATCH | `/delivery/orders/:orderId/reject` | Decline an offer |
| PATCH | `/delivery/orders/:orderId/reached-pickup` | At the store |
| PATCH | `/delivery/orders/:orderId/confirm-pickup` | Picked up; `{ billImageUrl? }` |
| PATCH | `/delivery/orders/:orderId/reached-drop` | At the customer |
| POST | `/delivery/orders/:orderId/verify-drop-otp` | `{ otp }` from the customer |
| PATCH | `/delivery/orders/:orderId/complete` | Delivered |
| PATCH | `/delivery/orders/:orderId/status` | Generic status update |
| PATCH | `/delivery/orders/:orderId/rate-customer` | `{ rating, comment? }`, rating 1–5 |

The usual trip: accept → reached-pickup → confirm-pickup → reached-drop →
verify-drop-otp → complete.

Socket events during a trip: `order_ready` (the store has packed it),
`order_claimed` (another rider took the offer), `order_deassigned` (the admin
took the order away) and `order_status_update`. After a reconnect, emit
`resync` and wait for `resync_complete` to get the active trip back.

## Collecting payment at the door

For cash-on-delivery and pay-at-door orders:

| Method | Path | |
|---|---|---|
| GET | `/delivery/orders/:orderId/payment-status` | Whether the order is paid yet |
| POST | `/delivery/orders/:orderId/collect/qr` | Show a Razorpay QR for the customer to pay |
| POST | `/delivery/orders/:orderId/collect/cash` | Switch the order to cash payment |

Cash collected counts against the rider's cash limit (below).

## Wallet, cash and earnings

| Method | Path | |
|---|---|---|
| GET | `/delivery/wallet` | Balance, cash in hand |
| GET | `/delivery/cash-limit` | How much cash the rider may hold before depositing |
| POST | `/delivery/wallet/deposit/order` | Start a cash deposit: a Razorpay order |
| POST | `/delivery/wallet/deposit/verify` | Confirm the deposit payment |
| POST | `/delivery/wallet/withdraw` | Request a payout |
| GET | `/delivery/earnings` | Earnings summary |
| GET | `/delivery/pocket-details` | Earnings breakdown ("pocket") |
| GET | `/delivery/trip-history` | Past trips |
| GET | `/delivery/earning-addons/active` | Active incentive targets |
| GET | `/delivery/referrals/stats` | Referral stats |
| GET | `/payments/delivery/:deliveryPartnerId/wallet` | Wallet (own id only) |

## Safety and support

| Method | Path | |
|---|---|---|
| GET | `/delivery/emergency-help` | Emergency contacts |
| GET | `/delivery/order-emergency-requests` | My emergency requests |
| POST | `/delivery/order-emergency-requests` | Raise one for an order |
| GET | `/delivery/order-emergency-requests/:id` | |
| GET | `/delivery/support-tickets` | |
| POST | `/delivery/support-tickets` | |
| GET | `/delivery/support-tickets/:id` | |

## Push, inbox and chat

See [API_CONVENTIONS.md](API_CONVENTIONS.md#push-notifications). The rider
uses the same `/notifications/*`, `/chat/*` and `/fcm-tokens/*` endpoints as
the other apps.

## Standard (courier) orders

Orders sent by courier (Phase 2b) never reach a rider, so they never appear in
this app.
