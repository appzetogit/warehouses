# Apparel Catalogue Seeding Guide

This script (`Backend/scripts/seed-apparel.mjs`) seeds a believable apparel catalogue onto the Warehouses platform.

## What is Seeded
1. **Service Zone**: `Bengaluru Central` polygon covering central Bengaluru coordinates.
2. **Sellers (3 Stores)**:
   - **Urban Thread**: Approved for both Shop (courier) and Quick Commerce (local 10-min delivery).
   - **Kora Basics**: Approved for Shop.
   - **Vogue Craft**: Approved for Shop.
3. **Apparel Attribute Set**:
   - `Size`: `XS, S, M, L, XL, XXL` (chip selector).
   - `Colour`: `Black, White, Navy, Olive, Maroon, Beige, Charcoal, Rust` (with real hex swatches).
4. **Categories (2 levels)**:
   - `Men` → `T-Shirts`, `Shirts`, `Jeans`
   - `Women` → `Dresses`, `Kurtas`, `Tops`
   - `Activewear` → `Gym Tees & Tops`, `Track Pants & Joggers`
   - `Jackets` → `Bomber & Denim Jackets`, `Hoodies & Sweatshirts`
   - Linked to `Apparel` attribute set with standard platform commissions.
5. **Products & Variants**:
   - ~45 garments with full Size × Colour combinations, unique SKUs, per-channel stock counts, tags, GST rates, and bulleted fabric/fit/care descriptions.
   - Low-stock and out-of-stock items seeded to verify storefront badges and filters.
6. **Images**:
   - Curated commercial-use photos from Unsplash saved under `/var/www/warehouses-uploads/seed/`.
   - Referenced in MongoDB as `/uploads/seed/...`.
7. **Banners & Reviews**:
   - 4 Hero Banners and 3 Promotion Banners.
   - Verified buyer reviews with automated rating histogram recalculation.

## How to Run on the Server

```bash
cd /opt/warehouses/app/Backend
node scripts/seed-apparel.mjs
```

## How to Rollback / Wipe

Every seeded document is tagged with `seedTag: 'apparel-seed-v1'`. To remove only seeded documents without affecting existing data:

```bash
cd /opt/warehouses/app/Backend
node scripts/seed-apparel.mjs --wipe
```

To wipe the downloaded seed media assets as well:
```bash
node scripts/seed-apparel.mjs --wipe --wipe-images
```
