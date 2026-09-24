import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSETS = [
  // Banners
  {
    url: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=1200&q=85',
    dest: 'banners/hero-fashion-in-minutes.webp'
  },
  // Categories
  {
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=85',
    dest: 'categories/men.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=85',
    dest: 'categories/women.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=500&q=85',
    dest: 'categories/kids.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=500&q=85',
    dest: 'categories/tshirts.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=500&q=85',
    dest: 'categories/jeans.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=500&q=85',
    dest: 'categories/footwear.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=85',
    dest: 'categories/accessories.webp'
  },
  // Products
  {
    url: 'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?auto=format&fit=crop&w=600&q=85',
    dest: 'products/polo.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=600&q=85',
    dest: 'products/oversized.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=85',
    dest: 'products/jeans.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=600&q=85',
    dest: 'products/sneakers.webp'
  },
  // Flash Deals
  {
    url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=600&q=85',
    dest: 'products/graphic-tee.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&w=600&q=85',
    dest: 'products/sliders.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=600&q=85',
    dest: 'products/shorts.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=600&q=85',
    dest: 'products/cap.webp'
  },
  // Collections
  {
    url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=85',
    dest: 'collections/festive.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=85',
    dest: 'collections/casual.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=600&q=85',
    dest: 'collections/winter.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=85',
    dest: 'collections/active.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=600&q=85',
    dest: 'collections/footwear.webp'
  },
  // Occasions
  {
    url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=600&q=85',
    dest: 'occasions/party.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=600&q=85',
    dest: 'occasions/college.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&w=600&q=85',
    dest: 'occasions/office.webp'
  },
  {
    url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=600&q=85',
    dest: 'occasions/vacation.webp'
  }
];

const targetBase = process.argv[2] || path.resolve(__dirname, '../../uploads/quick/fashion');

async function downloadAsset(item) {
  const fullPath = path.join(targetBase, item.dest);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  const res = await fetch(item.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${item.url}: ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);
  console.log(`Saved: ${item.dest} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log(`Downloading HD fashion assets to ${targetBase}...`);
  for (const item of ASSETS) {
    try {
      await downloadAsset(item);
    } catch (err) {
      console.error(`Error downloading ${item.dest}:`, err.message);
    }
  }
  console.log('All HD assets downloaded successfully!');
}

main();
