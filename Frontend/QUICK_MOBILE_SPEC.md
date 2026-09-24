# Quick storefront on the phone, modelled on the Blinkit app

From two Blinkit screenshots (home, top and scrolled), 2026-09-24. The images
are 722px wide from a ~361dp screen, so every measurement below is the image
size halved. QUICK_UI_SPEC.md covers the desktop Quick layout; this is the phone.

Split of work: **Antigravity makes the art** (section 6 lists every file, size
and path). **This app builds the structure, data and motion**, and renders all
copy as live text over that art so it stays editable.

## 1. What is on the screen

**Header (not a coloured bar — it sits on the page's own background)**
- "Blinkit in" (14dp bold) over **"8 minutes"** (~27dp black weight), with a
  pill beside it: "1.1 km away" (12dp, tinted, with an icon).
- The address below: "HOME - 3/23, doorsanchar ▾" (15dp) — taps to change.
- Right: a wallet circle showing the balance ("₹0") and a profile circle.
- Search: white, 40dp tall, 12dp radius, magnifier, a placeholder that types
  itself (`Search "h…`), a divider and a mic.
- Tabs: a scrolling row of line icons (~22dp) over labels (13dp): All,
  Ganeshotsav, Electronics, Beauty, Gifting, Decor… The chosen one is bold with
  a 2dp underline.

**Once you scroll** (second screenshot) the ETA and address scroll away; the
search and the tabs stay pinned at the top.

**Themed block** — everything under the tabs, on a background illustration that
belongs to the chosen tab ("All" is a light doodle pattern):
- "POWERED BY:" and three round brand marks.
- Three promo tiles side by side (~106×102dp, 12dp radius): a title at the top
  ("Buy 2 Get 1 Free", "Everything Organic", "Minimum 35% OFF") and a cluster
  of product photos at the bottom.
- A rewards banner (50dp tall, 10dp radius): three round product photos
  overlapping on the left, "Win assured rewards / Shop for ₹249 or more to
  avail", a chevron.
- An offer strip: "Extra 5% OFF on first organic order above ₹249 →".

**Frequently bought** — tinted containers, each holding three product photos in
white tiles (~109dp) with the group's name under them ("Cakes & Biscuits"),
then a "See all products ▸" pill with overlapping thumbnails.

**Featured this week** — a rail of tall cards (~105×125dp) with a coloured
border, a "Featured" tab notched into the top edge, a title at the top and art
below. The first is styled differently: "NEWLY LAUNCHED", "✦ For You ✦".

**Campaign banner** — full width, ~340×172dp (2:1), 16dp radius: a headline,
a subtitle, "POWERED BY" marks, a white "Shop now" button, art on the right.

**Category groups** — "Grocery & Kitchen" and so on: a titled grid of square
tiles, four across, product photos on a light tint, the name below.

**Floating on top of the page**
- "Rate your order experience — Desi Tomato +6 more items" with a RATE button
  and ✕, shown after a delivered order that has no rating.
- Bottom nav (55dp): Home (filled, with an indicator line), Order Again,
  Categories, and two Blinkit-only items (Print, "district") we leave out.
  There is **no Cart tab** — the cart is a bar that floats above the nav.

## 2. What the backend already has, and what it lacks

| Needed | Status |
|---|---|
| ETA for the address | ✅ `GET /content/zones/detect` returns `etaMinutes` |
| "1.1 km away" | ✅ compute client-side: nearest quick seller to the address (`utils/geo`) |
| Wallet balance | ✅ coins / wallet APIs |
| Category tree for the groups | ✅ `GET /catalog/categories` (with `tree`) |
| Products for a tile/rail | ✅ `GET /catalog/search/products` — `q` matches tags, `brand`, `categoryId` |
| "Minimum 35% OFF" | ❌ search has no discount filter — add `minDiscount` |
| Frequently bought | ✅ `GET /orders` (signed in); guests get top categories instead |
| Rate the last order | ✅ `PATCH /orders/:id/ratings` |
| Campaign banners | ⚠️ `homePromotionBanner` exists but has no Quick/Shop channel |
| **Tabs with a theme, promo tiles, rewards banner, offer strip, featured cards** | ❌ nothing models these |

The one real gap is the themed layout. Hardcoding it would mean a code deploy
every time a festival starts, so it gets a content model the admin edits.

## 3. The new content model

`QuickHomeLayout` (one per zone, falling back to a global one):

```
themes[]        { slug, label, iconUrl, backgroundUrl, accent,
                  poweredBy[] { name, logoUrl },
                  promoTiles[] (3) { title, imageUrl, link },
                  rewards { title, subtitle, thumbs[] (3), link },
                  offerStrip { text, link },
                  startsAt, endsAt, sortOrder, isActive }
featured[]      { title, badge ("Featured" | "Newly launched"), style,
                  artUrl, link, sortOrder }
campaigns[]     { title, subtitle, artUrl, poweredBy[], ctaText, link,
                  startsAt, endsAt }
categoryGroups[] { title, parentCategoryId }   // "Grocery & Kitchen" → its children
```

- Public: `GET /content/quick-home?zoneId=` — only active items, dated items
  inside their window, cached like the other content reads.
- Admin: `/admin/quick/home-layout` — an editor per section with image
  upload, drag to reorder and date windows. Quick panel only.
- A link is a path the app already routes (`/quick/category/…`,
  `/quick/search?q=…&minDiscount=35`, `/quick/offers`), so a tile needs no code.
- Seeded with a sensible "All" theme so the page is never empty.

## 4. Phases

**Q1 — Header.** A phone-only Quick header on the page background: ETA with a
live dot, the distance pill, the address, wallet and profile circles; the
typing placeholder; the icon tabs with an underline that slides. On scroll the
ETA block collapses and search + tabs stay pinned. Desktop keeps today's header.
*Touches:* new `quick/QuickMobileHeader.jsx`, `UserLayout.jsx`.

**Q2 — Content model.** `QuickHomeLayout`, its public and admin routes, the
`minDiscount` search filter, tests, and the seed.
*Touches:* `Backend/src/modules/commerce/landing/**`, `search/**`, tests.

**Q3 — Themed block.** Background art per tab, cross-fading when the tab
changes; the powered-by row, promo tiles, rewards banner, offer strip.

**Q4 — The feed.** Frequently bought (orders → grouped by category; guests get
bestsellers), the "See all" pill, Featured this week, campaign banners, and the
category groups four across.

**Q5 — Navigation.** Quick's own bottom nav — Home, Order Again, Categories,
Account — with the cart as a floating bar above it; an Order Again page listing
past items with ADD; the rate-your-order nudge.

**Q6 — Motion and skeletons** (section 5), then a skeleton for every section.

**Q7 — Admin editor, QA and deploy.** 360 / 375 / 414 / 768, with and without
a signed-in customer, in zone and out of zone.

## 5. Liveness

- The ETA carries a pulsing dot; the number eases in when the address changes.
- The search placeholder types, pauses and deletes, cycling through real
  product names from the zone.
- The tab underline slides to the chosen tab; the themed block cross-fades its
  background and tiles instead of jumping.
- Promo tiles bob very slightly out of step with each other; their product
  cluster lifts on press.
- The rewards thumbnails shuffle every few seconds.
- The featured rail and the frequently-bought row drift on their own, pausing
  under a finger.
- Campaign art drifts slowly (Ken Burns) and a sheen crosses "Shop now".
- ADD turns into a stepper with a small bounce; the cart bar slides up and its
  count pops; a product thumbnail flies to it.
- The rate nudge slides up after a short delay and away when dismissed.
- Every one of these is off under `prefers-reduced-motion`, and nothing
  animates off screen.

## 6. Art for Antigravity

WebP, sRGB, no text baked in unless noted — the app renders titles and buttons
so they stay editable and sharp. Upload under
`/var/www/warehouses-uploads/quick/` (served at `/uploads/quick/`).

| File | Size | Notes |
|---|---|---|
| `themes/<slug>/bg.webp` | 1080×960 | Soft, low-contrast pattern or scene; top 200px calm (the header sits there) |
| `themes/<slug>/tile-1..3.webp` | 420×420, transparent | A cluster of 2–3 products, bottom-weighted |
| `themes/<slug>/rewards-1..3.webp` | 160×160 | One product each, centred for a round crop |
| `icons/<slug>.svg` | 48×48 | Line icon, 2px stroke, one colour (the app tints the active tab) |
| `featured/<slug>.webp` | 600×750 (4:5) | Art only; top 30% kept clear for the title |
| `campaigns/<slug>.webp` | 1360×680 (2:1) | Art on the right; left 55% kept clear for copy |
| `categories/<slug>.webp` | 400×400, transparent | Product cutout for a category tile |
| `brands/<slug>.webp` | 96×96 | Only for real partners; otherwise the row is hidden |

Slugs match the category or theme slugs. Start with the "All" theme, one
seasonal theme, four featured cards, two campaigns, and every grocery
subcategory — that fills the first screenful.

## 7. Decisions needed

1. **Header on /quick (phone):** Blinkit's ETA-first header on the page
   background (recommended — the ETA is the point of Quick), or keep the orange
   bar. Desktop is unaffected either way.
2. **Bottom nav on /quick:** Home / Order Again / Categories / Account with a
   floating cart bar (recommended, as Blinkit), or keep Shop's
   Home / Shop / Cart / Account.
3. **Brand partners:** leave "POWERED BY" hidden until there are real ones.
