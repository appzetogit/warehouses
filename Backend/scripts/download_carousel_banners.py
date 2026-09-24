import os
import urllib.request
from PIL import Image, ImageEnhance

OUT_DIR = "/var/www/warehouses-uploads/quick/fashion/banners"
os.makedirs(OUT_DIR, exist_ok=True)

BANNERS = {
    # 1. Couple in denim and orange / stylish look
    "banner-1-fashion-in-minutes.webp": "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=1400&q=95",
    # 2. Modern city streetwear / local store trends
    "banner-2-local-stores.webp": "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=95",
    # 3. Festive & ethnic vibrant royal fashion
    "banner-3-festive-ethnic.webp": "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1400&q=95",
    # 4. Trendy sneakers & street kicks
    "banner-4-sneakers-streetwear.webp": "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=1400&q=95"
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for fname, url in BANNERS.items():
    dest = os.path.join(OUT_DIR, fname)
    tmp = f"/tmp/{fname}"
    print(f"Downloading {fname}...")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp, open(tmp, 'wb') as f:
        f.write(resp.read())
        
    im = Image.open(tmp).convert("RGB")
    W, H = im.size
    
    # Target aspect ratio: 2.5 : 1 (e.g. 1250x500)
    target_ratio = 2.5
    current_ratio = W / H
    if current_ratio > target_ratio:
        new_w = int(H * target_ratio)
        offset = (W - new_w) // 2
        im = im.crop((offset, 0, offset + new_w, H))
    else:
        new_h = int(W / target_ratio)
        offset = (H - new_h) // 2
        im = im.crop((0, offset, W, offset + new_h))
        
    im = im.resize((1250, 500), Image.Resampling.LANCZOS)
    enh = ImageEnhance.Sharpness(im)
    im = enh.enhance(1.15)
    im.save(dest, "WEBP", quality=95, method=6)
    print(f"✓ Saved {dest} (1250x500)")

print("All carousel banners downloaded successfully!")
