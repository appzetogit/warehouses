import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import apiClient, { authAPI, userAPI } from "@store/api"
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const ProfileContext = createContext(null)
const USER_SESSION_PREFERENCE_KEYS = ["userVegMode"]

// Wishlist cache. A guest's hearts live under the plain key; a signed-in
// customer's under a key of their own, so one account never sees another's
// list on a shared device. The server (/user/favorites) is the source of
// truth for signed-in customers; this cache only makes hearts show instantly.
export const GUEST_WISHLIST_KEY = "userDishFavorites"
export const USER_WISHLIST_KEY_PREFIX = "userDishFavorites:"
const wishlistKey = (userId) => (userId ? `${USER_WISHLIST_KEY_PREFIX}${userId}` : GUEST_WISHLIST_KEY)
const OBJECT_ID = /^[a-f0-9]{24}$/i
const isObjectId = (value) => OBJECT_ID.test(String(value || ""))
const sameId = (a, b) => String(a ?? "") === String(b ?? "")

const readList = (key) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]")
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id != null) : []
  } catch {
    return []
  }
}

const mergeById = (...lists) => {
  const seen = new Set()
  const out = []
  lists.flat().forEach((item) => {
    const id = String(item?.id ?? "")
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push(item)
  })
  return out
}

const userIdOf = (user) => {
  const id = user?._id || user?.id || user?.userId
  return id ? String(id) : null
}

const storedUserId = () => {
  try {
    return userIdOf(JSON.parse(localStorage.getItem("user_user") || "null"))
  } catch {
    return null
  }
}

const isUserSignedIn = () =>
  localStorage.getItem("user_authenticated") === "true" || !!localStorage.getItem("user_accessToken")

// A wishlist entry from a /user/favorites product.
const wishlistItemFromProduct = (product) => {
  if (!product?._id) return null
  const seller = product.sellerId
  return {
    id: String(product._id),
    sellerId: String(seller?._id || seller || ""),
    name: product.name,
    image: (Array.isArray(product.images) && product.images[0]) || product.image || "",
    price: product.price,
    mrp: product.otherPrice,
  }
}

const AUTH_PATH = /^\/(quick\/|shop\/)?auth(\/|$)/
// Pages that only make sense signed in.
const ACCOUNT_PATH = /^\/(quick\/|shop\/)?(orders|profile|wallet|coins|notifications|complaints)(\/|$)/

export function ProfileProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const locationRef = useRef(location)
  locationRef.current = location
  const getAddressId = (address) => address?.id || address?._id || null
  const normalizeAddressLabel = (label) => {
    const normalized = String(label || "").trim().toLowerCase()
    if (normalized === "home") return "Home"
    if (normalized === "office" || normalized === "work") return "Office"
    return "Other"
  }
  const normalizeAddress = (address) => {
    if (!address || typeof address !== "object") return null
    const id = getAddressId(address)
    return {
      ...address,
      label: normalizeAddressLabel(address.label),
      ...(id ? { id: String(id) } : {}),
    }
  }
  const dedupeAddressesByLabel = (addressList = []) => {
    const addressMap = new Map()
    addressList.forEach((addr, index) => {
      const normalizedAddress = normalizeAddress(addr)
      if (!normalizedAddress) return
      const key = normalizedAddress.label || getAddressId(normalizedAddress) || index
      // Keep latest address for each label so newly saved Home/Work/Other is visible immediately
      addressMap.set(key, normalizedAddress)
    })
    return Array.from(addressMap.values())
  }
  const [userProfile, setUserProfile] = useState(() => {
    const userStr = localStorage.getItem("user_user")
    if (userStr) {
      try {
        return JSON.parse(userStr)
      } catch (e) {
        debugError("Error parsing user_user from localStorage:", e)
      }
    }
    const saved = localStorage.getItem("userProfile")
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        debugError("Error parsing userProfile from localStorage:", e)
      }
    }
    return null
  })
  
  const [loading, setLoading] = useState(true)

  const [addresses, setAddresses] = useState([])
  const addressesRef = useRef(addresses)
  addressesRef.current = addresses

  const [paymentMethods, setPaymentMethods] = useState(() => {
    const saved = localStorage.getItem("userPaymentMethods")
    return saved ? JSON.parse(saved) : []
  })

  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem("userFavorites")
    return saved ? JSON.parse(saved) : []
  })

  // Product wishlist, with the account it belongs to (null = guest). Kept
  // together so the list is never written under the wrong account's key.
  const [wishlist, setWishlist] = useState(() => {
    const owner = isUserSignedIn() ? storedUserId() : null
    return { owner, items: readList(wishlistKey(owner)) }
  })
  const wishlistRef = useRef(wishlist)
  wishlistRef.current = wishlist
  const dishFavorites = wishlist.items

  // VegMode state - stored in localStorage for persistence
  const [vegMode, setVegMode] = useState(() => {
    const saved = localStorage.getItem("userVegMode")
    // Default to false (OFF) if not set
    return saved !== null ? saved === "true" : false
  })

  // Helper to check if authenticated
  const isAuthenticated = useMemo(() => {
    return localStorage.getItem("user_authenticated") === "true" || !!localStorage.getItem("user_accessToken")
  }, [userProfile])

  // Save to localStorage whenever userProfile, addresses or paymentMethods change
  useEffect(() => {
    if (userProfile || isAuthenticated) {
      localStorage.setItem("userProfile", JSON.stringify(userProfile))
    }
  }, [userProfile, isAuthenticated])

  useEffect(() => {
    if (addresses.length > 0 || isAuthenticated) {
      localStorage.setItem("userAddresses", JSON.stringify(addresses))
    }
  }, [addresses, isAuthenticated])

  useEffect(() => {
    if (paymentMethods.length > 0 || isAuthenticated) {
      localStorage.setItem("userPaymentMethods", JSON.stringify(paymentMethods))
    }
  }, [paymentMethods, isAuthenticated])

  useEffect(() => {
    if (favorites.length > 0 || isAuthenticated) {
      localStorage.setItem("userFavorites", JSON.stringify(favorites))
    }
  }, [favorites, isAuthenticated])

  useEffect(() => {
    try {
      localStorage.setItem(wishlistKey(wishlist.owner), JSON.stringify(wishlist.items))
    } catch {
      // storage full or blocked: the in-memory list still works
    }
  }, [wishlist])

  // Signed in: show the cached list for this account (plus anything hearted as
  // a guest), then reconcile with the server.
  const syncWishlist = useCallback(async (userId) => {
    if (!userId) return
    const cached = readList(wishlistKey(userId))
    const guest = readList(GUEST_WISHLIST_KEY)
    const merged = mergeById(cached, guest)
    setWishlist({ owner: userId, items: merged })
    if (guest.length) {
      try {
        localStorage.removeItem(GUEST_WISHLIST_KEY)
      } catch {
        // ignore
      }
    }

    try {
      const response = await apiClient.get("/user/favorites", { contextModule: "user" })
      const payload = response?.data?.data || {}
      const serverIds = (Array.isArray(payload.productIds) ? payload.productIds : []).map(String)
      const productById = new Map(
        (Array.isArray(payload.products) ? payload.products : []).map((p) => [String(p?._id), p]),
      )

      // Hearts given as a guest are saved to the account.
      const toPush = guest.filter((g) => isObjectId(g.id) && !serverIds.includes(String(g.id)))
      const pushed = await Promise.allSettled(
        toPush.map((g) => apiClient.post(`/user/favorites/products/${String(g.id)}`, {}, { contextModule: "user" })),
      )
      const pushedIds = toPush.filter((_, i) => pushed[i].status === "fulfilled").map((g) => String(g.id))

      const localById = new Map(merged.map((item) => [String(item.id), item]))
      const fromServer = [...serverIds, ...pushedIds].map(
        (id) => localById.get(id) || wishlistItemFromProduct(productById.get(id)) || { id, sellerId: "" },
      )
      // Entries that are not product ids can't be stored on the server; keep them locally.
      const localOnly = merged.filter((item) => !isObjectId(item.id))

      setWishlist((prev) => {
        if (prev.owner !== userId) return prev
        // Keep anything hearted while this request was in flight.
        const addedMeanwhile = prev.items.filter((item) => !localById.has(String(item.id)))
        return { owner: userId, items: mergeById(fromServer, localOnly, addedMeanwhile) }
      })
    } catch (error) {
      debugError("Error syncing wishlist:", error)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem("userVegMode", vegMode.toString())
    }
  }, [vegMode, isAuthenticated])

  // Fetch user profile and addresses from API on mount and when authentication changes
  useEffect(() => {
    const fetchUserProfile = async () => {
      // Check if user is authenticated
      const isAuthenticated = localStorage.getItem("user_authenticated") === "true" || 
                             localStorage.getItem("user_accessToken")
      
      if (!isAuthenticated) {
        setUserProfile(null)
        setAddresses([])
        setPaymentMethods([])
        setFavorites([])
        // Signed out: drop the account's list from memory. A guest's own list
        // (no owner) is left alone so it survives reloads.
        setWishlist((prev) => (prev.owner ? { owner: null, items: readList(GUEST_WISHLIST_KEY) } : prev))
        setVegMode(false)
        USER_SESSION_PREFERENCE_KEYS.forEach((key) => {
          localStorage.removeItem(key)
        })
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        
        // Fetch user profile
        const response = await authAPI.getCurrentUser()
        const userData = response?.data?.data?.user || response?.data?.user || response?.data
        
        if (userData) {
          setUserProfile(userData)
          // Update localStorage
          localStorage.setItem("user_user", JSON.stringify(userData))
          localStorage.setItem("userProfile", JSON.stringify(userData))
          void syncWishlist(userIdOf(userData))
        }

        // Fetch addresses
        try {
          const addressesResponse = await userAPI.getAddresses()
          const addressesData = addressesResponse?.data?.data?.addresses || addressesResponse?.data?.addresses || []
          const normalizedAddresses = dedupeAddressesByLabel(addressesData)
          setAddresses(normalizedAddresses)
          localStorage.setItem("userAddresses", JSON.stringify(normalizedAddresses))
        } catch (addressError) {
          debugError("Error fetching addresses:", addressError)
          // Try to load from localStorage as fallback
          const saved = localStorage.getItem("userAddresses")
          if (saved) {
            try {
              setAddresses(dedupeAddressesByLabel(JSON.parse(saved)))
            } catch (e) {
              debugError("Error parsing saved addresses:", e)
            }
          }
        }
      } catch (error) {
        // Silently handle error - use existing profile from localStorage
        debugError("Error fetching user profile:", error)
        // Try to load from localStorage as fallback
        const saved = localStorage.getItem("userAddresses")
        if (saved) {
          try {
            setAddresses(dedupeAddressesByLabel(JSON.parse(saved)))
          } catch (e) {
            debugError("Error parsing saved addresses:", e)
          }
        }
      } finally {
        setLoading(false)
      }
    }

    fetchUserProfile()
    
    // Listen for auth changes
    const handleAuthChange = () => {
      fetchUserProfile()
    }
    
    window.addEventListener("userAuthChanged", handleAuthChange)

    return () => {
      window.removeEventListener("userAuthChanged", handleAuthChange)
    }
  }, [syncWishlist])

  // The session could not be refreshed (signed out elsewhere, token revoked):
  // reset to signed-out and ask the customer to sign in again, coming back here.
  const lastSessionExpiryRef = useRef(0)
  useEffect(() => {
    const onRefreshFailed = (event) => {
      if (event?.detail?.module !== "user") return
      const now = Date.now()
      // axios and the token helper can both report the same failure.
      if (now - lastSessionExpiryRef.current < 3000) return
      lastSessionExpiryRef.current = now
      // Auth is already cleared; this re-runs the profile load, which resets the state.
      window.dispatchEvent(new Event("userAuthChanged"))
      const { pathname, search } = locationRef.current
      if (AUTH_PATH.test(pathname)) return
      // Someone browsing or shopping keeps going (signing in again at checkout);
      // only pages that are the account itself send them to sign in.
      if (!ACCOUNT_PATH.test(pathname)) {
        toast("You've been signed out. Sign in again at checkout.", { id: "user-session-expired" })
        return
      }
      toast.error("Please sign in again", { id: "user-session-expired" })
      navigate("/auth/login", { state: { from: `${pathname}${search || ""}` } })
    }
    window.addEventListener("authRefreshFailed", onRefreshFailed)
    return () => window.removeEventListener("authRefreshFailed", onRefreshFailed)
  }, [navigate])

  // Re-read the saved addresses from the server (bypassing the short list cache),
  // e.g. after a delete, where the server may have promoted a new default.
  const refreshAddresses = useCallback(async () => {
    const response = await apiClient.get("/user/addresses", { contextModule: "user" })
    const addressesData = response?.data?.data?.addresses || response?.data?.addresses || []
    const normalizedAddresses = dedupeAddressesByLabel(addressesData)
    setAddresses(normalizedAddresses)
    localStorage.setItem("userAddresses", JSON.stringify(normalizedAddresses))
    return normalizedAddresses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Address functions - memoized with useCallback
  const addAddress = useCallback(async (address) => {
    try {
      const response = await userAPI.addAddress(address)
      const newAddress = response?.data?.data?.address || response?.data?.address
      
      if (newAddress) {
        const normalizedNewAddress = normalizeAddress(newAddress)
        setAddresses((prev) => {
          const filtered = prev.filter(
            (addr) => normalizeAddressLabel(addr?.label) !== normalizeAddressLabel(normalizedNewAddress?.label)
          )
          const updated = dedupeAddressesByLabel([...filtered, normalizedNewAddress])
          localStorage.setItem("userAddresses", JSON.stringify(updated))
          return updated
        })
        return normalizedNewAddress
      }
    } catch (error) {
      debugError("Error adding address:", error)
      throw error
    }
  }, [])

  const updateAddress = useCallback(async (id, updatedAddress) => {
    try {
      const response = await userAPI.updateAddress(id, updatedAddress)
      const updatedAddr = response?.data?.data?.address || response?.data?.address
      
      if (updatedAddr) {
        const normalizedUpdatedAddress = normalizeAddress(updatedAddr)
        setAddresses((prev) => {
          const updated = dedupeAddressesByLabel(
            prev.map((addr) => (String(getAddressId(addr)) === String(id) ? normalizedUpdatedAddress : normalizeAddress(addr)))
          )
          localStorage.setItem("userAddresses", JSON.stringify(updated))
          return updated
        })
        return normalizedUpdatedAddress
      }
    } catch (error) {
      debugError("Error updating address:", error)
      throw error
    }
  }, [])

  const deleteAddress = useCallback(async (id) => {
    try {
      await userAPI.deleteAddress(id)
      setAddresses((prev) => {
        const newAddresses = prev.filter((addr) => String(getAddressId(addr)) !== String(id))
        localStorage.setItem("userAddresses", JSON.stringify(newAddresses))
        return newAddresses
      })
    } catch (error) {
      debugError("Error deleting address:", error)
      throw error
    }
    // Deleting the default makes the server promote another one; pick that up.
    try {
      await refreshAddresses()
    } catch (error) {
      debugError("Error refreshing addresses after delete:", error)
    }
  }, [refreshAddresses])

  const setDefaultAddress = useCallback(async (id) => {
    const previous = addressesRef.current
    // Optimistic UI update first
    setAddresses((prev) =>
      prev.map((addr) => ({
        ...addr,
        isDefault: String(getAddressId(addr)) === String(id),
      }))
    )

    try {
      await userAPI.setDefaultAddress(id)
      return true
    } catch (error) {
      debugError("Error setting default address:", error)
      if (previous) setAddresses(previous)
      toast.error(error?.response?.data?.message || "Couldn't change your default address. Please try again.")
      return false
    }
  }, [])

  const getDefaultAddress = useCallback(() => {
    return addresses.find((addr) => addr.isDefault) || addresses[0] || null
  }, [addresses])

  // Payment method functions - memoized with useCallback
  const addPaymentMethod = useCallback((payment) => {
    setPaymentMethods((prev) => {
      const newPayment = {
        ...payment,
        id: Date.now().toString(),
        isDefault: prev.length === 0 ? true : false,
      }
      return [...prev, newPayment]
    })
  }, [])

  const updatePaymentMethod = useCallback((id, updatedPayment) => {
    setPaymentMethods((prev) =>
      prev.map((pm) => (pm.id === id ? { ...pm, ...updatedPayment } : pm))
    )
  }, [])

  const deletePaymentMethod = useCallback((id) => {
    setPaymentMethods((prev) => {
      const paymentToDelete = prev.find((pm) => pm.id === id)
      const newPayments = prev.filter((pm) => pm.id !== id)
      
      // If deleting default, set first remaining as default
      if (paymentToDelete?.isDefault && newPayments.length > 0) {
        newPayments[0].isDefault = true
      }
      
      return newPayments
    })
  }, [])

  const setDefaultPaymentMethod = useCallback((id) => {
    setPaymentMethods((prev) =>
      prev.map((pm) => ({
        ...pm,
        isDefault: pm.id === id,
      }))
    )
  }, [])

  const getDefaultPaymentMethod = useCallback(() => {
    return paymentMethods.find((pm) => pm.isDefault) || paymentMethods[0] || null
  }, [paymentMethods])

  const getAddressById = useCallback((id) => {
    return addresses.find((addr) => String(getAddressId(addr)) === String(id))
  }, [addresses])

  const getPaymentMethodById = useCallback((id) => {
    return paymentMethods.find((pm) => pm.id === id)
  }, [paymentMethods])

  // Favorites functions - memoized with useCallback
  const addFavorite = useCallback((seller) => {
    setFavorites((prev) => {
      if (!prev.find(fav => fav.slug === seller.slug)) {
        return [...prev, seller]
      }
      return prev
    })
  }, [])

  const removeFavorite = useCallback((slug) => {
    setFavorites((prev) => prev.filter(fav => fav.slug !== slug))
  }, [])

  const isFavorite = useCallback((slug) => {
    return favorites.some(fav => fav.slug === slug)
  }, [favorites])

  const getFavorites = useCallback(() => {
    return favorites
  }, [favorites])

  // Dish favorites functions - memoized with useCallback
  // Product ids are unique, so the seller id is not needed to tell entries apart
  // (older entries, or ones rebuilt from the server, may not carry the same one).
  const addDishFavorite = useCallback((dish) => {
    if (!dish || dish.id == null) return
    const { owner, items } = wishlistRef.current
    if (items.some((fav) => sameId(fav.id, dish.id))) return
    setWishlist((prev) =>
      prev.owner === owner && !prev.items.some((fav) => sameId(fav.id, dish.id))
        ? { owner, items: [...prev.items, dish] }
        : prev,
    )
    if (owner && isObjectId(dish.id)) {
      apiClient.post(`/user/favorites/products/${String(dish.id)}`, {}, { contextModule: "user" }).catch((error) => {
        debugError("Error saving wishlist item:", error)
        setWishlist((prev) =>
          prev.owner === owner ? { owner, items: prev.items.filter((fav) => !sameId(fav.id, dish.id)) } : prev,
        )
        toast.error("Couldn't save to your wishlist. Please try again.")
      })
    }
  }, [])

  const removeDishFavorite = useCallback((dishId) => {
    const { owner, items } = wishlistRef.current
    const removed = items.find((fav) => sameId(fav.id, dishId))
    if (!removed) return
    setWishlist((prev) =>
      prev.owner === owner ? { owner, items: prev.items.filter((fav) => !sameId(fav.id, dishId)) } : prev,
    )
    if (owner && isObjectId(dishId)) {
      apiClient.delete(`/user/favorites/products/${String(dishId)}`, { contextModule: "user" }).catch((error) => {
        debugError("Error removing wishlist item:", error)
        setWishlist((prev) =>
          prev.owner === owner && !prev.items.some((fav) => sameId(fav.id, dishId))
            ? { owner, items: [...prev.items, removed] }
            : prev,
        )
        toast.error("Couldn't remove it from your wishlist. Please try again.")
      })
    }
  }, [])

  const isDishFavorite = useCallback((dishId) => {
    return dishFavorites.some((fav) => sameId(fav.id, dishId))
  }, [dishFavorites])

  const getDishFavorites = useCallback(() => {
    return dishFavorites
  }, [dishFavorites])

  // User profile functions - memoized with useCallback
  const updateUserProfile = useCallback((updatedProfile) => {
    setUserProfile((prev) => ({ ...prev, ...updatedProfile }))
  }, [])

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      userProfile,
      loading,
      updateUserProfile,
      addresses,
      paymentMethods,
      favorites,
      vegMode,
      setVegMode,
      addAddress,
      updateAddress,
      deleteAddress,
      setDefaultAddress,
      getDefaultAddress,
      getAddressById,
      addPaymentMethod,
      updatePaymentMethod,
      deletePaymentMethod,
      setDefaultPaymentMethod,
      getDefaultPaymentMethod,
      getPaymentMethodById,
      addFavorite,
      removeFavorite,
      isFavorite,
      getFavorites,
      dishFavorites,
      addDishFavorite,
      removeDishFavorite,
      isDishFavorite,
      getDishFavorites,
      refreshAddresses,
    }),
    [
      userProfile,
      loading,
      updateUserProfile,
      addresses,
      paymentMethods,
      favorites,
      dishFavorites,
      vegMode,
      setVegMode,
      addAddress,
      updateAddress,
      deleteAddress,
      setDefaultAddress,
      getDefaultAddress,
      getAddressById,
      addPaymentMethod,
      updatePaymentMethod,
      deletePaymentMethod,
      setDefaultPaymentMethod,
      getDefaultPaymentMethod,
      getPaymentMethodById,
      addFavorite,
      removeFavorite,
      isFavorite,
      getFavorites,
      addDishFavorite,
      removeDishFavorite,
      isDishFavorite,
      getDishFavorites,
      refreshAddresses,
    ]
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) {
    // Return fallback values instead of throwing error
    // This prevents crashes when ProfileProvider is not available
    debugWarn("useProfile called outside ProfileProvider - using fallback values")
    return {
      userProfile: null,
      loading: false,
      updateUserProfile: () => debugWarn("ProfileProvider not available"),
      addresses: [],
      paymentMethods: [],
      favorites: [],
      addAddress: () => debugWarn("ProfileProvider not available"),
      updateAddress: () => debugWarn("ProfileProvider not available"),
      deleteAddress: () => debugWarn("ProfileProvider not available"),
      setDefaultAddress: () => debugWarn("ProfileProvider not available"),
      getDefaultAddress: () => null,
      getAddressById: () => null,
      addPaymentMethod: () => debugWarn("ProfileProvider not available"),
      updatePaymentMethod: () => debugWarn("ProfileProvider not available"),
      deletePaymentMethod: () => debugWarn("ProfileProvider not available"),
      setDefaultPaymentMethod: () => debugWarn("ProfileProvider not available"),
      getDefaultPaymentMethod: () => null,
      getPaymentMethodById: () => null,
      addFavorite: () => debugWarn("ProfileProvider not available"),
      removeFavorite: () => debugWarn("ProfileProvider not available"),
      isFavorite: () => false,
      getFavorites: () => [],
      dishFavorites: [],
      addDishFavorite: () => debugWarn("ProfileProvider not available"),
      removeDishFavorite: () => debugWarn("ProfileProvider not available"),
      isDishFavorite: () => false,
      getDishFavorites: () => [],
      refreshAddresses: async () => [],
      vegMode: false,
      setVegMode: () => debugWarn("ProfileProvider not available")
    }
  }
  return context
}


