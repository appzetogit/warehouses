import os
import urllib.request
from PIL import Image, ImageEnhance

OUT_DIR = "/var/www/warehouses-uploads/quick/fashion/collections"
os.makedirs(OUT_DIR, exist_ok=True)

COLLECTIONS = {
    # 1. Festive Wear: Regal Indian festive ethnic kurta
    "festive.webp": "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=95",
    # 2. Casual Wear: Relaxed trendy stylish casual outfit
    "casual.webp": "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=900&q=95",
    # 3. Winter Wear: Stylish cozy black puffer jacket
    "winter.webp": "https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=900&q=95",
    # 4. Active Wear: Athletic gym sportswear
    "active.webp": "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=95",
    # 5. Footwear: Pristine modern athletic sneakers
    "footwear.webp": "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=900&q=95"
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for fname, url in COLLECTIONS.items():
    dest = os.path.join(OUT_DIR, fname)
    tmp = f"/tmp/{fname}"
    print(f"Downloading {fname}...")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp, open(tmp, 'wb') as f:
        f.write(resp.read())
        
    im = Image.open(tmp).convert("RGB")
    W, H = im.size
    
    # 4:5 aspect ratio (e.g. 600x750)
    target_ratio = 4.0 / 5.0
    current_ratio = W / H
    if current_ratio > target_ratio:
        new_w = int(H * target_ratio)
        offset = (W - new_w) // 2
        im = im.crop((offset, 0, offset + new_w, H))
    else:
        new_h = int(W / target_ratio)
        offset = (H - new_h) // 2
        im = im.crop((0, offset, W, offset + new_h))
        
    im = im.resize((600, 750), Image.Resampling.LANCZOS)
    enh = ImageEnhance.Sharpness(im)
    im = enh.enhance(1.2)
    im.save(dest, "WEBP", quality=95, method=6)
    print(f"✓ Saved {dest} (600x750)")

print("All popular collection images downloaded successfully!")
