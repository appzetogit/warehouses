# Desktop storefront theme

The layout follows the familiar big-marketplace pattern (navy header, search-first, card grid), and all the branding is ours.
Applies at `lg` (≥1024px) and up. **Mobile layouts must not change**: put every change behind `lg:` classes or a desktop-only component.
Covers both storefronts: Shop at `/` and Quick at `/quick` (`useStoreMode()`).

## Brand
- Name: **The Warehouses**. It comes from config (`APP_CONFIG.NAME` / `VITE_BRAND_NAME`, backend `BRAND_NAME`); never hardcode it.
- Logo for dark backgrounds: `/brand/logo-on-dark.png` (384×168, transparent, white text). Show it at 40px tall in the header and 36px in the footer.
  Wherever a logo is expected, use the Business Settings logo if one is uploaded, otherwise this file.

## Tokens (CSS variables on `:root`, plus a Tailwind `theme.extend` alias `wh-*`)
| Token | Value | Use |
|---|---|---|
| `--wh-nav` | `#131921` | top header bar |
| `--wh-nav-2` | `#232F3E` | category bar, footer columns |
| `--wh-nav-3` | `#37475A` | footer "back to top" strip, nav hover |
| `--wh-brand` | `#FD920B` | brand orange: search button, active states, links on dark |
| `--wh-brand-600` | `#E07F00` | hover/pressed brand |
| `--wh-brand-ink` | `#B45309` | brand-coloured text/icons/links on white or light backgrounds (orange `#FD920B` text on white fails AA) |
| `--wh-brand-50` | `#FFF4E5` | light brand tint (selected rows, soft chips) |
| `--wh-cta` | `#FFD814` | primary CTA "Add to cart" (pill) |
| `--wh-cta-hover` | `#F7CA00` | |
| `--wh-cta-2` | `#FFA41C` | secondary CTA "Buy now" (pill) |
| `--wh-cta-2-hover` | `#FA8900` | |
| `--wh-page` | `#E3E6E6` | homepage background behind cards |
| `--wh-surface` | `#FFFFFF` | cards, product page |
| `--wh-text` | `#0F1111` | body text |
| `--wh-muted` | `#565959` | secondary text |
| `--wh-link` | `#2162A1` | links on white |
| `--wh-link-hover` | `#C7511F` | link hover |
| `--wh-deal` | `#CC0C39` | deal badge background (white text) |
| `--wh-success` | `#0B7B3C` | "In stock", delivery promise |
| `--wh-border` | `#D5D9D9` | card and input borders |
| `--wh-quick` | `#0B7B3C` | Quick badge / "10 min" accent |

- **Font:** Inter from Google Fonts (400, 500, 700), falling back to `Arial, sans-serif`. Base 14px, line-height 20px.
- **Type scale:** card title 21px/700; product title 24px/400, line-height 32px; price 28px/400 with a small superscript ₹; section title 21px/700; nav text 12–14px.
- **Radius:** inputs 8px; cards 8px on the homepage and 0 on the product page; CTAs are full pills (`9999px`).
- **Container:** max width 1500px, centred, 20px side padding. The homepage cards sit on `--wh-page`.

## Header (all desktop storefront pages, sticky)
1. **Top bar**, 60px, `--wh-nav`:
   - logo, linking to the current store's home;
   - "Deliver to {name} / {city pincode}", which opens the existing address or location picker;
   - search: a department `<select>` (categories) on a light grey tab, a white input with 8px corners, and a brand-orange square button with a magnifier. It takes all remaining width.
   - store switch pill: **Shop** | **Quick · 10 min**, active in brand orange;
   - "Hello, {name} / Account & Lists", with a hover menu for profile, orders, coins, wallet and sign out, or "Sign in" when logged out;
   - "Returns / & Orders";
   - cart icon with the count bubble in brand orange and "Cart" underneath (per-store cart).

   Text is white, and hovered items get a 1px white outline.
2. **Category bar**, 39px, `--wh-nav-2`: "☰ All" (opens a left drawer with every category and subcategory), then top categories, "Today's Deals", "Coins", "Spin & Win", "Sell on The Warehouses" (links to seller signup), "Help". 14px white, 1px outline on hover.

## Footer (desktop)
- A "Back to top" strip, 50px, `--wh-nav-3`, which scrolls to the top when clicked.
- Four link columns on `--wh-nav-2`:
  - Get to Know Us
  - Connect with Us (social links from Business Settings)
  - Make Money with Us (Sell, Become a delivery partner)
  - Let Us Help You (Your account, Returns, Help, policies from the Pages content)
- A bottom row on `--wh-nav`: the logo, the brand name, and copyright.

## Homepage (desktop)
- **Hero:** a full-width banner carousel from the existing hero banners, about 300px tall. The bottom of the image fades into `--wh-page`, and the first card row overlaps it by 250px, as on big marketplaces.
- **Card rows:** 4 cards per row (3 at 1024–1279px), on white with 20px padding and a 21px bold title. Each card is one of:
  - a 2×2 grid of category or subcategory tiles, each with an image and label;
  - one large deal image with a link;
  - "Continue shopping" / "Buy again" for signed-in users.

  Every card ends with a "See more" link in `--wh-link`.
- **Horizontal product carousels,** full width on white. Each has a title, a "See all" link and a scroll row of product tiles:
  - image on a light grey square;
  - a `--wh-deal` "{n}% off" badge;
  - a "Limited time deal" label in the deal colour;
  - the price.

  Use Deals, Recommended ("You may also like"), and Top picks in {category}.
- **Quick store (`/quick`):** the same structure, plus a thin green strip under the header: "Delivering to {area} in ~{eta} min", or an out-of-zone notice.

## Listing pages (category, search, store page) on desktop
- The left rail (240px) has filters: category tree, price range, brand, attributes, availability ("In stock"). With smart search, the removable chips sit above the results.
- Results bar: "1-24 of N results for '{q}'" and a Sort select.
- Result tiles in a grid of 4 or 5 columns:
  - image;
  - title clamped to 2 lines;
  - rating;
  - price and MRP struck through, with a % off badge;
  - delivery line in `--wh-success`: "Get it in 10 min" on Quick, or "Delivery by {date}" on Shop;
  - a pill "Add to cart" in `--wh-cta`.

## Product page (desktop)
- A breadcrumb, then three columns:
  1. **Gallery:** vertical thumbnails plus a large image.
  2. **Details:**
     - title (24px);
     - store link;
     - rating;
     - price block: -{n}% in deal red, a big price, and "M.R.P.: ~~₹x~~";
     - offer chips (coupons, coins usable);
     - variant selectors: swatches and sizes, with unavailable options greyed out;
     - "About this item" bullets.
  3. **Buy box:** a 1px `--wh-border` box, 8px corners, 18px padding, containing:
     - price;
     - delivery promise ("FREE delivery Tomorrow" / "Arrives in 10 min");
     - the "Deliver to" line;
     - stock line: "In stock" in `--wh-success`, or "Only N left" in red, or the other-store link from the channel work;
     - a quantity select;
     - **Add to cart** (a pill in `--wh-cta`) and **Buy now** (a pill in `--wh-cta-2`);
     - "Sold by {store}";
     - returns policy.
- Below the columns:
  - "Frequently bought together" and "You may also like" rails (already built as RecommendationRail; restyle them);
  - specifications;
  - reviews.

## Cart (desktop)
- Two columns:
  - **Left:** a white card, "Shopping Cart", with lines grouped by store. Each line has a 180px image, title, the green stock line, a quantity stepper, and "Delete" / "Save for later" links.
  - **Right:** a subtotal card with "Proceed to Buy" (a pill in `--wh-cta`) and the existing coins toggle and checkout quote, plus a "You may also like" rail.

## Rules
- Reuse the existing data hooks, contexts, APIs and business logic. This is a visual and layout change. Do not change API calls, pricing, cart or channel logic, except to show data that already exists.
- Build new desktop pieces as components under `Frontend/src/modules/Store/components/user/desktop/`.
- Accessibility:
  - visible focus rings (2px `--wh-brand` outline);
  - text contrast of at least 4.5:1 (white on navy is fine; don't put white text on `--wh-cta`);
  - buttons and links are real `<button>` and `<a>` elements;
  - images have alt text.
- Do not copy anyone's logos, images, icons or wording. Build our own. The "Amazon-like" part is only the general layout pattern and this palette.
