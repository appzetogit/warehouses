# Admin Guide

This guide is for the operations and admin team. It explains how to run the business from the admin panel: approving sellers and products, handling orders and deliveries, running promotions, and reading the reports.

Menu names in this guide match the admin sidebar exactly. "Where: Menu > Item" means: find the section heading in the left sidebar, then click the item under it.

## Contents

1. [Signing in](#1-signing-in)
2. [The two panels: Quick and Shop](#2-the-two-panels-quick-and-shop)
3. [Sellers and channel approvals](#3-sellers-and-channel-approvals)
4. [Zones (Quick only)](#4-zones-quick-only)
5. [Products, variants and stock](#5-products-variants-and-stock)
6. [Categories and attributes](#6-categories-and-attributes)
7. [Orders](#7-orders)
8. [Courier shipments, NDR and RTO (Shop only)](#8-courier-shipments-ndr-and-rto-shop-only)
9. [Returns and refunds](#9-returns-and-refunds)
10. [COD remittances and checkouts](#10-cod-remittances-and-checkouts)
11. [Customers and support](#11-customers-and-support)
12. [Coins](#12-coins)
13. [Spin wheel](#13-spin-wheel)
14. [Push campaigns and the first-order guard](#14-push-campaigns-and-the-first-order-guard)
15. [Coupons and offers](#15-coupons-and-offers)
16. [Referrals](#16-referrals)
17. [Delivery partners, fees and dispatch (Quick only)](#17-delivery-partners-fees-and-dispatch-quick-only)
18. [Reports](#18-reports)
19. [AI assistant](#19-ai-assistant)
20. [Business settings, branding and theme colour](#20-business-settings-branding-and-theme-colour)
21. [Sub-admins and roles](#21-sub-admins-and-roles)
22. [Known gaps](#22-known-gaps)

---

## 1. Signing in

Where: the admin login page at `/admin/login`.

1. Enter your email address and password. The password must be at least 6 characters.
2. Click sign in. You land on the **Quick** panel dashboard (`/admin/quick`).

**Forgot your password?**

1. On the login page, click the forgot-password link. This opens `/admin/forgot-password`.
2. Enter your email. A 6-digit code is emailed to you.
3. Enter the code, then choose a new password (at least 6 characters) and type it again to confirm.
4. You are sent back to the login page with a confirmation message.

> Tip: at the top of every admin page, **Admin Portal** takes you to the current panel's dashboard. **User Store** opens the customer website.

---

## 2. The two panels: Quick and Shop

The business sells through two channels. Each one has its own admin panel.

| Panel | Address | What it covers |
|---|---|---|
| **Quick** | `/admin/quick` | Quick delivery by our own riders, measured in minutes (30 minutes by default). Orders with fulfilment mode "quick". |
| **Shop** | `/admin/shop` | Standard delivery by courier (Shiprocket). Orders with fulfilment mode "standard". |

**Switching panels.** Use the **Quick / Shop** switcher in the top bar. The Quick panel has an amber stripe at the top of the page and the Shop panel has an indigo one, so you can always tell which panel you are in.

- If the other panel has the page you are on, the switch keeps you on that page.
- If the page only exists in one panel (for example **NDR Queue**), the switch takes you to the other panel's dashboard.

**What each panel shows.**

- Product lists show only products enabled for that panel's channel.
- Seller lists show only sellers who have applied to that channel, whatever their approval status.
- Orders show only orders from that channel.

**Menu items that appear in only one panel:**

- Quick only:
  - **Point of Sale**
  - **Zone Setup**
  - **Orders > Out For Delivery**
  - **Order Detect Delivery**
  - the whole **DELIVERY MANAGEMENT** section
  - **Safety Emergency Reports**
- Shop only:
  - **Attributes & Sets**
  - **Courier Shipments**
  - **Returns**
  - **NDR Queue**
  - **RTO Queue**
  - **COD Remittances**

Every other menu item appears in both panels.

---

## 3. Sellers and channel approvals

A seller goes through two separate approvals:

1. **Account (KYC) approval.** Checks who the seller is. It covers the whole account.
2. **Channel approval.** Approves the seller for **Quick**, for **Shop**, or for both. Each channel is approved or rejected on its own.

A seller can sell in a channel only when the account is approved **and** that channel is approved.

Each channel has a status: **Not applied**, **Pending**, **Approved** or **Rejected**. A seller picks one or both channels when registering. They can apply again later for a channel that was rejected or that they didn't pick.

**What a seller needs before a channel can be approved** (the system checks this both when the seller applies and when you approve):

- **Quick:** a service zone, and a store location inside that zone. The FSSAI rules still apply.
- **Shop:** a pickup address with a 6-digit pincode.

If anything is missing, the approval fails and a message says what is missing.

### Approve a new seller

Where: **SELLER MANAGEMENT > Sellers > New Seller Requests**

The page shows requests for the channel of the panel you are in. For example, Quick requests appear in the Quick panel.

1. Open the **Pending Requests** tab. Sellers who changed their location and are waiting for approval also appear here.
2. To approve the account, click the approve button (tooltip "Approve account (KYC)").
3. Under **Sales channels**, click **Approve** for the channel.
4. To reject a channel, click **Reject**, type the reason, then confirm. **You must enter a reason.** The seller receives a notification with the result.
5. Past rejections are listed on the **Rejected Request** tab.

### Change an existing seller's channels

Where: **SELLER MANAGEMENT > Sellers > Sellers List**

1. The **Channels** column shows a badge for each channel, for example "Quick: Approved" or "Shop: Pending".
2. Open a seller. You can approve or reject each channel in the **Sales channels** panel, which also appears on the seller's edit page under **Sales Channels**.
3. **Reject** also works on a channel that is already approved. This stops the seller selling in that channel.

### Other seller pages

- **Unregistered Sellers.** Sellers who started signing up but never finished. This page only appears when the "Unregistered Sellers" feature is switched on (see section 20).
- **Seller Reviews** and **Seller Complaints.** Read and respond to feedback about sellers.
- **Seller Settings.** Rules for how sellers accept orders.
- **Subscription Settings** and **Subscription Billing.** Monthly seller subscription plans and invoices. These pages only appear when the "Seller Subscription" feature is on.
- **TRANSACTION MANAGEMENT > Seller Withdraws.** Review sellers' payout requests.

---

## 4. Zones (Quick only)

A zone is the area on the map where Quick delivery is offered. Customers in a zone see "Get it in N min".

Where: **SELLER MANAGEMENT > Zone Setup**

1. Click to add a zone. Fill in **Country**, **Create Zone name**, **Select Unit** (Kilometers or Miles) and **Quick delivery time (minutes)**.
2. Click **Start Drawing**, then click points on the map around the area. Use **Undo Point** to remove your last point and **Clear** to start again.
3. Click **Finish Shape**. You can then drag the corners of the shape to adjust it.
4. Click **Save Zone**.

> Rules:
> - A zone needs **at least 3 points**.
> - The quick delivery time must be a **whole number from 5 to 120 minutes**.
> - A seller's store must sit inside their zone before they can be approved for Quick.

---

## 5. Products, variants and stock

### Approve products

Where: **CATALOG MANAGEMENT > Product Approval**

Sellers' new and changed products wait here until an admin approves them. The list shows products for the current panel's channel.

1. Review a product and click **Approve** or **Reject**. **You must give a reason to reject.**
2. To approve everything on screen, click **Approve all N**. If you have searched first, the button reads **Approve N shown** and approves only the search results. You are asked to confirm first.

### Add or edit a product

Where: **CATALOG MANAGEMENT > Products > Seller Products List**

1. Click **Add Product**, or click the edit icon on an existing product.
2. Fill in the details:
   - **Seller**
   - **Category**
   - **Product Name**
   - **Base Price**
   - **Other Platform Price** (optional)
   - **Veg / Non-veg**
   - **Upload Images**
   - **Timing**
   - **Description**
3. Under **Channels and stock**, tick **Sell in Quick** and/or **Sell in Shop**. You can only tick channels the seller is approved for. The others are greyed out with "(seller not approved)".
4. For each ticked channel, fill in:
   - **Quick stock** / **Shop stock:** the number of units on hand in that channel. **Leave it empty for "Not counted"**, which means the product is always in stock.
   - **Low-stock alert:** the stock level at which the product counts as running low.
5. Add **Variants** if needed (see below).
6. Click **Add Product** or **Update Product**.

> Rules the system enforces:
> - Category and product name are required. Base price must be greater than 0.
> - Other platform price must be higher than the selling price.
> - At least one channel must be enabled.
> - Stock and low-stock values must be whole numbers, 0 or more.
> - The server rejects any product that enables a channel the seller is not approved for.

### Variants

Variants are versions of one product, such as sizes or pack sizes.

- Each variant has its own price. MRP is optional; if it is empty, the product's MRP is used.
- Each variant has its own **stock per channel**. An empty value means the variant uses the product's stock for that channel, which suits pack sizes of the same item.
- Each variant can be switched on or off per channel, or follow the product's setting.
- Each variant can have up to **10 photos**. These show first when a customer picks that variant.
- Every variant needs a name or options, and a price above 0. Two variants cannot have exactly the same options.
- When a product has variants, customers see the lowest variant price as the starting price.

### Low stock

The product list has a stock column for each channel. A figure turns **red** when stock is at or below its low-stock alert. There is no separate low-stock page in the admin panel. Sellers get low-stock alerts for each channel in their own panel.

### Bulk tools

- **Bulk Upload:**
  1. **Step 1:** download the Excel template.
  2. **Step 2:** choose the seller.
  3. **Step 3:** upload the filled-in file.
  4. Click **Start Bulk Upload**.
- **Delete Selected (N):** tick products in the list, then use this button to delete them together.

---

## 6. Categories and attributes

### Categories

Where: **CATALOG MANAGEMENT > Categories**

1. Click **Add Category**. Fill in:
   - **Zone** (leave empty for "Global")
   - **Category Type**
   - **Category Name**
   - **Parent category** (leave empty for top level)
   - **Attribute set** (optional)
   - **Requires FSSAI licence**
   - **Commission %**
   - **Category Image**
   - **Active Status**
2. Save.

> Rules:
> - Categories have **two levels only**. A parent must be a top-level category, and a category that already has subcategories cannot be given a parent.
> - Commission must be **between 0 and 100**. Leave it empty for no category commission.
> - Images must be PNG, JPG, JPEG or WEBP, **5 MB at most**. Names can be up to 200 characters.

**Categories suggested by sellers** appear in the list with **Approve** and **Reject** buttons. Reject asks for a reason, which is required (up to 500 characters). After you approve one, **Make Global** makes it available to all sellers. Until then it stays private to the seller who created it.

### Attributes & Sets (Shop only)

Where: **CATALOG MANAGEMENT > Attributes & Sets**

Attributes are standard product options such as Size, Color, Material, RAM or Storage. An attribute set groups several attributes. When you link an attribute set to a category, sellers in that category can build a full variant grid from it.

1. On the attributes tab, enter:
   - **Name**
   - **Display Type**, for example text chips such as S, M, L
   - the values, separated by commas
   For colour attributes, pick a **Swatch colour** for every value.
2. On the sets tab, enter a **Set Name** and select at least one attribute.
3. Link the set to a category from the category form (**Attribute set**).

> You can't delete an attribute or set while it is in use.

---

## 7. Orders

Where: **ORDER MANAGEMENT > Orders**

Orders are grouped by status:

- **All**
- **Pending**
- **Processing**
- **Out For Delivery** (Quick only)
- **Delivered**
- **Cancelled**
- **Seller cancelled**
- **Payment Failed**
- **Refunded**
- **Offline Payments**
- **User Carts**

Offline Payments only appears when the Cash On Delivery feature is on. User Carts shows what customers have left in their carts.

Common tasks:

1. **Accept** or **Reject** an order on the seller's behalf.
2. **Deassign & Resend** (Quick): takes the order away from the current rider and searches for a new one.
3. **Refund:**
   - Online payments: a Razorpay refund to the customer's original payment method. You are asked to confirm.
   - Wallet payments: a dialog lets you add the money back to the customer's wallet.

**Order Detect Delivery** (Quick): follows each order through its stages:

1. Ordered
2. Seller Accepted
3. Delivery Boy Assigned
4. Delivery Boy Reached Pickup
5. Reached Drop
6. Delivered

Rejected orders are shown too.

**Order Reassignment Requests** (Quick, under DELIVERY MANAGEMENT): riders' requests to hand an order back. Click **Deassign & Resend** to restart the rider search. If the previous attempt failed, the button reads **Retry Dispatch**.

---

## 8. Courier shipments, NDR and RTO (Shop only)

**Which courier is used.** Shop orders go through **Shiprocket** when the server has Shiprocket login details configured. Otherwise a **mock (test) courier** is used, which books nothing real. This is a server setting, not an admin panel setting. If your AWB numbers look fake, ask the technical team to check the Shiprocket setup.

### Courier Shipments

Where: **ORDER MANAGEMENT > Courier Shipments**

1. Filter by status (for example "Not booked", "In transit", "Undelivered (NDR)" or "RTO received"), courier or date, then click **Apply**.
2. Click **Book** to book an order with the courier. You get an AWB (tracking) number.
3. Open a row to see live tracking, and click **Refresh** to update it. If the courier reports the parcel delivered, the order is marked delivered.
4. **Cancel** cancels a booked shipment. A reason is optional.

### NDR Queue (failed delivery attempts)

Where: **ORDER MANAGEMENT > NDR Queue**

"NDR" (non-delivery report) means the courier tried to deliver and failed. The tabs are **Needs action**, **Actioned** and **All**. For each parcel you can do one of three things:

- **Re-attempt:**
  1. Optionally correct the address, phone, date or comments.
  2. Click **Request re-attempt**.
- **RTO:** send the parcel back to the seller. You are asked to confirm.
- **Contact:** send the customer a message. Leave it blank to send the default message.

### RTO Queue (returns to seller)

Where: **ORDER MANAGEMENT > RTO Queue**

"RTO" means "return to origin", i.e. the parcel is going back to the seller. The tabs are **Returning**, **Received** and **All**.

1. When the parcel is back with the seller, click the receive button and add a note if you want.
2. The items go back into Shop stock.
   - Prepaid orders: the customer is refunded automatically.
   - COD orders: there is nothing to refund.

> If a refund fails, the message says so. Receive the parcel again to retry the refund.

---

## 9. Returns and refunds

Where: **ORDER MANAGEMENT > Returns** (Shop)

**Return window.** Click **Return window: N days** to change how many days after delivery a customer can ask for a return. The default is **7 days**. **It must be a whole number from 0 to 90.**

**Handling a return.** Use the filter tabs to find returns: **Requested**, **Approved**, **Received (refund pending)**, **Refunded** and **Rejected**.

1. Open a request. You see the reason and up to 5 photos from the customer.
2. To accept it, click **Approve**. Tick **Book a reverse pickup with the courier** if the courier should collect the items.
3. To refuse it, type a reason in the box and click **Reject**. **The reason is required.**
4. When the items arrive, click **Mark received & refund** and confirm the amount. If the refund fails, the button changes to **Retry refund**. A return can never be refunded twice.

**How the refund amount is worked out.**

- The customer gets back what they paid for the returned items: the item price, less their share of any coupon, plus GST.
- **Delivery and platform fees are not refunded.**
- If coins paid for part of the order, that same share comes back as coins and the rest as money.

**Refund to coins.** The customer chooses where a refund goes: to the original payment method or to coins. If they choose **coins**:

- The full refund is credited as coins.
- Only the **spendable share** can be used (80% by default, see section 12). So a 1,000-coin refund is worth at most ₹800.
- Cash-on-delivery orders have no online payment to reverse. Their money refunds go to the customer's **wallet**.

---

## 10. COD remittances and checkouts

**COD Remittances** (Shop menu): records cash-on-delivery money handed over to us. The page has tabs for **Couriers (Shop)** and **Riders (Quick)**.

To record a courier payment:

1. Click **Record a courier COD remittance**.
2. Enter the courier name, a UTR/reference and an optional note.
3. Paste one "awb,amount" line per parcel.
4. Click **Check matches** to compare your lines with our expected amounts.
5. Click **Save and mark remitted**.

**Checkouts** (both panels): a checkout is one customer payment that was split into one order per seller. Filter the list and open a checkout to see all its orders together.

---

## 11. Customers and support

- **CUSTOMER MANAGEMENT > Customers:**
  - search and sort the customer list
  - open a customer to see their details and order totals
  - set a customer **Active** or **Inactive**
  - **Export** the list
- **CUSTOMER MANAGEMENT > Support Tickets (User & Seller):**
  1. Open a ticket.
  2. Set its status to **Open**, **In Progress** or **Resolved**.
  3. Write an **Admin Response**.
- **HELP & SUPPORT > User Feedback:** customer feedback and ratings sent from the app.
- **HELP & SUPPORT > Safety Emergency Reports** (Quick): safety reports. Set the priority (Medium, High, Critical, Urgent) and the status (Unread, Read, Resolved).
- **DELIVERY MANAGEMENT > Delivery Support Tickets** and **Delivery Emergency Help** (Quick): the same kind of pages, for riders.

---

## 12. Coins

Coins are promotional credit. They are separate from the customer wallet, which holds real money. Customers receive coins from:

- refunds
- spin-wheel wins
- referrals
- campaigns
- admin grants

Where: **COINS & REWARDS > Platform Coins**. The page has four tabs.

**Rules & Settings**

| Setting | Default | What it means |
|---|---|---|
| **Coins Active** | On | Master on/off switch for coins. |
| **Refund Spendable Cap (%)** | **80** | The share of each coin credit that can ever be spent. With 80%, 1,000 refund coins give 800 spendable coins and the other 200 can never be spent. Each credit keeps the percentage that applied on the day it was given. |
| **Max Order Payable (%)** | 50 | The most of one order's total that coins can pay. |
| **Coin Expiration Period (Days)** | 90 | Each credit expires this many days after it was given. The coins closest to expiring are spent first. |
| **Coin Value (₹ per coin)** | 1 | Rupees one coin is worth. |

The percentages must be from 1 to 100, expiry must be at least 1 day, and coin value must be at least 0.1.

**Liability Report:** how many coins are outstanding and what they are worth. See also the Coin Liability report in section 18.

**Manual Adjustment:** add or remove coins for one customer.

1. Enter the customer's User ID.
2. Choose **Credit (+)** or **Debit**.
3. Enter the amount.
4. Enter a reason. **The reason is required**, because every adjustment is recorded for audit.

**User Ledgers:** enter a User ID to see every coin credit, spend and expiry for that customer.

---

## 13. Spin wheel

Where: **COINS & REWARDS > Spin Wheel**

Customers can spin a daily wheel to win coins. **Only one wheel can be live at a time.**

1. Click **New wheel**. Fill in:
   - **Name**
   - **Spins per customer per day**
   - **Monthly coin budget:** 0 means no limit. Once the budget is used up, coin prizes stop paying out until next month.
   - **Starts at** and **Ends at** (optional)
2. Add the rewards. Each reward has a **Label**, a **Type** (Coins or No reward), a **Coins** amount, a **Weight** and a **Color**. The **Chance** of each reward is its weight divided by the total of all weights, and is shown as you type.
3. Click **Create wheel**. A new wheel is **not live** until you activate it. Activating a wheel switches the current live wheel off, and you are asked to confirm.

> Rules:
> - A wheel needs **2 to 12 rewards**.
> - Daily spins must be a **whole number from 1 to 10**.
> - Each weight must be at least 1, and each coin prize must be a positive whole number.
> - The end time must be after the start time.

The page also shows a monthly report of spins, wins and coins given out.

---

## 14. Push campaigns and the first-order guard

Where: **COINS & REWARDS > Push Campaigns**

### Create a campaign

1. Click **New campaign**. Enter a **Title** and **Message** (both required). An image is optional.
2. Choose the **Audience**:
   - All customers
   - Customers in zone(s)
   - Ordered in Quick / Shop recently (last N days)
   - Inactive for N days
   - Never ordered
   - Coin balance at least X
   - Sellers
   - Riders
   The expected audience size appears as you choose.
3. Choose what the push **Opens**: nothing (just the app), a product, a category, a store, an offer code or the spin wheel.
4. Choose a **Schedule**:
   - **Send now**
   - **At a time**
   - **Recurring:** daily or weekly at a set time. **A recurring campaign needs an end date**, and weekly campaigns need at least one day ticked.
5. Save.

In the list you can view **Stats**, **Edit** (while in draft, scheduled or paused), **Pause**, **Resume**, **Cancel** or **Delete** (except while sending).

### Settings

Click **Settings**. The dialog has two sections.

**Push campaigns:**

- Max marketing pushes per person per day (0 means no limit)
- **Quiet hours:** no marketing pushes are sent between the start and end times
- Batch size and the pause between batches

**First-order offer: once per…** This is the **first-order guard**. It stops someone using a first-order offer more than once. A person who has already used it is recognised by any of these ticked checks:

- **Account**
- **Verified phone**
- **Device**
- **Card / UPI used to pay**

All four are on by default. Untick one to stop checking it.

- If the same card or UPI turns up only after payment, the claim is flagged for review rather than blocked.
- A claim is released if the order is cancelled before dispatch or the payment is abandoned.

---

## 15. Coupons and offers

Where: **PROMOTIONS MANAGEMENT > Seller Coupons & Offers** (the page heading reads "Seller Offers & Coupons")

1. Click **Create Coupon**. Fill in:
   - **Coupon Code**
   - **Discount Type** (percentage or flat amount) and the discount
   - **Customer Scope** (all customers, or first-time customers only)
   - **Seller Scope** (all sellers, or selected sellers)
   - **Min Order Value (₹)** and **Max Discount (₹)**
   - **Usage Limit (global)** and **Per User Limit**
   - **Start Date** and **Expiry Date** (both optional)
   - **First order only**
   - **Admin Bear (%)** and **Seller Bear (%)**, which say who pays for the discount
2. Save. Use **Show In Cart** to decide whether customers see the coupon suggested in their cart.

> Rules the server enforces:
> - The discount must be greater than 0.
> - **Percentage coupons must have a Max Discount.**
> - Admin Bear and Seller Bear must **add up to exactly 100%**.
> - The expiry date must be in the future and after the start date.
> - "Selected" seller scope needs at least one seller.

First-order coupons are also protected by the first-order guard (section 14).

---

## 16. Referrals

Where: **COINS & REWARDS > Referral Settings**

The page has two sections, **User Referral** and **Delivery Partner Referral**. Each has three fields:

- **Reward amount (₹)**
- **Max credits per referrer**
- **Invite link**: put `{code}` where the referral code should go, or leave it blank

> Amounts and limits can't be negative. Invite links must start with http:// or https:// and be at most 500 characters.

---

## 17. Delivery partners, fees and dispatch (Quick only)

**Riders.** Where: **DELIVERY MANAGEMENT > Deliveryman**

- **New Join Request:** review a rider's documents (Aadhar, driving licence, bank details), then click **Approve Request** or **Deny Request**.
- **Deliveryman List:** all riders. **Live Tracking** shows where riders are now.
- **Deliveryman Reviews**, **Bonus**, **Earning Addon**, **Earning Addon History** and **Delivery Earning** cover rider ratings, one-off bonuses, incentive schemes and earnings.
- **Delivery Withdrawal:** approve or reject riders' payout requests. A rejection needs a reason.
- **Delivery boy Wallet:** view riders' wallet balances.

**Fees.** Where: **DELIVERY MANAGEMENT > Delivery & Platform Fee**

1. Under **Fee Configuration**, set **Platform Fee (₹)**, **Quick Delivery Extra (₹)** and **GST Rate (%)**.
2. Under **Delivery Fee by Distance Range**, add ranges with these fields:
   - **Min Distance (km)** and **Max Distance (km)**
   - **User Delivery Fee (₹)**, which the customer pays
   - the rider's pay, as either **DB Per KM (₹)** or **DB Base Pay (₹)**

> Rules:
> - Ranges can't overlap, and min must be less than max.
> - Each range gets either a per-km rate or a base pay, not both.
> - Base pay can be used on only one range.

**Dispatch.** Riders are not assigned by hand. When the seller accepts a Quick order:

1. The order is offered to riders near the seller.
2. If nobody takes it, the search widens step by step: 3 km, 5 km, 8 km, then 12 km. The technical team can change these distances.
3. If the order still has no rider after several attempts, it is offered to all riders and admins are alerted.

To restart the search for an order, use **Deassign & Resend** (section 7).

---

## 18. Reports

Where: **REPORT MANAGEMENT**. Most reports have a date range, a mode filter (All modes, Quick, Standard), an **Apply** button and an **Export Excel** button.

| Report | What it shows |
|---|---|
| **Transaction Report** | Money in and out across orders for the period. |
| **Delivery SLA** | Whether deliveries arrived on time. Quick orders are judged against the ETA promised to the customer, or 30 minutes if none was given. Standard orders are judged against the courier's estimate. It shows the number delivered, the median and 90th-percentile delivery time, the on-time %, and the late count, broken down by mode and by seller, plus a list of **Late orders**. |
| **Commission Report** | Gross item value, **Commission** (and its % of gross), seller-funded and platform-funded discounts, **Coins discount (platform)**, and **Net payable to sellers**, per seller. |
| **Coin Liability** | **Outstanding coins** (and how many can never be spent), **Spendable liability** in ₹, coins **expiring** in 7, 30 and 90 days, and coins issued, redeemed and expired in the period, broken down by source. |
| **Order Report** | Order list and totals for the period. |
| **Tax Report** | Tax collected, by order. |
| **Seller Report** | Performance by seller. |
| **Customer Report > Feedback Experience** | Customer feedback ratings. |

**Payment Reconciliation.** Where: **TRANSACTION MANAGEMENT > Payment Reconciliation**

This check compares online payments we recorded as paid with what the payment gateway actually received.

1. Pick **From** and **To** dates.
2. Click **Run check**. It checks at most 500 payments per run.
3. Each payment is marked with one of these results:
   - **OK**
   - **Amount mismatch**
   - **Not captured**
   - **Missing payment ID**
   - **Gateway error**
4. Look into every row that is not OK.

**Point of Sale** (Quick, top of the menu) opens "Seller POS Analytics & Benefits": seller performance, order earnings and subscription billing figures. It is not a till.

---

## 19. AI assistant

Where: **AI ASSISTANT > AI Settings** (page title "Shopping assistant settings")

The customer shopping assistant and smart search use **Google Gemini**. A banner at the top tells you whether a Gemini API key is set up on the server. Without a key, the assistant answers from built-in rules only. The key is added by the technical team, not on this page.

Settings on this page:

- **Assistant enabled:** when off, customers see a short notice instead of answers.
- **Smart search uses the model as a fallback:** search asks the AI only when it can't understand a query itself.
- **Model:** leave blank to use the default (gemini-2.5-flash).
- **Extra instructions for the assistant:** up to 2,000 characters.
- **Daily messages per user:** 0 means no limit.
- **Monthly token budget:** 0 means no limit. When the budget runs out, the assistant switches itself off until next month.
- **Keep conversations for (days):** at least 1.
- **Input cost** and **Output cost:** used only to estimate spend on the usage page.

Click **Save settings**. Changes apply within 30 seconds.

**Conversations** lists customers' chats with the assistant. **AI Usage** shows messages, tokens and estimated cost.

---

## 20. Business settings, branding and theme colour

**Business Setup.** Where: **SYSTEM SETTINGS > Business Setup**

- **Company Information:** Company name, Email, Region, Phone, Address, State and Pincode.
- **Logo** and **Favicon**, plus separate logos and favicons for the seller and delivery apps.
- **Shop delivery time:** **Minimum days** and **Maximum days**. Customers see "Delivery {date}–{date}" based on these when the courier has no estimate for their pincode.
- **Social links**, **Google Maps API Key** and **Firebase** settings.

> Rules:
> - Company name must be at least 2 characters.
> - Email and phone (7 to 15 digits) are required. The pincode must be 4 to 10 digits.
> - Delivery days must be from 1 to 30, and the minimum can't be more than the maximum.
> - Images must be PNG, JPG, JPEG or WEBP (favicons may also be ICO), **5 MB at most**.

**Theme colour and font.** Where: **SUPER POWERS > Power Scanning** (super admins only)

1. Pick a **Theme Color** (with the picker or by typing a hex code like `#FD920B`) and a **Text Font** for each app:
   - **User Module** (default brand orange `#FD920B`)
   - **Seller Module** (default `#2563EB`)
   - **Delivery Module** (default `#00B761`)
2. Click **Save Changes**.

**Feature Settings.** Where: **SUPER POWERS > Feature Settings** (super admins only)

Switches features on and off:

- **Seller Subscription**
- **Cash On Delivery (COD)**, which also shows or hides Offline Payments
- **Admin Access Section**, which shows or hides the Sub Admin List
- **Unregistered Sellers**

**Other settings pages:**

- **SYSTEM SETTINGS > Broadcast Notification:** send a one-off notification and see past broadcasts.
- **BANNER SETTINGS > Landing Page Management** and **Promotional Banners:** the banners on the customer site.
- **PAGES & SOCIAL MEDIA:** edit the About Us, Terms & Conditions, Privacy Policy, Support, Refund Policy, Shipping Policy and Cancellation Policy pages.

---

## 21. Sub-admins and roles

There are two kinds of admin:

- **Super admin:** can see and do everything.
- **Sub-admin:** sees only the areas they have been given permission for. The system checks these permissions on every action, not just in the menu.

**Create a sub-admin.** Where: **ADMIN ACCESS > Sub Admin List** (super admins only; shown when "Admin Access Section" is on)

1. Enter the **Name**, **Email**, **Phone** and **Password**, then click **Create Sub Admin**. The email must not already be in use.
2. A new sub-admin starts with **no permissions**. Click **Permissions** on their row. For each area, tick the actions they may do: view, create, edit, delete or export.
3. Use **Disable** / **Enable** to block or restore their access, and **Delete** to remove them.

**Areas you can give a sub-admin:**

| Area | What it covers |
|---|---|
| Dashboard | The dashboard |
| Point of sale | Point of Sale |
| Product management | Product Approval, Products, Categories, Attributes & Sets |
| Seller management | Zone Setup, Sellers |
| Order management | Orders, Order Detect Delivery, Courier Shipments, Returns, NDR Queue, RTO Queue, Checkouts |
| Promotions management | Coupons, Spin Wheel, Push Campaigns, first-order guard |
| Referral rewards | Referral Settings |
| Customer management | Customers, Support Tickets |
| Delivery management | the DELIVERY MANAGEMENT section |
| Support management | User Feedback, Safety Emergency Reports |
| Report management | all REPORT MANAGEMENT pages, Payment Reconciliation, COD Remittances |
| Transaction management | Seller Withdraws, Platform Coins |
| Banner management | BANNER SETTINGS |
| Pages & social media | PAGES & SOCIAL MEDIA |

> **Only a super admin can use these areas.** They cannot be given to a sub-admin:
> - AI Settings, Conversations and AI Usage
> - Business Setup
> - Broadcast Notification
> - Feature Settings
> - Power Scanning
> - Sub Admin List

---

## 22. Known gaps

These are the places where the admin panel does less than you might expect:

- **No live chat inbox.** Use **Support Tickets (User & Seller)** for customer and seller issues.
- **First-order guard settings** live in **Push Campaigns > Settings**; the claims themselves (with a "Flagged only" filter and Release for cancelled orders) are under **Coins & Rewards > First-order Claims**.
- **Low stock** for the current panel's channel is under **Catalog Management > Low Stock**; stock at or below its alert also shows in red in **Seller Products List**.
- **The courier can't be chosen in the panel.** Shiprocket versus the mock courier is decided by the server setup (section 8). Courier tracking refreshes automatically every 30 minutes.
- **Theme colour** is under **Super Powers > Power Scanning**, not Business Setup; Super Powers is available to super admins.
