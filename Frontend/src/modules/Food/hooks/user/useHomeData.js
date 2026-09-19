import { useState, useCallback, useEffect, useMemo } from 'react';
import { sellerAPI } from "@food/api";
import { normalizeImageUrl, extractImages, calculateDistance, slugify } from "@food/utils/common";

export const useHomeData = (location, zoneId) => {
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [landingCategories, setLandingCategories] = useState([]);
  const [exploreMoreItems, setExploreMoreItems] = useState([]);
  const [exploreMoreHeading, setExploreMoreHeading] = useState("Explore More");
  
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [heroBannerImages, setHeroBannerImages] = useState([]);
  const [heroBannersData, setHeroBannersData] = useState([]);

  const [loadingSellers, setLoadingSellers] = useState(true);
  const [sellersData, setSellersData] = useState([]);
  const [recommendedSellers, setRecommendedSellers] = useState([]);
  
  const [menuCategories, setMenuCategories] = useState([]);
  const [loadingMenuCategories, setLoadingMenuCategories] = useState(false);
  const [sellerDietMeta, setSellerDietMeta] = useState({});

  // Old backend endpoints (hero banners / landing config) are not used anymore.
  // Keep UI stable by setting safe defaults once.
  const initLandingConfig = useCallback(() => {
    setLoadingConfig(true);
    setLandingCategories([]);
    setExploreMoreItems([]);
    setExploreMoreHeading("Explore More");
    setRecommendedSellers([]);
    setLoadingConfig(false);
  }, []);

  const initBanners = useCallback(() => {
    setLoadingBanners(true);
    setHeroBannersData([]);
    setHeroBannerImages([]);
    setLoadingBanners(false);
  }, []);

  const fetchSellers = useCallback(async (filters = {}) => {
    try {
      setLoadingSellers(true);
      const params = {
        _ts: Date.now(),
        ...(filters.sortBy && { sortBy: filters.sortBy }),
        ...(filters.cuisine && { cuisine: filters.cuisine }),
        ...(zoneId && { zoneId })
      };
      const res = await sellerAPI.getSellers(params);
      if (res.data?.success) {
        const raw = res.data.data.sellers || [];
        const userLat = location?.latitude;
        const userLng = location?.longitude;

        const transformed = raw.map(r => {
          const rLoc = r.location;
          const rLat = rLoc?.latitude || (rLoc?.coordinates?.[1]);
          const rLng = rLoc?.longitude || (rLoc?.coordinates?.[0]);
          
          let distInKm = calculateDistance(userLat, userLng, rLat, rLng);
          const coverImgs = extractImages(r.coverImages);
          const menuImgs = extractImages(r.menuImages);
          const profileImgs = extractImages(r.profileImage || r.image);
          const allImgs = Array.from(new Set([...coverImgs, ...menuImgs, ...profileImgs]));

          return {
            ...r,
            id: r.sellerId || r._id,
            mongoId: r._id,
            distanceInKm: distInKm,
            image: allImgs[0] || "",
            images: allImgs,
            rating: r.rating || 4.5,
            cuisine: r.cuisines?.[0] || "Multi-cuisine"
          };
        });
        setSellersData(transformed);
      }
    } finally {
      setLoadingSellers(false);
    }
  }, [location, zoneId]);

  const fetchMenuMeta = useCallback(async () => {
    if (!sellersData.length) return;
    setLoadingMenuCategories(true);
    try {
      const categoryMap = new Map();
      const dietMeta = {};

      const menuResponses = await Promise.all(
        sellersData.slice(0, 50).map(async (r) => {
          try {
            const res = await sellerAPI.getMenuBySellerId(r.id);
            return { id: r.id, menu: res?.data?.data?.menu };
          } catch {
            return { id: r.id, menu: null };
          }
        })
      );

      menuResponses.forEach(({ id, menu }) => {
        let hasVeg = false, hasNonVeg = false;
        const sections = menu?.sections || [];
        sections.forEach(s => {
          const items = s.items || [];
          items.forEach(i => {
            const type = String(i.foodType || "").toLowerCase();
            if (type === "veg") hasVeg = true;
            if (type.includes("non")) hasNonVeg = true;
          });
          const slug = slugify(s.name);
          if (slug && !categoryMap.has(slug)) {
            categoryMap.set(slug, {
              id: slug, name: s.name, slug, label: s.name,
              image: items[0]?.image ? normalizeImageUrl(items[0].image) : ""
            });
          }
        });
        dietMeta[id] = { hasVeg, hasNonVeg, isPureVeg: hasVeg && !hasNonVeg };
      });

      setMenuCategories(Array.from(categoryMap.values()));
      setSellerDietMeta(dietMeta);
    } finally {
      setLoadingMenuCategories(false);
    }
  }, [sellersData]);

  useEffect(() => {
    initLandingConfig();
    initBanners();
  }, [initLandingConfig, initBanners]);

  useEffect(() => {
    fetchSellers();
  }, [fetchSellers]);

  useEffect(() => {
    fetchMenuMeta();
  }, [fetchMenuMeta]);

  return {
    loadingConfig, landingCategories, exploreMoreItems, exploreMoreHeading, recommendedSellers,
    loadingBanners, heroBannerImages, heroBannersData,
    loadingSellers, sellersData, setSellersData,
    loadingMenuCategories, menuCategories, sellerDietMeta,
    fetchSellers
  };
};
