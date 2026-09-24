import os
import urllib.request
from PIL import Image, ImageEnhance, ImageOps

OUT_DIR = "/var/www/warehouses-uploads/quick/fashion"

os.makedirs(f"{OUT_DIR}/categories", exist_ok=True)
os.makedirs(f"{OUT_DIR}/products", exist_ok=True)

# Pristine, ultra-high-resolution studio e-commerce and portrait photography (NO text, NO cutoffs, 100% clean)
IMAGE_SOURCES = {
    # 1. Categories
    # Men: Handsome man with sunglasses & blue denim jacket
    "categories/men.webp": {
        "url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=800&q=95",
        "aspect": (62, 76),
        "is_product": False
    },
    # Women: Pretty smiling brunette woman in casual pink t-shirt
    "categories/women.webp": {
        "url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=95",
        "aspect": (62, 76),
        "is_product": False
    },
    # Kids: Cool boy with backwards cap & grey hoodie
    "categories/kids.webp": {
        "url": "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=800&q=95",
        "aspect": (62, 76),
        "is_product": False
    },
    # T-Shirts: Stack of neatly folded t-shirts
    "categories/tshirts.webp": {
        "url": "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=95",
        "aspect": (62, 76),
        "is_product": False
    },
    # Jeans: Stack of folded blue denim jeans
    "categories/jeans.webp": {
        "url": "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=95",
        "aspect": (62, 76),
        "is_product": False
    },
    # Footwear: Crisp white low-top sneakers
    "categories/footwear.webp": {
        "url": "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=95",
        "aspect": (62, 76),
        "is_product": False
    },
    # Accessories: Black leather shoes / watch
    "categories/accessories.webp": {
        "url": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=95",
        "aspect": (62, 76),
        "is_product": False
    },

    # 2. Trending Products (Pure white background, pristine studio flat lays, ZERO text)
    # Polo: Beige/tan collared polo shirt flat lay on pure white
    "products/polo.webp": {
        "url": "https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?auto=format&fit=crop&w=900&q=95",
        "aspect": (1, 1),
        "is_product": True
    },
    # Oversized: Black vintage streetwear graphic rock t-shirt on pure white
    "products/oversized.webp": {
        "url": "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=95",
        "aspect": (1, 1),
        "is_product": True
    },
    # Jeans: Light-blue wash denim straight regular fit jeans flat lay on pure white
    "products/jeans.webp": {
        "url": "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=95",
        "aspect": (1, 1),
        "is_product": True
    },
    # Sneakers: White low-top sneakers on pure white
    "products/sneakers.webp": {
        "url": "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=900&q=95",
        "aspect": (1, 1),
        "is_product": True
    }
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for dest_rel, info in IMAGE_SOURCES.items():
    dest_path = os.path.join(OUT_DIR, dest_rel)
    tmp_path = f"/tmp/{os.path.basename(dest_rel)}"
    
    print(f"Downloading {dest_rel}...")
    req = urllib.request.Request(info["url"], headers=headers)
    with urllib.request.urlopen(req) as resp, open(tmp_path, 'wb') as f:
        f.write(resp.read())
        
    # Open and process to high-definition WebP
    im = Image.open(tmp_path).convert("RGB")
    W, H = im.size
    
    aw, ah = info["aspect"]
    target_ratio = aw / ah
    current_ratio = W / H
    
    if current_ratio > target_ratio:
        # Image is wider than target: crop width
        new_w = int(H * target_ratio)
        offset = (W - new_w) // 2
        im = im.crop((offset, 0, offset + new_w, H))
    else:
        # Image is taller than target: crop height
        new_h = int(W / target_ratio)
        offset = (H - new_h) // 2
        im = im.crop((0, offset, W, offset + new_h))
        
    # Resize to standard high-res retina dimension (e.g. 600px wide)
    final_w = 600
    final_h = int(600 * (ah / aw))
    im = im.resize((final_w, final_h), Image.Resampling.LANCZOS)
    
    # Polish sharpness
    enh = ImageEnhance.Sharpness(im)
    im = enh.enhance(1.2)
    
    im.save(dest_path, "WEBP", quality=95, method=6)
    print(f"✓ Saved {dest_rel} ({final_w}x{final_h})")
    
print("All clean HD assets successfully deployed!")
