const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

/**
 * Seller Management Utility Functions
 * Centralized management for seller details across the seller module
 */

// Default seller data
const DEFAULT_SELLER_DATA = {
  sellerName: {
    english: "Hungry Puppets",
    bengali: "",
    arabic: "",
    spanish: ""
  },
  phoneNumber: "+101747410000",
  address: "House: 00, Road: 00, Test City",
  logo: null,
  cover: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&h=400&fit=crop",
  metaTitle: "Hungry Puppets Seller: Where Fla",
  metaDescription: "Satisfy your cravings and indulge in a culinary adventure at Hungry Puppets Seller. Our menu is a symphony of taste, offering a delightful fusion of flavors that excite both palate and",
  metaImage: null,
  rating: 4.7,
  totalRatings: 3
}

const SELLER_STORAGE_KEY = 'seller_data'

const isValidImageValue = (value) => {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false

  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/')
  )
}

const normalizeSellerData = (data = {}) => ({
  ...DEFAULT_SELLER_DATA,
  ...data,
  sellerName: {
    ...DEFAULT_SELLER_DATA.sellerName,
    ...(data.sellerName || {})
  },
  logo: isValidImageValue(data.logo) ? data.logo : null,
  cover: isValidImageValue(data.cover) ? data.cover : DEFAULT_SELLER_DATA.cover,
  metaImage: isValidImageValue(data.metaImage) ? data.metaImage : null
})

/**
 * Get seller data from localStorage
 * @returns {Object} - Seller data object
 */
export const getSellerData = () => {
  try {
    const saved = localStorage.getItem(SELLER_STORAGE_KEY)
    if (saved) {
      const normalizedData = normalizeSellerData(JSON.parse(saved))
      localStorage.setItem(SELLER_STORAGE_KEY, JSON.stringify(normalizedData))
      return normalizedData
    }
    // Initialize with default data
    setSellerData(DEFAULT_SELLER_DATA)
    return DEFAULT_SELLER_DATA
  } catch (error) {
    debugError('Error reading seller data from localStorage:', error)
    return DEFAULT_SELLER_DATA
  }
}

/**
 * Save seller data to localStorage
 * @param {Object} sellerData - Seller data object
 */
export const setSellerData = (sellerData) => {
  try {
    const normalizedData = normalizeSellerData(sellerData)
    localStorage.setItem(SELLER_STORAGE_KEY, JSON.stringify(normalizedData))
    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('sellerDataUpdated'))
    // Trigger storage event for cross-tab updates
    window.dispatchEvent(new Event('storage'))
  } catch (error) {
    debugError('Error saving seller data to localStorage:', error)
  }
}

/**
 * Update seller data (merge with existing)
 * @param {Object} updates - Partial seller data to update
 * @returns {Object} - Updated seller data
 */
export const updateSellerData = (updates) => {
  const currentData = getSellerData()
  const updatedData = {
    ...currentData,
    ...updates,
    // Merge sellerName object if it exists
    sellerName: updates.sellerName 
      ? { ...currentData.sellerName, ...updates.sellerName }
      : currentData.sellerName
  }
  setSellerData(updatedData)
  return updatedData
}


