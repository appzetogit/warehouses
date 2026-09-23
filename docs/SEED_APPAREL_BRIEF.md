# Brief: seed apparel catalogue on the live server

Task for another agent (Antigravity). Goal: the live site at
https://warehouses.buytogetherindia.com shows a believable clothing catalogue —
t-shirts, shirts, jeans, dresses, kurtas, jackets, activewear — with real
photos served from this server, correct sizes and colours, and stock that can
actually be bought.

The site is live and shares a server with other projects. Read "Rules" before
touching anything.

## 1. Access

- SSH (from this Windows machine, key already authorised):
  `ssh -i C:\Users\ompar\.ssh\warehouses_deploy root@145.223.21.188`
- App: `/opt/warehouses/app` (git clone of `appzetogit/warehouses`, branch `main`)
- Backend env: `/opt/warehouses/app/Backend/.env` (read it; do not edit)
- Database credentials: `/opt/warehouses-secrets/mongo.env` (root-only)
- Database: `mongodb://wh_app:<MONGO_APP_PASS>@127.0.0.1:27027/warehouses?authSource=admin&replicaSet=rsWarehouses`
- Uploads folder served by nginx at `/uploads/`: `/var/www/warehouses-uploads/`
- Website files: `/var/www/warehouses` (built; don't edit by hand)
- Processes: pm2 `warehouses-api`, `warehouses-worker-*`

## 2. Rules (the server runs ~20 other projects)

- Touch only: `/opt/warehouses/**`, `/var/www/warehouses-uploads/**`, the
  `warehouses` database on port **27027**, and pm2 apps named `warehouses-*`.
- Never touch: other nginx sites, other pm2 apps, MongoDB on 27017/27018,
  Redis on 6379, `/etc/nginx/**`, system packages, `pm2 update`, `pm2 restart all`.
- Do not edit `Backend/.env`, do not rotate secrets, do not run migrations.
- Back up first: `mongodump --uri="<uri>" --out=/opt/warehouses/backups/$(date +%F-%H%M)`.
- Images: only pictures we are allowed to use (Unsplash/Pexels licence, or
  generated). No retailer photos, no brand logos, no celebrity images.
- Idempotent: re-running the seed must update, not duplicate. Tag everything
  you create with `seedTag: 'apparel-seed-v1'` (products, categories, sellers)
  and support `--wipe` to remove exactly what that tag covers.

## 3. Write a script, don't hand-insert

Add `Backend/scripts/seed-apparel.mjs` in the repo and run it on the server
with `node scripts/seed-apparel.mjs` from `/opt/warehouses/app/Backend`.

**Use the Mongoose models** (`src/modules/commerce/...`), not raw driver
inserts. The Product model computes `availableIn` in a pre-save hook; a raw
`insertOne` skips it and the product will never appear in any storefront.

Commit the script (and a short README note) to a branch and push. Do not commit
images.

## 4. What the data must satisfy

The storefront hides anything that breaks these rules — check each one.

**Sellers** (2–3 apparel stores, e.g. "Urban Thread", "Kora Basics"):
- `status: 'approved'`, `isActive: true`, `isAcceptingOrders: true`
- `channels.shop.status: 'approved'` (courier). Add
  `channels.quick.status: 'approved'` only for a seller that also has a zone
  and a location inside it; Quick is zone-bound.
- a pickup address with a valid 6-digit `pincode` (Shop needs it)
- `sellerName`, `ownerName` are required; add `profileImage` and a cover image

**Categories** (max 2 levels: parent → child):
- e.g. Men → T-Shirts, Shirts, Jeans; Women → Dresses, Kurtas, Tops; plus
  Activewear, Jackets
- `approvalStatus: 'approved'`, `isApproved: true`, `isActive: true`
- global (no `sellerId`) so every seller can use them
- give each clothing child category `attributeSetId` pointing at an
  "Apparel" attribute set, so the variant editor offers the right options
- `image` (a category tile photo), `commissionPercent` e.g. 8–12

**Attributes / attribute set** (`src/modules/commerce/admin/models`):
- Attribute "Size", chip type, values `XS,S,M,L,XL,XXL`
- Attribute "Colour", colour type, values with real hex codes
  (`Black:#000000`, `White:#FFFFFF`, `Navy:#1F2A44`, `Olive:#4B5320`, …)
- Attribute set "Apparel" containing both; link it to the clothing categories

**Products** (aim for 40–60 across the sellers):
- required: `sellerId`, `name`, `price`; also set `categoryId` + `categoryName`
- `approvalStatus: 'approved'`, `isActive: true`, `isAvailable: true`
- `channels: { shop: true, quick: <only if that seller is approved for quick> }`
- `mrp` above `price` (so the discount badge shows), `brand`, `packSize` where
  it makes sense, `gstRate` 5 (≤ ₹1000) or 12, `tags` for search
- `description`: 3–5 short lines (fabric, fit, care, origin) — the product page
  renders them as bullets
- `image` = first image, `images` = 3–5 photos of the same garment
- stock: `stock: { shop: 20–80, quick: null-or-number }`,
  `lowStockThreshold: { shop: 5 }`; leave a couple of items at 0 or 2 so the
  "Only N left" and out-of-stock states can be seen
- `maxQtyPerOrder: 10`
- **variants**: Size × Colour combinations (e.g. 4 sizes × 2–3 colours), each
  with `name` (e.g. "M / Navy"), `attributes: [{name:'Size',value:'M'},
  {name:'Colour',value:'Navy'}]`, `price`, `mrp`, `sku` (unique),
  `stock: { shop: n }`, `images` (photos of that colour), `isActive: true`,
  `channels: { quick: null, shop: null }` (null = inherit the product)
- no duplicate option combinations within a product (the API rejects them)
- a product's channels must be within its seller's approved channels

**Also seed, so the site doesn't look empty:**
- 3–5 hero banners (landing settings) and 2–3 promotional banners
- a few reviews on some products (delivered orders are required for real
  reviews; if that's too involved, skip reviews and say so)

## 5. Images

- Download to `/var/www/warehouses-uploads/seed/<category>/<product-slug>/<n>.webp`
- ~1000×1000 (or 1200×1600 portrait), WebP or JPEG, under ~250 KB each
- Reference them in the database as **relative URLs**: `/uploads/seed/men/tshirts/urban-tee-navy/1.webp`
  (relative works on any host; absolute `https://…` also works)
- `chmod 644` files, `755` folders; nginx serves them, so check one with
  `curl -I https://warehouses.buytogetherindia.com/uploads/seed/.../1.webp`
- Use distinct photos per colour where you can; the product page switches the
  gallery when a colour is chosen.

## 6. Verify (all must pass, from your machine)

```bash
B=https://warehouses.buytogetherindia.com
curl -s "$B/api/v1/catalog/products?limit=3&fulfilmentMode=standard" | head -c 400
curl -s "$B/api/v1/catalog/search/products?q=shirt&fulfilmentMode=standard" | head -c 300
curl -s "$B/api/v1/catalog/categories" | head -c 300
curl -I "$B/uploads/seed/<one real path>"
```
Then in a browser at 1440px wide: `/` shows category cards and product rows;
a category page lists garments with prices and delivery dates; a product page
shows the gallery, Size and Colour options with unavailable combinations
greyed out, and Add to cart; `/quick` shows only quick-eligible items.

Report: what was created (counts), image folder size, anything skipped, and the
exact command to re-run or undo (`--wipe`).

## 7. If something doesn't show up

- Product missing from a storefront → check `approvalStatus`, `isActive`,
  `channels`, `availableIn` (saved via the model, not raw insert), the seller's
  `status` and `channels`, and stock for that channel.
- Quick store empty → the seller needs an approved `quick` channel, a zone, and
  a location inside that zone; otherwise seed Shop only.
- Images 404 → wrong path under `/var/www/warehouses-uploads` or wrong URL
  prefix (must start `/uploads/`).
- Nothing at all → `pm2 logs warehouses-api --lines 50` (don't restart other apps;
  `pm2 restart warehouses-api` alone is fine).
