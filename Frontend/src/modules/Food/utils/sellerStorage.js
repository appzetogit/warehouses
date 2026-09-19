// Utility for managing seller data across pages
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const STORAGE_KEY = "switcheats_sellers"

// Get sellers from localStorage
export const getSellers = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
    return []
  } catch (error) {
    debugError("Error loading sellers:", error)
    return []
  }
}

// Save sellers to localStorage
export const saveSellers = (sellers) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sellers))
    return true
  } catch (error) {
    debugError("Error saving sellers:", error)
    return false
  }
}

// Add a new seller
export const addSeller = (sellerData) => {
  const sellers = getSellers()
  const newSeller = {
    id: sellers.length > 0 ? Math.max(...sellers.map(r => r.id)) + 1 : 1,
    name: sellerData.sellerName,
    ownerName: `${sellerData.firstName} ${sellerData.lastName}`,
    ownerPhone: `${sellerData.phoneCode} ${sellerData.phone}`,
    zone: sellerData.zone,
    cuisine: sellerData.cuisine,
    status: true,
    rating: 0,
    logo: sellerData.logo ? URL.createObjectURL(sellerData.logo) : null,
    ...sellerData
  }
  const updatedSellers = [...sellers, newSeller]
  saveSellers(updatedSellers)
  return newSeller
}

// Update a seller
export const updateSeller = (id, updates) => {
  const sellers = getSellers()
  const updatedSellers = sellers.map(r => 
    r.id === id ? { ...r, ...updates } : r
  )
  saveSellers(updatedSellers)
  return updatedSellers.find(r => r.id === id)
}

// Delete a seller
export const deleteSeller = (id) => {
  const sellers = getSellers()
  const updatedSellers = sellers.filter(r => r.id !== id)
  saveSellers(updatedSellers)
  return true
}


