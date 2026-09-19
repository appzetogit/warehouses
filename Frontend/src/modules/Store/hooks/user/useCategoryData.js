import { useState, useCallback, useEffect, useMemo } from 'react';
import { adminAPI, sellerAPI } from "@store/api";
import { productImages } from "@store/constants/images";
import { normalizeImageUrl } from "@store/utils/common";

export const useCategoryData = (zoneId) => {
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [sellersData, setSellersData] = useState([]);
  const [loadingSellers, setLoadingSellers] = useState(true);
  const [categoryKeywords, setCategoryKeywords] = useState({});

  const fetchCategories = useCallback(async () => {
    try {
      setLoadingCategories(true);
      const response = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {});
      if (response.data?.success) {
        const cats = response.data.data.categories || [];
        const transformed = [
          { id: 'all', name: "All", image: null, slug: 'all' },
          ...cats.map((cat) => ({
            id: cat.slug || cat._id,
            name: cat.name,
            image: cat.image || productImages[0],
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-'),
          }))
        ];
        setCategories(transformed);

        const keywordsMap = {};
        cats.forEach((cat) => {
          const id = cat.slug || cat._id;
          const name = cat.name.toLowerCase();
          const words = name.split(/[\s-]+/).filter(w => w.length > 0);
          keywordsMap[id] = [name, ...words];
        });
        setCategoryKeywords(keywordsMap);
      }
    } catch (err) {
      console.error("Failed to fetch categories", err);
    } finally {
      setLoadingCategories(false);
    }
  }, [zoneId]);

  const fetchSellers = useCallback(async () => {
    try {
      setLoadingSellers(true);
      const params = zoneId ? { zoneId } : {};
      const response = await sellerAPI.getSellers(params);
      if (response.data?.success) {
        const raw = response.data.data.sellers || [];
        const transformed = raw.map(r => ({
          ...r,
          id: r.sellerId || r._id,
          image: normalizeImageUrl(r.profileImage?.url || r.image),
          slug: r.slug || r.name?.toLowerCase().replace(/\s+/g, '-')
        }));
        setSellersData(transformed);
      }
    } catch (err) {
      console.error("Failed to fetch sellers", err);
    } finally {
      setLoadingSellers(false);
    }
  }, [zoneId]);

  useEffect(() => {
    fetchCategories();
    fetchSellers();
  }, [fetchCategories, fetchSellers]);

  return {
    categories, loadingCategories,
    sellersData, loadingSellers,
    categoryKeywords
  };
};
