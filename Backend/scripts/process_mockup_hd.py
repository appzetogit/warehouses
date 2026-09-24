import os
from PIL import Image, ImageEnhance, ImageFilter

REF_PATH = "/tmp/ref.png"
OUT_DIR = "/var/www/warehouses-uploads/quick/fashion"

os.makedirs(f"{OUT_DIR}/banners", exist_ok=True)
os.makedirs(f"{OUT_DIR}/categories", exist_ok=True)
os.makedirs(f"{OUT_DIR}/products", exist_ok=True)
os.makedirs(f"{OUT_DIR}/stores", exist_ok=True)
os.makedirs(f"{OUT_DIR}/collections", exist_ok=True)

im = Image.open(REF_PATH).convert("RGB")
W, H = im.size
print(f"Source resolution: {W}x{H}")

def enhance_and_save(box, dest_rel, scale=4, contrast=1.12, sharpness=1.45):
    x1, y1, x2, y2 = box
    cropped = im.crop((x1, y1, x2, y2))
    new_w = int((x2 - x1) * scale)
    new_h = int((y2 - y1) * scale)
    
    # 4x High quality Lanczos resize
    upscaled = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Contrast enhancement
    enh_con = ImageEnhance.Contrast(upscaled)
    upscaled = enh_con.enhance(contrast)
    
    # Color vibrancy
    enh_col = ImageEnhance.Color(upscaled)
    upscaled = enh_col.enhance(1.08)
    
    # Sharpness enhancement
    enh_sha = ImageEnhance.Sharpness(upscaled)
    upscaled = enh_sha.enhance(sharpness)
    
    # High-pass unsharp mask for crisp edges
    upscaled = upscaled.filter(ImageFilter.UnsharpMask(radius=2, percent=140, threshold=3))
        
    dest_path = os.path.join(OUT_DIR, dest_rel)
    upscaled.save(dest_path, "WEBP", quality=95, method=6)
    print(f"Saved {dest_rel}: {new_w}x{new_h}")

# 1. Hero Banner: Exact slice from reference
enhance_and_save((13, 148, 447, 320), "banners/hero-fashion-in-minutes.webp", scale=3, contrast=1.06, sharpness=1.35)

# 2. Categories: Slices with 4x super-resolution
enhance_and_save((16, 407, 78, 483), "categories/men.webp", scale=4)
enhance_and_save((84, 407, 146, 483), "categories/women.webp", scale=4)
enhance_and_save((151, 407, 213, 483), "categories/kids.webp", scale=4)
enhance_and_save((219, 407, 281, 483), "categories/tshirts.webp", scale=4)
enhance_and_save((285, 407, 347, 483), "categories/jeans.webp", scale=4)
enhance_and_save((352, 407, 414, 483), "categories/footwear.webp", scale=4)
enhance_and_save((419, 407, 460, 483), "categories/accessories.webp", scale=4)

# 3. Trending Products: Exact product image boxes with 4x super-resolution
# Product 1: Beige polo t-shirt
enhance_and_save((18, 546, 120, 638), "products/polo.webp", scale=4, contrast=1.1, sharpness=1.5)
# Product 2: Black oversized skull graphic t-shirt
enhance_and_save((129, 546, 230, 638), "products/oversized.webp", scale=4, contrast=1.15, sharpness=1.5)
# Product 3: Light blue regular jeans
enhance_and_save((239, 546, 340, 638), "products/jeans.webp", scale=4, contrast=1.1, sharpness=1.5)
# Product 4: White sneakers with black swoosh
enhance_and_save((349, 546, 450, 638), "products/sneakers.webp", scale=4, contrast=1.1, sharpness=1.5)

# 4. Stores
enhance_and_save((18, 744, 56, 782), "stores/trends.webp", scale=4)
enhance_and_save((138, 744, 176, 782), "stores/zudio.webp", scale=4)
enhance_and_save((250, 744, 288, 782), "stores/max.webp", scale=4)
enhance_and_save((355, 744, 393, 782), "stores/pantaloons.webp", scale=4)

# 5. Popular Collections
enhance_and_save((15, 828, 97, 910), "collections/festive.webp", scale=4)
enhance_and_save((102, 828, 184, 910), "collections/casual.webp", scale=4)
enhance_and_save((189, 828, 271, 910), "collections/winter.webp", scale=4)
enhance_and_save((277, 828, 359, 910), "collections/active.webp", scale=4)
enhance_and_save((364, 828, 446, 910), "collections/footwear.webp", scale=4)

print("All HD assets processed successfully!")
