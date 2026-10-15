import { useNavigate } from "react-router-dom";
import { useStoreMode } from "@store/context/StoreModeContext"
import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
  startTransition,
} from "react";
import {
  captureHomeScrollBeforeLeave,
  clearHomeScrollState,
  peekHomePageSnapshot,
  peekHomeScrollState,
  stashHomePageSnapshot,
} from "@store/utils/homeScrollRestore";
import {
  getUserSellerDistance,
  normalizeSellerLocation,
} from "@store/utils/geo";

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

// Shared fallback images for categories without one
import { productImages } from "@store/constants/images";

import { useDeliveryLocation } from "@store/context/DeliveryLocationContext";
import { sellerAPI, adminAPI } from "@store/api";
import { usePublicAppConfig } from "@store/context/PublicAppConfigContext";
import { API_BASE_URL } from "@store/api/config";
import { getSellerAvailabilityStatus } from "@store/utils/sellerAvailability";
import OutOfZoneScreen from "@store/components/user/OutOfZoneScreen";
import DesktopHome from "@store/components/user/desktop/DesktopHome";

const getSellerDisplayName = (seller) => {
  const nameCandidates = [
    seller?.name,
    seller?.sellerName,
    seller?.sellerName?.english,
    seller?.sellerName?.value,
    seller?.onboarding?.step1?.sellerName,
  ];
  const resolvedName = nameCandidates.find(
    (candidate) =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return resolvedName ? resolvedName.trim() : "Seller";
};

export default function Home() {
  const { storePath, fulfilmentMode } = useStoreMode()
  const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api(\/v\d+)?\/?$/i, "");
  const navigate = useNavigate();
  const {
    heroBanners,
    refreshUserHome,
    refreshLanding,
  } = usePublicAppConfig();

  useEffect(() => {
    void refreshUserHome();
  }, [refreshUserHome]);

  const [heroBannersData, setHeroBannersData] = useState([]); // Store full banner data with linked sellers
  const homeRestoreBootRef = useRef(null);
  if (homeRestoreBootRef.current === null) {
    const pending =
      typeof window !== "undefined" ? peekHomeScrollState() : null;
    const snap =
      typeof window !== "undefined" ? peekHomePageSnapshot() : null;
    const targetCount = pending?.visibleCount || 0;
    const targetScrollY = pending?.scrollY || 0;
    // Restore whenever a locked/pending home position exists.
    // In-app seller back often PUSHes `/` (not POP).
    const canRestore = Boolean(
      pending && (targetScrollY > 0 || targetCount > 0),
    );

    homeRestoreBootRef.current = {
      canRestore,
      pending: canRestore ? pending : null,
      snap: canRestore ? snap : null,
      targetCount: Math.max(targetCount, 9),
      targetScrollY: canRestore ? targetScrollY : 0,
    };
  }
  const [sellersData, setSellersData] = useState(() => {
    const snap = homeRestoreBootRef.current?.snap?.sellersData;
    return Array.isArray(snap) && snap.length > 0 ? snap : [];
  });
  const [loadingSellers, setLoadingSellers] = useState(() => {
    const snap = homeRestoreBootRef.current?.snap?.sellersData;
    return !(Array.isArray(snap) && snap.length > 0);
  });
  const sellersDataRef = useRef(sellersData);
  const [realCategories, setRealCategories] = useState([]);
  const SELLERS_BATCH_SIZE = 9;
  const homeScrollRestoreRef = useRef(null);
  if (homeScrollRestoreRef.current === null) {
    const boot = homeRestoreBootRef.current;
    const hasWarmList =
      boot?.canRestore &&
      Array.isArray(boot?.snap?.sellersData) &&
      boot.snap.sellersData.length > 0;
    homeScrollRestoreRef.current = {
      active: Boolean(boot?.canRestore),
      targetCount: boot?.targetCount || SELLERS_BATCH_SIZE,
      targetScrollY: boot?.targetScrollY || 0,
      appliedVisible: false,
      scrollRestored: !(boot?.canRestore && boot?.targetScrollY > 0),
      settleKey: null,
      warmStart: hasWarmList,
      skipNextFetch: hasWarmList,
    };
  }
  const [visibleSellerCount, setVisibleSellerCount] = useState(() => {
    const restore = homeScrollRestoreRef.current;
    if (restore?.active && restore.targetCount > SELLERS_BATCH_SIZE) {
      return restore.targetCount;
    }
    return SELLERS_BATCH_SIZE;
  });
  const visibleSellerCountRef = useRef(visibleSellerCount);
  const homeUiStateRef = useRef({
    activeFilters: [],
    sortBy: null,
    sellersData: [],
  });
  const publicCategoriesCacheRef = useRef(new Map());
  const publicCategoriesInFlightRef = useRef(new Map());

  const normalizeImageUrl = useCallback(
    (imageUrl) => {
      if (typeof imageUrl !== "string") return "";
      const trimmed = imageUrl.trim();
      if (!trimmed) return "";
      if (/^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
        return trimmed;
      }
      const appProtocol =
        typeof window !== "undefined" ? window.location?.protocol : "";
      const appHost =
        typeof window !== "undefined" ? window.location?.hostname : "";
      let normalizedInput = trimmed
        .replace(/\\/g, "/")
        .replace(/^(https?):\/(?!\/)/i, "$1://")
        .replace(/^(https?:\/\/)(https?:\/\/)/i, "$1");

      if (/^\/\//.test(normalizedInput)) {
        normalizedInput = `${appProtocol || "https:"}${normalizedInput}`;
      }

      // WebView can fail on unescaped spaces/special chars; keep URLs safely encoded.
      if (/^(https?:)?\/\//i.test(normalizedInput)) {
        try {
          const parsed = new URL(normalizedInput, window.location.origin);

          // In mobile production, localhost/127.0.0.1 inside image URLs is unreachable.
          // Use BACKEND_ORIGIN (API server) for image host, not frontend hostuploads are served by the backend.
          if (
            appHost &&
            appHost !== "localhost" &&
            appHost !== "127.0.0.1" &&
            /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
          ) {
            try {
              const backendUrl = new URL(BACKEND_ORIGIN);
              parsed.protocol = backendUrl.protocol;
              parsed.hostname = backendUrl.hostname;
              parsed.port = backendUrl.port;
            } catch {
              parsed.protocol = window.location.protocol;
              parsed.hostname = window.location.hostname;
              if (window.location.port) parsed.port = window.location.port;
            }
          }

          // Prevent mixed-content image blocking in HTTPS WebView.
          if (appProtocol === "https:" && parsed.protocol === "http:") {
            parsed.protocol = "https:";
          }

          const finalUrl = parsed.toString();
          // Do not encode signed URLs (S3/Cloudfront/Cloudinary); encoding query params can break signatures.
          const hasSignedParams =
            /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(
              finalUrl,
            );
          return hasSignedParams ? finalUrl : encodeURI(finalUrl);
        } catch {
          return normalizedInput;
        }
      }

      if (normalizedInput.startsWith("/uploads/") || normalizedInput.startsWith("/categories/")) {
        return normalizedInput;
      }

      const absolutePath = normalizedInput.startsWith("/")
        ? `${BACKEND_ORIGIN}${normalizedInput}`
        : `${BACKEND_ORIGIN}/${normalizedInput.replace(/^\.?\/*/, "")}`;

      try {
        const parsed = new URL(absolutePath, window.location.origin);
        if (appProtocol === "https:" && parsed.protocol === "http:") {
          parsed.protocol = "https:";
        }
        const finalUrl = parsed.toString();
        const hasSignedParams =
          /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(
            finalUrl,
          );
        return hasSignedParams ? finalUrl : encodeURI(finalUrl);
      } catch {
        return absolutePath;
      }
    },
    [BACKEND_ORIGIN],
  );

  const extractImageFromValue = useCallback(
    (value) => {
      if (!value) return "";

      if (typeof value === "string") {
        return normalizeImageUrl(value);
      }

      if (typeof value === "object") {
        const candidate =
          value.url ||
          value.secure_url ||
          value.imageUrl ||
          value.imageURL ||
          value.image ||
          value.src ||
          value.path ||
          value.location ||
          value.link ||
          value.href ||
          "";
        return typeof candidate === "string"
          ? normalizeImageUrl(candidate)
          : "";
      }

      return "";
    },
    [normalizeImageUrl],
  );

  const buildSellerImageCandidates = useCallback(
    (value) => {
      const normalized = extractImageFromValue(value);
      if (!normalized) return [];

      // Mobile WebView safety: try deterministic JPEG first, then auto, then original.
      if (
        /res\.cloudinary\.com/i.test(normalized) &&
        /\/image\/upload\//i.test(normalized)
      ) {
        const hasTransform =
          /\/image\/upload\/(?:f_|q_|w_|h_|c_|dpr_|g_)/i.test(normalized);
        if (!hasTransform) {
          return Array.from(
            new Set([
              normalized.replace(
                "/image/upload/",
                "/image/upload/f_jpg,q_auto,w_1080/",
              ),
              normalized.replace(
                "/image/upload/",
                "/image/upload/f_auto,q_auto,w_1080/",
              ),
              normalized,
            ]),
          );
        }
      }

      return [normalized];
    },
    [extractImageFromValue],
  );

  const extractImages = useCallback(
    (source) => {
      if (!source) return [];

      const normalizedImages = (Array.isArray(source)
        ? source.flatMap((entry) => buildSellerImageCandidates(entry))
        : buildSellerImageCandidates(source)
      )
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean);

      // De-duplicate image urls while preserving order.
      return normalizedImages.filter(
        (value, index) => normalizedImages.indexOf(value) === index,
      );

    },
    [buildSellerImageCandidates],
  );

  useEffect(() => {
    visibleSellerCountRef.current = visibleSellerCount;
  }, [visibleSellerCount]);

  useEffect(() => {
    sellersDataRef.current = sellersData;
  }, [sellersData]);

  // Persist scroll + lazy-load batch so returning from a seller restores place.
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.history?.scrollRestoration) {
        window.history.scrollRestoration = "manual";
      }
    } catch {
      // ignore
    }

    const persist = () => {
      // Avoid clobbering a pending restore payload (e.g. React Strict Mode remount).
      if (homeScrollRestoreRef.current?.active && !homeScrollRestoreRef.current?.scrollRestored) {
        return;
      }
      const ui = homeUiStateRef.current;
      captureHomeScrollBeforeLeave(visibleSellerCountRef.current, {
        filters: {
          activeFilters: ui.activeFilters,
          sortBy: ui.sortBy,
        },
        lock: false,
      });
      if (ui.sellersData?.length) {
        stashHomePageSnapshot({ sellersData: ui.sellersData });
      }
    };

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        persist();
      }
    };

    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const captureScrollBeforeSellerNav = useCallback(() => {
    const ui = homeUiStateRef.current;
    captureHomeScrollBeforeLeave(visibleSellerCountRef.current, {
      filters: {
        activeFilters: ui.activeFilters,
        sortBy: ui.sortBy,
      },
      lock: true,
    });
    if (ui.sellersData?.length) {
      stashHomePageSnapshot({ sellersData: ui.sellersData });
    }
  }, []);


  // Hero banners from centralized public config
  useEffect(() => {
    if (!Array.isArray(heroBanners)) return;
    setHeroBannersData(heroBanners);
  }, [heroBanners]);

  // Filters restored with the saved home position (no filter UI on this page any more).
  const [activeFilters] = useState(() => {
    const list = homeRestoreBootRef.current?.pending?.filters?.activeFilters;
    return new Set(Array.isArray(list) ? list : []);
  });
  const [sortBy] = useState(
    () => homeRestoreBootRef.current?.pending?.filters?.sortBy ?? null,
  );
  const [appliedFilters] = useState(() => {
    const f = homeRestoreBootRef.current?.pending?.filters;
    return {
      activeFilters: new Set(Array.isArray(f?.activeFilters) ? f.activeFilters : []),
      sortBy: f?.sortBy ?? null,
    };
  });

  useEffect(() => {
    homeUiStateRef.current = {
      activeFilters: Array.from(activeFilters),
      sortBy,
      sellersData,
    };
  }, [activeFilters, sortBy, sellersData]);
  const {
    effectiveLocation,
    zoneId,
    zoneStatus,
    zoneLoading,
  } = useDeliveryLocation();

  // Landing settings (zone-specific) into the shared public config.
  useEffect(() => {
    void refreshLanding(zoneId).catch(() => {});
  }, [zoneId, refreshLanding]);

  // Fetch categories (zone-aware) for the homepage category rail.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const zoneKey = String(zoneId || "global")
      try {
        // Dedupe repeated calls (StrictMode + zone settling). Cache per zoneKey and share in-flight request.
        const cached = publicCategoriesCacheRef.current.get(zoneKey)
        if (cached) {
          if (!cancelled) setRealCategories(cached)
          return
        }

        const inFlight = publicCategoriesInFlightRef.current.get(zoneKey)
        if (inFlight) {
          const categories = await inFlight
          if (!cancelled) setRealCategories(categories)
          return
        }

        const promise = (async () => {
          const res = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {})
          const list =
            res?.data?.data?.categories ||
            res?.data?.categories ||
            []
          const categories = Array.isArray(list)
            ? list.map((cat, idx) => ({
                id: String(cat?.id || cat?._id || cat?.slug || idx),
                name: cat?.name || "",
                slug: cat?.slug || String(cat?.name || "").toLowerCase().replace(/\s+/g, "-"),
                image:
                  normalizeImageUrl(cat?.image || cat?.imageUrl) ||
                  productImages[idx % productImages.length] ||
                  productImages[0],
                type: cat?.type || "",
              }))
            : []

          publicCategoriesCacheRef.current.set(zoneKey, categories)
          return categories
        })()

        publicCategoriesInFlightRef.current.set(zoneKey, promise)
        const categories = await promise
        publicCategoriesInFlightRef.current.delete(zoneKey)

        if (!cancelled) setRealCategories(categories)
      } catch (err) {
        debugWarn("Failed to fetch categories:", err)
        if (!cancelled) setRealCategories([])
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [zoneId, normalizeImageUrl])


  const sellersRequestSeqRef = useRef(0);

  // Fetch sellers from API with filters
  const fetchSellers = useCallback(
    async (filters = {}) => {
      const requestSeq = ++sellersRequestSeqRef.current;
      try {
        const restore = homeScrollRestoreRef.current;
        const suppressLoading =
          restore?.active &&
          !restore?.scrollRestored &&
          (sellersDataRef.current?.length > 0);
        if (!suppressLoading) {
          setLoadingSellers(true);
        }

        // Backend disconnected - new backend in progress. Skip health check.

        // Build query parameters from filters
        const params = {};

        // Always send user coordinates when available so backend can compute distance/sort.
        if (
          Number.isFinite(effectiveLocation?.latitude) &&
          Number.isFinite(effectiveLocation?.longitude)
        ) {
          params.lat = effectiveLocation.latitude;
          params.lng = effectiveLocation.longitude;
        }

        // Sort by
        if (filters.sortBy) {
          params.sortBy = filters.sortBy;
        }

        // Rating filters
        if (filters.activeFilters?.has("rating-45-plus")) {
          params.minRating = 4.5;
        } else if (filters.activeFilters?.has("rating-4-plus")) {
          params.minRating = 4.0;
        } else if (filters.activeFilters?.has("rating-35-plus")) {
          params.minRating = 3.5;
        }

        // Delivery time filters
        if (filters.activeFilters?.has("delivery-under-30")) {
          params.maxDeliveryTime = 30;
        } else if (filters.activeFilters?.has("delivery-under-45")) {
          params.maxDeliveryTime = 45;
        }

        // Distance filters
        if (filters.activeFilters?.has("distance-under-1km")) {
          params.radiusKm = 1.0;
        } else if (filters.activeFilters?.has("distance-under-2km")) {
          params.radiusKm = 2.0;
        }

        // Price filters
        if (filters.activeFilters?.has("price-under-200")) {
          params.maxPrice = 200;
        } else if (filters.activeFilters?.has("price-under-500")) {
          params.maxPrice = 500;
        }

        // Offers filter
        if (filters.activeFilters?.has("has-offers")) {
          params.hasOffers = "true";
        }

        // Trust filters
        if (filters.activeFilters?.has("top-rated")) {
          params.topRated = "true";
        } else if (filters.activeFilters?.has("trusted")) {
          params.trusted = "true";
        }

        // Strict zone-only listing for user home.
        // If zone is not detected yet, don't fetch global sellers.
        if (!zoneId) {
          const keepWarmList =
            homeScrollRestoreRef.current?.active &&
            !homeScrollRestoreRef.current?.scrollRestored &&
            sellersDataRef.current?.length > 0;
          if (!keepWarmList) {
            setSellersData([]);
          }
          if (requestSeq === sellersRequestSeqRef.current) {
            setLoadingSellers(false);
          }
          return;
        }
        params.zoneId = zoneId;
        params.fulfilmentMode = fulfilmentMode;

        debugLog("Fetching sellers with params:", params);
        const response = await sellerAPI.getSellers(params);
        debugLog("Sellers API response:", response.data);

        // If a newer request started, ignore this response to avoid races/flicker.
        if (requestSeq !== sellersRequestSeqRef.current) return;

        if (
          response.data &&
          response.data.success &&
          response.data.data &&
          response.data.data.sellers
        ) {
          const sellersArray = response.data.data.sellers;
          debugLog(`Fetched ${sellersArray.length} sellers from API`);

          if (sellersArray.length === 0) {
            debugWarn("No sellers found in API response");
            const keepWarmList =
              homeScrollRestoreRef.current?.active &&
              !homeScrollRestoreRef.current?.scrollRestored &&
              sellersDataRef.current?.length > 0;
            if (!keepWarmList) {
              setSellersData([]);
            }
            return;
          }

          // Get user coordinates
          const userLat = effectiveLocation?.latitude;
          const userLng = effectiveLocation?.longitude;

          // Transform API data to match expected format
          const transformedSellers = sellersArray
            .filter((seller) => {
              const name = (seller.sellerName || seller.name || "").toLowerCase()
              return true
            })
            .map((seller, index) => {
              // Use seller data if available, otherwise use defaults
              const deliveryTime =
                seller.estimatedDeliveryTime || "25-30 mins";

              // Same Haversine + coordinate parsing as delivery new-order / cart fees.
              let distance = "—";
              let distanceInKm = null;

              const sellerLoc = normalizeSellerLocation(
                seller.location || seller,
              );
              const measured = getUserSellerDistance(
                effectiveLocation?.deliveryAddress || effectiveLocation,
                sellerLoc,
              );
              if (measured) {
                distanceInKm = measured.km;
                distance = measured.label;
              } else if (Number.isFinite(Number(seller.distanceInKm))) {
                distanceInKm = Number(seller.distanceInKm);
                distance =
                  distanceInKm >= 1
                    ? `${distanceInKm.toFixed(1)} km`
                    : `${Math.round(distanceInKm * 1000)} m`;
              }

              // Legacy-safe image extraction (supports old schema variants).
              const coverImages = extractImages([
                ...(Array.isArray(seller.coverImages) ? seller.coverImages : [seller.coverImages]).filter(Boolean),
                seller.coverImage,
              ]);

              const profileImageCandidates = extractImages([
                ...buildSellerImageCandidates(seller.profileImage),
                ...buildSellerImageCandidates(
                  seller.onboarding?.step2?.profileImageUrl,
                ),
                ...buildSellerImageCandidates(seller.image),
                ...buildSellerImageCandidates(seller.imageUrl),
              ]);
              const profileImageUrl = profileImageCandidates[0] || "";

              const allImages = Array.from(
                new Set(
                  [
                    ...coverImages,
                    ...profileImageCandidates,
                  ].filter(Boolean),
                ),
              );

              // Keep single image for backward compatibility
              const image = allImages[0] || profileImageUrl || "";
              const activeOffers = Array.isArray(seller.activeOffers)
                ? seller.activeOffers
                : [];
              const offerText = activeOffers[0]?.summary || seller.offer || null;

              return {
                id: seller.sellerId || seller._id,
                mongoId: seller._id || null,
                name: getSellerDisplayName(seller),
                rating: Number(seller.rating) || 0,
                deliveryTime:
                  seller.deliveryTime ||
                  seller.estimatedDeliveryTime ||
                  (seller.estimatedDeliveryTimeMinutes
                    ? `${seller.estimatedDeliveryTimeMinutes} mins`
                    : deliveryTime),
                distance: distance,
                distanceInKm: distanceInKm, // Store numeric distance for sorting
                image: image,
                images: allImages, // Array of cover images for carousel (separate from menu images)
                priceRange: seller.priceRange || "$$", // Use from API or default
                featuredDish: seller.featuredDish || "Special Item",
                featuredPrice: seller.featuredPrice || 249, // Use from API or default
                offer: offerText,
                activeOffers,
                offerCount:
                  Number(seller.offerCount) > 0
                    ? Number(seller.offerCount)
                    : activeOffers.length,
                slug: seller.slug,
                sellerId: seller.sellerId,
                location: sellerLoc || seller.location, // Normalized for distance recalculation
                isActive: seller.isActive !== false, // Default to true if not specified
                isAcceptingOrders: seller.isAcceptingOrders !== false, // Default to true if not specified
                openDays: Array.isArray(seller.openDays)
                  ? seller.openDays
                  : [],
                deliveryTimings: seller.deliveryTimings || null,
                outletTimings: seller.outletTimings || null,
                openingTime: seller.openingTime || seller?.deliveryTimings?.openingTime || null,
                closingTime: seller.closingTime || seller?.deliveryTimings?.closingTime || null,
                recommendedItems: Array.isArray(seller.recommendedItems) ? seller.recommendedItems : [],
              };
            },
          );

          const sortSellersForDisplay = (sellers) => {
            if (!userLat || !userLng) return sellers;
            return [...sellers].sort((a, b) => {
              // Available sellers first, then unavailable
              const aAvailable = getSellerAvailabilityStatus(a, new Date()).isOpen;
              const bAvailable = getSellerAvailabilityStatus(b, new Date()).isOpen;

              if (aAvailable !== bAvailable) {
                return aAvailable ? -1 : 1; // Available sellers come first
              }

              // Apply secondary sort based on sortBy filter
              if (filters.sortBy === "price-low") {
                return (a.featuredPrice || 0) - (b.featuredPrice || 0);
              }
              if (filters.sortBy === "price-high") {
                return (b.featuredPrice || 0) - (a.featuredPrice || 0);
              }
              if (filters.sortBy === "rating-high") {
                return (b.rating || 0) - (a.rating || 0);
              }
              if (filters.sortBy === "rating-low") {
                return (a.rating || 0) - (b.rating || 0);
              }

              // Default: sort by distance
              const aDistance =
                a.distanceInKm !== null ? a.distanceInKm : Infinity;
              const bDistance =
                b.distanceInKm !== null ? b.distanceInKm : Infinity;
              return aDistance - bDistance;
            });
          };

          debugLog(
            "Transformed and sorted sellers:",
            transformedSellers,
          );
          startTransition(() => {
            setSellersData(sortSellersForDisplay(transformedSellers));
          });

          const sellersNeedingOutletTimings = transformedSellers.filter(
            (seller) => seller.mongoId && !seller.outletTimings,
          );

          if (sellersNeedingOutletTimings.length > 0) {
            void (async () => {
              const resolvedOutletTimings = new Map();

              for (const seller of sellersNeedingOutletTimings) {
                try {
                  const outletResponse =
                    await sellerAPI.getOutletTimingsBySellerId(
                      seller.mongoId,
                      { noCache: true },
                    );
                  const outletTimings =
                    outletResponse?.data?.data?.outletTimings ||
                    outletResponse?.data?.outletTimings ||
                    null;

                  if (outletTimings) {
                    resolvedOutletTimings.set(seller.mongoId, outletTimings);
                  }
                } catch (_) {
                  // Keep the existing seller data if enrichment fails.
                }
              }

              if (
                requestSeq !== sellersRequestSeqRef.current ||
                resolvedOutletTimings.size === 0
              ) {
                return;
              }

              startTransition(() => {
                setSellersData((currentSellers) => {
                  let hasChanges = false;
                  const nextSellers = currentSellers.map((seller) => {
                    if (!seller.mongoId) return seller;
                    const outletTimings = resolvedOutletTimings.get(
                      seller.mongoId,
                    );
                    if (!outletTimings) return seller;
                    hasChanges = true;
                    return { ...seller, outletTimings };
                  });

                  return hasChanges
                    ? sortSellersForDisplay(nextSellers)
                    : currentSellers;
                });
              });
            })();
          }
        } else {
          debugWarn("Invalid API response structure:", response.data);
          const keepWarmList =
            homeScrollRestoreRef.current?.active &&
            !homeScrollRestoreRef.current?.scrollRestored &&
            sellersDataRef.current?.length > 0;
          if (!keepWarmList) {
            setSellersData([]);
          }
        }
      } catch (error) {
        debugError("Error fetching sellers:", error);
        debugError("Error details:", error.response?.data || error.message);
        // Don't set hardcoded data here - let the useMemo fallback handle it
        // This way, if API succeeds later, it will show the real data
        const keepWarmList =
          homeScrollRestoreRef.current?.active &&
          !homeScrollRestoreRef.current?.scrollRestored &&
          sellersDataRef.current?.length > 0;
        if (!keepWarmList) {
          setSellersData([]);
        }
      } finally {
        if (requestSeq === sellersRequestSeqRef.current) {
          setLoadingSellers(false);
        }
      }
    },
    [
      extractImages,
      buildSellerImageCandidates,
      effectiveLocation?.latitude,
      effectiveLocation?.longitude,
      zoneId,
      fulfilmentMode,
    ],
  );

  // Fetch sellers when appliedFilters change
  useEffect(() => {
    const restore = homeScrollRestoreRef.current;
    if (restore?.skipNextFetch) {
      restore.skipNextFetch = false;
      setLoadingSellers(false);
      return;
    }
    fetchSellers(appliedFilters);
  }, [appliedFilters, fetchSellers]);

  const filteredSellers = useMemo(() => {
    // Rely on API data which is already filtered and sorted by the backend.
    return sellersData || [];
  }, [sellersData]);

  const sellerLazyLoadResetKey = useMemo(() => {
    const activeFilterKey = Array.from(activeFilters).sort().join("|");
    return `${sellersData.length}:${activeFilterKey}:${sortBy || ""}`;
  }, [activeFilters, sellersData.length, sortBy]);

  const visibleSellers = useMemo(
    () => filteredSellers.slice(0, visibleSellerCount),
    [filteredSellers, visibleSellerCount],
  );

  useEffect(() => {
    const restore = homeScrollRestoreRef.current;

    // Hold restored batch until scroll restore finishes so async filter/veg
    // hydration cannot collapse the list mid-restore.
    if (restore.active && restore.targetCount > SELLERS_BATCH_SIZE) {
      if (!restore.scrollRestored) {
        if (filteredSellers.length > 0) {
          if (
            !restore.appliedVisible ||
            visibleSellerCountRef.current <
              Math.min(restore.targetCount, filteredSellers.length)
          ) {
            setVisibleSellerCount(
              Math.min(restore.targetCount, filteredSellers.length),
            );
            restore.appliedVisible = true;
          }
          // Track latest key while restoring so late veg/filter hydration
          // does not look like a user-driven change after settle.
          restore.settleKey = sellerLazyLoadResetKey;
        }
        return;
      }

      if (restore.settleKey === sellerLazyLoadResetKey) {
        return;
      }
      // User changed filters/sort after restore settled.
      restore.active = false;
      restore.targetCount = 0;
    }

    setVisibleSellerCount(
      Math.min(SELLERS_BATCH_SIZE, filteredSellers.length),
    );
  }, [sellerLazyLoadResetKey, filteredSellers.length, SELLERS_BATCH_SIZE]);

  useEffect(() => {
    if (visibleSellerCount <= filteredSellers.length) return;
    const restore = homeScrollRestoreRef.current;
    if (
      restore.active &&
      restore.targetCount > SELLERS_BATCH_SIZE &&
      filteredSellers.length === 0
    ) {
      return;
    }
    setVisibleSellerCount(filteredSellers.length);
  }, [filteredSellers.length, visibleSellerCount, SELLERS_BATCH_SIZE]);

  // Restore window scroll after sellers are painted with enough rows.
  useLayoutEffect(() => {
    const restore = homeScrollRestoreRef.current;
    if (!restore.active || restore.scrollRestored) return;
    if (restore.targetScrollY <= 0) {
      restore.scrollRestored = true;
      window.setTimeout(() => {
        clearHomeScrollState();
      }, 400);
      return;
    }

    // Jump immediately before paint so Home never flashes at the top.
    window.scrollTo(0, restore.targetScrollY);
    if (document.documentElement) {
      document.documentElement.scrollTop = restore.targetScrollY;
    }
    if (document.body) {
      document.body.scrollTop = restore.targetScrollY;
    }
  }, []);

  useEffect(() => {
    const restore = homeScrollRestoreRef.current;
    if (!restore.active || restore.scrollRestored) return;

    if (restore.targetScrollY <= 0) {
      restore.scrollRestored = true;
      window.setTimeout(() => {
        clearHomeScrollState();
      }, 400);
      return;
    }

    // Allow restore as soon as we have enough painted rows (warm snapshot),
    // even if a background refetch is still in flight.
    if (
      loadingSellers &&
      visibleSellers.length === 0
    ) {
      return;
    }
    if (
      restore.targetCount > SELLERS_BATCH_SIZE &&
      filteredSellers.length > 0 &&
      !restore.appliedVisible
    ) {
      return;
    }

    const targetY = restore.targetScrollY;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60;

    const finish = () => {
      restore.scrollRestored = true;
      // Short grace so React Strict Mode remount can still peek pending state.
      window.setTimeout(() => {
        clearHomeScrollState();
      }, 400);
    };

    const tryRestore = () => {
      if (cancelled) return;
      attempts += 1;
      const docHeight = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
      );
      const viewport = window.innerHeight || 0;
      const canReach = docHeight >= targetY + Math.min(80, viewport * 0.2);

      window.scrollTo(0, targetY);
      if (document.documentElement) document.documentElement.scrollTop = targetY;
      if (document.body) document.body.scrollTop = targetY;

      const currentY =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement?.scrollTop ||
        0;
      const closeEnough = Math.abs(currentY - targetY) < 12;

      if ((canReach && closeEnough) || attempts >= maxAttempts) {
        finish();
        return;
      }

      window.setTimeout(() => {
        requestAnimationFrame(tryRestore);
      }, 40);
    };

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(tryRestore);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    loadingSellers,
    visibleSellers.length,
    filteredSellers.length,
    SELLERS_BATCH_SIZE,
  ]);

  const shouldShowOutOfZoneScreen = useMemo(() => {
    const hasCoords =
      Number.isFinite(Number(effectiveLocation?.latitude)) &&
      Number.isFinite(Number(effectiveLocation?.longitude));
    // Zones only limit Quick (rider) delivery; the Shop store ships anywhere.
    return fulfilmentMode === "quick" && hasCoords && zoneStatus === "OUT_OF_SERVICE" && !zoneLoading;
  }, [fulfilmentMode, effectiveLocation?.latitude, effectiveLocation?.longitude, zoneStatus, zoneLoading]);


  if (shouldShowOutOfZoneScreen) {
    return <OutOfZoneScreen location={effectiveLocation} />;
  }

  // The card-grid homepage, at every width, for Shop and Quick alike
  // (DesktopHome / MobileHome switch their sections on the store mode).
  return (
    <div>
      <DesktopHome
        heroBanners={heroBannersData}
        categories={realCategories}
        zoneId={zoneId}
        onOpenBanner={(banner) => {
          const first = banner?.linkedSellers?.[0];
          const sellerSlug = first?.slug || first?.sellerId || first?._id;
          if (!sellerSlug) return;
          captureScrollBeforeSellerNav();
          navigate(storePath(`/sellers/${sellerSlug}`));
        }}
      />
    </div>
  );
}
