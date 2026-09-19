import { useState, useCallback, useEffect } from 'react';
import { sellerAPI } from "@food/api";

export const useUnder250Data = (zoneId) => {
  const [sellers, setSellers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [restRes] = await Promise.all([
        sellerAPI.getSellersUnder250(zoneId),
      ]);

      if (restRes.data?.success) setSellers(restRes.data.data.sellers || []);
      // Old backend endpoints (categories + under-250 banner) removed.
      setCategories([]);
      setBanner(null);
    } catch (err) {
      console.error("Failed to fetch Under 250 data", err);
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { sellers, categories, banner, loading };
};
