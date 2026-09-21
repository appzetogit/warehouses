import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useLocation } from "@store/hooks/useLocation"
import { useZone } from "@store/hooks/useZone"
import { useProfile } from "@store/context/ProfileContext"
import {
  buildDisplayAddressText,
  buildEffectiveLocation,
  formatSavedAddress,
  getDeliveryAddressMode,
  notifyUserLocationChanged,
} from "@store/utils/deliveryLocationUtils"

const defaultDeliveryLocationContext = {
  liveLocation: null,
  effectiveLocation: null,
  deliveryAddressMode: "saved",
  displayAddressText: "Select Location",
  savedAddressText: "",
  defaultSavedAddress: null,
  loading: true,
  requestLocation: async () => null,
  requestLiveLocation: async () => null,
  zoneId: null,
  zone: null,
  zoneStatus: null,
  isInService: false,
  isOutOfService: false,
  zoneLoading: true,
  zoneError: null,
  refreshZone: () => {},
  commerceMode: "quick",
  setCommerceMode: () => {},
}

const DeliveryLocationContext = createContext(defaultDeliveryLocationContext)

export function DeliveryLocationProvider({ children }) {
  const { getDefaultAddress } = useProfile()
  const { location: liveLocation, loading, requestLocation } = useLocation()
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(getDeliveryAddressMode)
  const [addressRevision, setAddressRevision] = useState(0)
  const [commerceMode, setCommerceModeState] = useState(() => {
    try {
      return localStorage.getItem("commerce_mode") || "quick"
    } catch {
      return "quick"
    }
  })

  const setCommerceMode = useCallback((mode) => {
    const validMode = mode === "standard" ? "standard" : "quick"
    setCommerceModeState(validMode)
    try {
      localStorage.setItem("commerce_mode", validMode)
      window.dispatchEvent(new CustomEvent("commerceModeChanged", { detail: validMode }))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const handleCommerceModeChange = (e) => {
      if (e?.detail) setCommerceModeState(e.detail)
    }
    window.addEventListener("commerceModeChanged", handleCommerceModeChange)
    return () => window.removeEventListener("commerceModeChanged", handleCommerceModeChange)
  }, [])

  useEffect(() => {
    const syncMode = () => setDeliveryAddressMode(getDeliveryAddressMode())
    const syncAddress = () => setAddressRevision((value) => value + 1)

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        syncMode()
        syncAddress()
      }
    }

    window.addEventListener("deliveryAddressModeChanged", syncMode)
    window.addEventListener("userLocationChanged", syncAddress)
    window.addEventListener("focus", syncMode)
    window.addEventListener("storage", syncMode)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("deliveryAddressModeChanged", syncMode)
      window.removeEventListener("userLocationChanged", syncAddress)
      window.removeEventListener("focus", syncMode)
      window.removeEventListener("storage", syncMode)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const defaultSavedAddress = useMemo(() => {
    void addressRevision
    return getDefaultAddress?.() || null
  }, [getDefaultAddress, addressRevision])

  const savedAddressText = useMemo(
    () => formatSavedAddress(defaultSavedAddress),
    [defaultSavedAddress],
  )

  const effectiveLocation = useMemo(
    () =>
      buildEffectiveLocation({
        deliveryAddressMode,
        defaultSavedAddress,
        liveLocation,
      }),
    [deliveryAddressMode, defaultSavedAddress, liveLocation],
  )

  const displayAddressText = useMemo(
    () =>
      buildDisplayAddressText({
        deliveryAddressMode,
        savedAddressText,
        effectiveLocation,
      }),
    [deliveryAddressMode, savedAddressText, effectiveLocation],
  )

  const {
    zoneId,
    zone,
    zoneStatus,
    isInService,
    isOutOfService,
    loading: zoneLoading,
    error: zoneError,
    refreshZone,
  } = useZone(effectiveLocation)

  useEffect(() => {
    if (
      !Number.isFinite(effectiveLocation?.latitude) ||
      !Number.isFinite(effectiveLocation?.longitude)
    ) {
      return
    }

    refreshZone()
  }, [
    deliveryAddressMode,
    effectiveLocation?.latitude,
    effectiveLocation?.longitude,
    refreshZone,
  ])

  const requestLiveLocation = useCallback(async () => {
    const loc = await requestLocation({ live: true })
    if (loc) {
      notifyUserLocationChanged(loc)
    }
    return loc
  }, [requestLocation])

  const value = useMemo(
    () => ({
      liveLocation,
      effectiveLocation,
      deliveryAddressMode,
      displayAddressText,
      savedAddressText,
      defaultSavedAddress,
      loading,
      requestLocation,
      requestLiveLocation,
      zoneId,
      zone,
      zoneStatus,
      isInService,
      isOutOfService,
      zoneLoading,
      zoneError,
      refreshZone,
      commerceMode,
      setCommerceMode,
    }),
    [
      liveLocation,
      effectiveLocation,
      deliveryAddressMode,
      displayAddressText,
      savedAddressText,
      defaultSavedAddress,
      loading,
      requestLocation,
      requestLiveLocation,
      zoneId,
      zone,
      zoneStatus,
      isInService,
      isOutOfService,
      zoneLoading,
      zoneError,
      refreshZone,
      commerceMode,
      setCommerceMode,
    ],
  )

  return (
    <DeliveryLocationContext.Provider value={value}>
      {children}
    </DeliveryLocationContext.Provider>
  )
}

export function useDeliveryLocation() {
  const context = useContext(DeliveryLocationContext)
  return context
}
