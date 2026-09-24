async function check() {
  const url = "http://127.0.0.1:5030/api/v1/catalog/search/products?limit=50&fulfilmentMode=standard";
  console.log("Fetching:", url);
  const res = await fetch(url);
  const data = await res.json();
  const products = data.data?.products || [];
  console.log("Total products returned by /catalog/search/products:", products.length);
  const categories = [...new Set(products.map(p => p.categoryName))];
  console.log("Distinct Categories in Shop API:", categories);
  
  const electronics = products.filter(p => /power|bank|phone|case|speaker|audio|charger|gadget|smartwatch/i.test(p.name + " " + p.categoryName));
  console.log("Electronics in Shop API:", electronics.length);

  console.log("\nSample 8 products:");
  for (const p of products.slice(0, 8)) {
    console.log(`  - [${p.categoryName}] ${p.name} (₹${p.price}) -> ${p.image}`);
  }

  // Also check hero banners API
  const bannerRes = await fetch("http://127.0.0.1:5030/api/v1/content/hero-banners");
  const bannerData = await bannerRes.json();
  const banners = bannerData.data || bannerData || [];
  console.log("\nHero Banners in API:", Array.isArray(banners) ? banners.length : "object");
  if (Array.isArray(banners)) {
    for (const b of banners) {
      console.log(`  - Banner: "${b.title}" -> ${b.imageUrl || b.image}`);
    }
  }
}

check().catch(console.error);
