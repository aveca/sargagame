import { useState, useCallback, useMemo, useEffect } from "react"

const WORLD_FLAG = "world_around_me"
const STORAGE_KEY = "sg_around_me_optout"
const MAX_FALLBACK_DISTANCE_KM = 250

function getFlag() {
  if (typeof window === "undefined") return false
  try {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get(WORLD_FLAG)
    const disabled = params.get(WORLD_FLAG) === "0"
    return flag === "1" && !disabled
  } catch {
    return false
  }
}

function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity
  const R = 6371
  const toR = x => x * Math.PI / 180
  const dLat = toR(b.lat - a.lat)
  const dLng = toR(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function isInRegionBBox(lat, lng, region) {
  if (!region || !region.geoDetect) return false
  const { latMin, latMax, lngMin, lngMax } = region.geoDetect
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax
}

function getRegionBBoxCenter(region) {
  if (!region || !region.geoDetect) return null
  const { latMin, latMax, lngMin, lngMax } = region.geoDetect
  return { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 }
}

function hasOptedOut() {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function setOptOut() {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, "1")
  } catch {}
}

export function useAroundMe(beaches, region, track, lang) {
  const flagEnabled = useMemo(() => getFlag(), [])
  const [userLoc, setUserLoc] = useState(null)
  const [locationSource, setLocationSource] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const [geoPending, setGeoPending] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [optedOut, setOptedOut] = useState(false)

  useEffect(() => {
    setOptedOut(hasOptedOut())
  }, [])

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported")
      if (track) track("sg_around_me_geo_error", { region: region?.id, inZone: false, source: "unsupported" })
      return
    }
    if (optedOut) {
      if (track) track("sg_around_me_permission_denied", { region: region?.id, inZone: false, source: "opted_out" })
      return
    }
    setGeoPending(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationSource("gps")
        setGeoPending(false)
        if (track) track("sg_around_me_geo_success", { region: region?.id, inZone: true, source: "gps" })
      },
      err => {
        const reason = err.code === 1 ? "denied" : err.code === 2 ? "unavailable" : "timeout"
        setGeoError(err.message)
        setGeoPending(false)
        if (track) track("sg_around_me_geo_error", { region: region?.id, inZone: false, source: reason })
        if (reason === "denied") {
          if (track) track("sg_around_me_permission_denied", { region: region?.id, inZone: false, source: "user_denied" })
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    )
  }, [track, optedOut, region])

  const dismissInfo = useCallback(() => {
    setShowInfo(false)
    setOptOut(true)
    setOptedOut(true)
  }, [])

  const sortedBeaches = useMemo(() => {
    if (!flagEnabled || !beaches?.length || !userLoc) return []
    const origin = userLoc
    return [...beaches]
      .filter(b => b.lat != null && b.lng != null)
      .map(b => ({ ...b, distanceKm: haversineKm(origin, { lat: b.lat, lng: b.lng }) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [flagEnabled, beaches, userLoc])

  const inLiveZone = useMemo(() => {
    if (!flagEnabled || !userLoc || !region) return false
    return isInRegionBBox(userLoc.lat, userLoc.lng, region)
  }, [flagEnabled, userLoc, region])

  const fallbackCenter = useMemo(() => getRegionBBoxCenter(region), [region])

  const beachesInRange = useMemo(() => {
    if (!userLoc) return []
    return sortedBeaches.filter(b => b.distanceKm <= MAX_FALLBACK_DISTANCE_KM)
  }, [sortedBeaches, userLoc])

  return {
    flagEnabled,
    userLoc,
    locationSource,
    geoError,
    geoPending,
    requestGeolocation,
    sortedBeaches: beachesInRange,
    allSortedBeaches: sortedBeaches,
    inLiveZone,
    fallbackCenter,
    showInfo: flagEnabled && !userLoc && !geoPending && !optedOut,
    setShowInfo: () => setShowInfo(true),
    dismissInfo,
    optedOut,
  }
}