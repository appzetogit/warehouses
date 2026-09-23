# Storefront UI rebuild, modelled on rikocraft.com

Measured from https://www.rikocraft.com on 2026-09-23 at 375×812 and 1440×900.
RikoCraft is our own company's site, so its layout, motion **and its images**
carry over. It is built with Tailwind, same as this app, so the classes below
transfer almost literally.

Goal: the phone gets a storefront that feels designed for a phone — snap-scrolling
rails, cards sized to the viewport, a bottom bar — instead of a desktop grid
squeezed into 375px.

## 1. What the reference actually does

| Piece | Measurement (at 375px) |
|---|---|
| Header | sticky, `#220510`, 121px total: brand row ~56px + search row ~60px |
| Brand row | hamburger left, centred wordmark, cart right |
| Search | white `rounded-full` pill, full width, magnifier left, submit right |
| Bottom nav | fixed, `#581221`, 57px, `border-t border-amber-500/20`, `md:hidden`, 4 items |
| Page background | `#FAF4EA` (warm cream), text `#111827` |
| Fonts | Inter (body), Cormorant Garamond / Playfair Display (display) |
| Section rhythm | `py-5 md:py-12`, `py-6 md:py-10 lg:py-12` |
| Product rail | `grid grid-rows-2 grid-flow-col auto-cols-[46vw] overflow-x-auto gap-3 pb-4 scrollbar-none snap-x snap-mandatory` |
| Product card | 173×347, radius 16, white, no shadow |
| Card image | `aspect-[4/5] w-full object-cover rounded-t-2xl` on `bg-gray-100` |
| Card body | `p-1.5 sm:p-2.5 flex flex-col justify-between flex-1 bg-white space-y-1` |
| Add to cart | 159×30, `rounded-full`, `0.8px solid #0F172A`, 12px/500 |
| Keyframes in use | `fadeIn`, `slideUp`, `pulse`, `marquee` |

Two details do the heavy lifting on mobile, and neither exists in our app today:

1. **`auto-cols-[46vw]` two-row snap rails.** Cards are sized against the
   viewport, so exactly two fit with a sliver of the next one showing — the cue
   that invites a swipe. Two rows per rail doubles the products per screen.
2. **A bottom tab bar.** Home / Shop / Cart / Account, always reachable, so the
   header does not have to carry navigation on a phone.

### Section order on the home page
Hero carousel → trust strip (4 badges) → marquee ticker → Our Collections →
dark gradient band ("Crafted for Moments That Matter") → Featured Products →
Customer Favourites → Most Loved → "Sell on …" banner → Our Story.

Every section heading is centred: serif display type wrapped in em dashes
("— Our Collections —"), a one-line subtitle, then a short gold divider.

## 2. Decisions to make before I start

- **Palette.** Theirs is maroon and cream; ours is navy and orange
  (DESKTOP_THEME.md). The plan keeps our brand tokens and copies only the
  structure, spacing and motion. Say the word and I switch the tokens to the
  warm palette instead — it is a one-file change if the components read tokens.
- **Bottom nav.** We removed the old food-app one. This brings it back in the
  reference's style: Home / Shop / Cart / Account, phone only.
- **Assets.** Their product photos and hero banners come from
  `api.rikocraft.com/api/uploads/**`; 9 homepage images are Unsplash hotlinks
  that should become local copies. Nothing there is video — the homepage has no
  `<video>` element. I will check the inner pages during Phase 6.

## 3. Phases

**Phase 1 — Foundation.** Add the display font and the section rhythm to
`global.css`; build `SectionHeading` (em dashes, subtitle, divider) and a
`Rail` primitive (the two-row snap grid, with its scroll-progress bar).
*Touches:* `shared/styles/global.css`, new `components/user/storefront/`.

**Phase 2 — Header and bottom nav.** Split `DesktopHeader` into a brand row and
a search row on phones, keeping today's single row from `lg`. Rebuild the
bottom nav as a phone-only fixed bar, and give `main` the padding to clear it.
*Touches:* `DesktopHeader.jsx`, new `BottomNav.jsx`, `UserLayout.jsx`.

**Phase 3 — Home sections.** Recompose `DesktopHome` into the order above:
inset rounded hero with arrows and dots, 4-up trust strip, marquee, collection
tiles with the gradient overlay and "Explore →", the dark band, then the three
product rails.
*Touches:* `DesktopHome.jsx`, `HeroCarousel.jsx`, `HomeCard.jsx`, new section
components.

**Phase 4 — Product card and rails.** One card component at the reference's
proportions (4:5 image, uppercase name, struck MRP, bold price, green % OFF
pill, stars, full-width outlined "Add to cart"), used by the home rails, the
category grid and search. The Quick card keeps its 10-minute chip and ADD
stepper but adopts the same shell.
*Touches:* `ListingDesktop.jsx`, `quick/QuickProductCard.jsx`, new `ProductCard.jsx`.

**Phase 5 — Motion.** `fadeIn` / `slideUp` on section entry via
IntersectionObserver, the marquee, momentum-friendly snap scrolling, the
scroll-to-top button, and `prefers-reduced-motion` honoured throughout. Update
the skeletons from this session so they match the new shapes.
*Touches:* `global.css`, `HomeSkeletons.jsx`, section components.

**Phase 6 — Assets.** Mirror `api.rikocraft.com/api/uploads/{hero-carousel,products}`
and `www.rikocraft.com/images/categories` into
`/var/www/warehouses-uploads/riko/**`, convert to WebP at ~1000px, and point
the seed data at the local paths. A script under `Backend/scripts/` so it is
repeatable, and the Unsplash hotlinks localised at the same time.

**Phase 7 — QA.** Walk home, category, search, product, cart and Quick at 360,
375, 414, 768, 1024 and 1440, checking no horizontal scroll, no layout shift as
images load, tap targets ≥44px, and the bottom bar never covering a CTA. Then
deploy and re-check on the live domain.

## 4. Rules

- Reuse the existing data hooks, cart context and channel logic; this is layout
  and motion only. No pricing or checkout changes.
- One responsive tree, as now — no second phone-only component set.
- Every new component reads brand tokens, never hardcoded hex, so the palette
  decision stays a one-file change.
- `npm run check` and the backend tests stay green; deploy per phase so you can
  see each step rather than one large drop.
