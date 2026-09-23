# Quick storefront (desktop): instant-delivery layout

The Quick store at `/quick` should read like an instant-delivery app: dense
product grids, a delivery-time chip on every card, one-tap ADD that turns into
a quantity stepper, and a slide-in cart. Measured from a live instant-delivery
site (blinkit.com, 1536px wide) on 2026-09-23; only the layout pattern is
borrowed. **All colours, fonts, logo and wording stay ours** (see
DESKTOP_THEME.md).

Applies at `lg` (≥1024px) on `/quick` routes only. Mobile is unchanged, and the
Shop store at `/` keeps its current desktop layout.

## Keep as they are
- The navy top bar and the orange category bar (`DesktopHeader.jsx`), the
  Shop | Quick switch, the footer, and the green zone strip under the header.
- Tokens from DESKTOP_THEME.md. The ADD control uses the brand, not green:
  border and text `--wh-brand-ink` (#B45309) on `--wh-brand-50` (#FFF4E5),
  hover fill `--wh-brand` with `--wh-text`. Reserve `--wh-success` for stock and
  delivery text.

## Measurements to match (from the reference)
| Piece | Value |
|---|---|
| Content width | 1280px centred (ours: keep 1500px max, 20px gutters) |
| Product card | 175×299px, radius 8px, 1px border `--wh-border`, white |
| Card image area | square, light grey `#F7F7F7`, product image `object-contain` |
| Card padding | 12px horizontal |
| Grid | 6 columns at ≥1400px, 5 at 1280–1399, 4 at 1024–1279; 12px gap |
| ADD button | 66×32px, radius 6px, 13px/600, outlined |
| Discount flag | top-left ribbon, 9px/800, white text on `--wh-deal` |
| Delivery chip | 9–11px/700 with a clock icon, e.g. "10 MINS" |
| Subcategory rail | ~90px wide, sticky, icon above a 12px label |

## `/quick` home
1. **Category tiles** — a grid of round-cornered tiles (image on a soft tint,
   label under), 8 per row at ≥1400px, 6 at 1280, 5 at 1024. From the real
   category tree; subcategories of the top parents.
2. **Promo banners** — the existing hero banners, in a 3-across row of wide
   cards under the tiles (keep the carousel if there are more than 3).
3. **Product rails** — horizontal rows using the new card: "Deals of the day",
   "Bestsellers in {category}", "You may also like" (existing recommendations),
   each with a "see all" link. Only render a rail with ≥4 products.
4. Out of zone: keep the existing notice, but still show the category tiles so
   the page isn't empty.

## `/quick` category and search pages
- Left **subcategory rail** (sticky, own scroll): the parent's children, the
  current one highlighted with a brand-tinted pill and a left bar.
- Right: heading, sort control, then the product grid above.
- Search keeps the filter rail it has today; only the tiles change.

## Product card (shared component)
Top to bottom: discount flag (when MRP > price), image, delivery chip
("{eta} MINS" from the zone), name (2 lines, clamped), pack size / unit,
then a row: price with struck-through MRP on the left, ADD on the right.
- **ADD → stepper**: after adding, the button becomes a `−  qty  +` pill of the
  same size, in brand colours. Decrementing to 0 restores ADD. The stepper
  updates the existing cart context; no page reload, no navigation.
- Out of stock: the button reads "Out of stock", disabled, and the card dims.
- Products with options (variants) open the product page instead of adding.
- The whole card except the button opens the product page.

## Cart
- A **slide-in cart panel** from the right on `/quick` (desktop), opened by the
  header cart button: line items with steppers, a bill summary, and "Proceed to
  checkout" going to the existing cart/checkout flow.
- A dismissible **bottom bar** appears when the quick cart has items and the
  panel is closed: "{n} items · ₹{total}" and "View cart".
- Both use the existing per-store cart context. No pricing or checkout logic
  changes.

## Rules
- Reuse existing data hooks, APIs, cart and channel logic; this is layout only.
- New components under `components/user/desktop/quick/`.
- Keyboard and screen-reader support: ADD and stepper are real buttons with
  labels ("Add {product} to cart", "Increase quantity"), the cart panel traps
  focus and closes on Escape, and focus rings stay visible.
- No layout shift when ADD becomes a stepper (same box size).
