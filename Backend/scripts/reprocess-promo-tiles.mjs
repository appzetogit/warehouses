import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const QUICK_UPLOADS = '/var/www/warehouses-uploads/quick';

async function cropAndTransparent(inputPath, outputPath, width = 420, height = 420) {
    console.log(`Processing: ${inputPath} -> ${outputPath}`);
    const meta = await sharp(inputPath).metadata();
    const W = meta.width;
    const H = meta.height;

    // The products cluster in the bottom half of the image (typically Y: 0.35 to 0.95)
    // Extract the product region with some breathing room
    const cropTop = Math.round(H * 0.30);
    const cropHeight = Math.round(H * 0.68);
    const cropLeft = Math.round(W * 0.05);
    const cropWidth = Math.round(W * 0.90);

    const cropped = await sharp(inputPath)
        .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: Math.min(cropHeight, H - cropTop) })
        .toBuffer();

    // Now remove white / off-white background
    const { data, info } = await sharp(cropped)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const minVal = Math.min(r, g, b);

        // More aggressive white detection to remove all halos and faint boxes
        if (minVal >= 235) {
            data[i + 3] = 0;
        } else if (minVal >= 215) {
            const factor = (235 - minVal) / 20;
            data[i + 3] = Math.round(data[i + 3] * factor);
        }
    }

    // Save with transparent background, centered and filling 85% of 420x420
    await sharp(data, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 4,
        },
    })
        .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 92, alphaQuality: 100 })
        .toFile(outputPath);

    console.log(`✓ Saved tightly cropped promo tile: ${outputPath}`);
}

async function run() {
    const tiles = [
        { src: '/tmp/tile_all_1_1790232515128.jpg', dst: path.join(QUICK_UPLOADS, 'themes/all/tile-1.webp') },
        { src: '/tmp/tile_all_2_1790232550442.jpg', dst: path.join(QUICK_UPLOADS, 'themes/all/tile-2.webp') },
        { src: '/tmp/tile_all_3_1790232577827.jpg', dst: path.join(QUICK_UPLOADS, 'themes/all/tile-3.webp') },
        { src: '/tmp/tile_festive_1_1790232609827.jpg', dst: path.join(QUICK_UPLOADS, 'themes/festive/tile-1.webp') },
        { src: '/tmp/tile_festive_2_1790232644538.jpg', dst: path.join(QUICK_UPLOADS, 'themes/festive/tile-2.webp') },
        { src: '/tmp/tile_festive_3_1790232664823.jpg', dst: path.join(QUICK_UPLOADS, 'themes/festive/tile-3.webp') },
    ];

    for (const t of tiles) {
        try {
            await cropAndTransparent(t.src, t.dst);
        } catch (e) {
            console.error(`Error processing ${t.src}:`, e.message);
        }
    }
}

run().catch(console.error);
