/**
 * behaviorTracking.js — SPRINT 0: Behavior Intelligence Infrastructure
 *
 * ADDITIVE module. Provides scroll intelligence, content visibility,
 * dwell tracking, and intent signals for the BeachSheet and other
 * scrollable surfaces.
 *
 * All events pass through the existing track() infrastructure.
 * No parallel analytics system. No LLM. No AI. Pure observation.
 *
 * Rollback: ?behavior_track=0 disables all new tracking.
 */
import { useRef, useEffect, useCallback, useState } from "react"

/* ── Rollback guard ── */
function isBehaviorTrackingEnabled() {
  try {
    return !/[?&]behavior_track=0(?:&|$)/.test(window.location.search)
  } catch (_) { return true }
}

/* ── Consent check ── */
function hasConsent() {
  try { return localStorage.getItem("sg_cookie_consent") === "accepted" }
  catch (_) { return false }
}

/* ── Safe track wrapper with offline queue ── */
const BT_QUEUE_KEY = "sg_bt_pending_queue"
const BT_QUEUE_CAP = 500

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(BT_QUEUE_KEY) || "[]") }
  catch (_) { return [] }
}

function saveQueue(q) {
  try {
    if (q.length > BT_QUEUE_CAP) q.splice(0, q.length - BT_QUEUE_CAP)
    localStorage.setItem(BT_QUEUE_KEY, JSON.stringify(q))
  } catch (_) {}
}

function flushPendingQueue() {
  if (!isBehaviorTrackingEnabled()) return
  if (!hasConsent()) return
  const q = loadQueue()
  if (!q.length) return
  const batch = q.splice(0, 50)
  saveQueue(q)
  for (const { e, p } of batch) {
    try { if (typeof window !== "undefined" && window.track) window.track(e, p) } catch (_) {}
  }
}

function safeTrack(name, params) {
  try {
    if (typeof window !== "undefined" && window.track) {
      window.track(name, params)
      return
    }
  } catch (_) {}
  // Offline fallback: queue for later flush
  try {
    const q = loadQueue()
    q.push({ e: name, p: params, t: Date.now() })
    saveQueue(q)
  } catch (_) {}
}

// Auto-flush on visibilitychange + online
try {
  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") flushPendingQueue()
    })
    window.addEventListener("online", flushPendingQueue)
    // Also flush once on load
    setTimeout(flushPendingQueue, 2000)
  }
} catch (_) {}

/* ── Context builder ── */
function buildContext(overrides = {}) {
  try {
    return {
      session_id: typeof window !== "undefined" && localStorage.getItem("sg_uid") || undefined,
      region: typeof __REGION__ !== "undefined" && __REGION__ ? __REGION__.id : undefined,
      viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : undefined,
      timestamp: Date.now(),
      ...overrides
    }
  } catch (_) {
    return { timestamp: Date.now(), ...overrides }
  }
}

/* ══════════════════════════════════════════════════════════════
   SCROLL INTELLIGENCE
   ══════════════════════════════════════════════════════════════ */

/**
 * useScrollIntelligence — tracks scroll depth thresholds (25/50/75/90)
 * on a scrollable container. Fires each threshold max ONCE per mount.
 *
 * @param {Object} opts
 * @param {string} opts.beach_id - Beach identifier
 * @param {string} opts.region - Region code
 * @param {React.RefObject} opts.scrollRef - Ref to the scrollable container
 * @param {Function} opts.onThreshold - Optional callback when threshold hit
 */
export function useScrollIntelligence({ beach_id, region, scrollRef, onThreshold }) {
  const firedRef = useRef(new Set())

  useEffect(() => {
    if (!isBehaviorTrackingEnabled()) return
    const el = scrollRef?.current
    if (!el) return

    const THRESHOLDS = [25, 50, 75, 90]
    const fired = firedRef.current

    function onScroll() {
      if (!el) return
      const scrollTop = el.scrollTop || 0
      const scrollHeight = el.scrollHeight - el.clientHeight
      if (scrollHeight <= 0) return
      const depth = Math.round((scrollTop / scrollHeight) * 100)

      for (const t of THRESHOLDS) {
        if (depth >= t && !fired.has(t)) {
          fired.add(t)
          safeTrack("sg_beach_scroll_" + t, buildContext({
            beach_id,
            region,
            scroll_depth: depth,
            component: "BeachSheet"
          }))
          onThreshold && onThreshold(t, depth)
        }
      }
    }

    const throttledScroll = (() => {
      let ticking = false
      return function () {
        if (!ticking) {
          ticking = true
          requestAnimationFrame(() => { onScroll(); ticking = false })
        }
      }
    })()

    el.addEventListener("scroll", throttledScroll, { passive: true })
    return () => { el.removeEventListener("scroll", throttledScroll); fired.clear() }
  }, [beach_id, region, scrollRef, onThreshold])
}

/* ══════════════════════════════════════════════════════════════
   CONTENT VISIBILITY (IntersectionObserver)
   ══════════════════════════════════════════════════════════════ */

/**
 * useContentVisibility — observes section visibility via IntersectionObserver.
 * Tracks view/consumed/ignored per section.
 *
 * @param {Object} opts
 * @param {string} opts.section_id - Section identifier
 * @param {string} opts.beach_id - Beach identifier
 * @param {string} opts.region - Region code
 * @param {number} opts.consumedThreshold - Ms to consider "consumed" (default 2000)
 */
export function useContentVisibility({ section_id, beach_id, region, consumedThreshold = 2000, ref: externalRef }) {
  const internalRef = useRef(null)
  const ref = externalRef || internalRef
  const stateRef = useRef({ viewed: false, enterTime: 0, consumed: false })

  useEffect(() => {
    if (!isBehaviorTrackingEnabled()) return
    const el = ref.current
    if (!el) return

    const state = stateRef.current

    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!state.viewed) {
          state.viewed = true
          state.enterTime = Date.now()
          safeTrack("sg_section_view", buildContext({
            section_id,
            beach_id,
            region,
            component: "BeachSheet"
          }))
        }
      } else if (state.viewed && !state.consumed) {
        const dwell = Date.now() - state.enterTime
        if (dwell >= consumedThreshold) {
          state.consumed = true
          safeTrack("sg_section_consumed", buildContext({
            section_id,
            beach_id,
            region,
            dwell_ms: dwell,
            component: "BeachSheet"
          }))
        } else {
          safeTrack("sg_section_ignored", buildContext({
            section_id,
            beach_id,
            region,
            dwell_ms: dwell,
            component: "BeachSheet"
          }))
        }
      }
    }, { threshold: 0.5, rootMargin: "0px" })

    obs.observe(el)
    return () => obs.disconnect()
  }, [section_id, beach_id, region, consumedThreshold])
}

/* ══════════════════════════════════════════════════════════════
   DWELL INTELLIGENCE
   ══════════════════════════════════════════════════════════════ */

/**
 * useDwellTracking — measures time spent on a section.
 * Fires sg_dwell_end when section leaves viewport with total dwell.
 *
 * @param {Object} opts
 * @param {string} opts.section_id - Section identifier
 * @param {string} opts.beach_id - Beach identifier
 * @param {string} opts.region - Region code
 */
export function useDwellTracking({ section_id, beach_id, region, ref: externalRef }) {
  const internalRef = useRef(null)
  const ref = externalRef || internalRef
  const stateRef = useRef({ enterTime: 0, tracking: false })

  useEffect(() => {
    if (!isBehaviorTrackingEnabled()) return
    const el = ref.current
    if (!el) return

    const state = stateRef.current

    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!state.tracking) {
          state.tracking = true
          state.enterTime = Date.now()
        }
      } else if (state.tracking) {
        state.tracking = false
        const dwell = Date.now() - state.enterTime
        if (dwell > 100) {
          safeTrack("sg_dwell_end", buildContext({
            section_id,
            beach_id,
            region,
            dwell_ms: dwell,
            component: "BeachSheet"
          }))
        }
      }
    }, { threshold: 0.3, rootMargin: "0px" })

    obs.observe(el)
    return () => {
      obs.disconnect()
      if (state.tracking) {
        state.tracking = false
        const dwell = Date.now() - state.enterTime
        if (dwell > 100) {
          safeTrack("sg_dwell_end", buildContext({
            section_id,
            beach_id,
            region,
            dwell_ms: dwell,
            component: "BeachSheet"
          }))
        }
      }
    }
  }, [section_id, beach_id, region])
}

/* ══════════════════════════════════════════════════════════════
   INTENT SIGNALS (deterministic, 0 IA)
   ══════════════════════════════════════════════════════════════ */

/**
 * IntentEngine — lightweight intent inference from observable signals.
 * No LLM. No AI. Pure deterministic rules.
 */
export class IntentEngine {
  constructor() {
    this.signals = []
    this.sessions = new Map() // beach_id → session data
  }

  /**
   * Record an observable signal.
   * @param {string} type - Signal type (beach_open, scroll, forecast_click, paywall_view, etc.)
   * @param {Object} data - Signal data (beach_id, region, etc.)
   */
  signal(type, data = {}) {
    if (!isBehaviorTrackingEnabled()) return

    const entry = { type, ts: Date.now(), ...data }
    this.signals.push(entry)

    // Keep last 100 signals
    if (this.signals.length > 100) this.signals.splice(0, this.signals.length - 100)

    // Update session per beach
    const bid = data.beach_id
    if (bid) {
      if (!this.sessions.has(bid)) {
        this.sessions.set(bid, { opens: 0, scrolls: [], forecastClicks: 0, paywallViews: 0 })
      }
      const s = this.sessions.get(bid)
      if (type === "beach_open") s.opens++
      if (type === "scroll") s.scrolls.push(data.depth || 0)
      if (type === "forecast_click") s.forecastClicks++
      if (type === "paywall_view") s.paywallViews++
    }

    // Infer intent
    const intent = this._inferIntent()
    if (intent) {
      safeTrack("sg_intent_inferred", buildContext({
        intent: intent.type,
        confidence: intent.confidence,
        signals: intent.signals.slice(-5),
        component: "IntentEngine"
      }))
    }
  }

  _inferIntent() {
    const recent = this.signals.slice(-20)
    if (recent.length < 2) return null

    const beachOpens = recent.filter(s => s.type === "beach_open")
    const uniqueBeaches = new Set(beachOpens.map(s => s.beach_id))
    const scrollEvents = recent.filter(s => s.type === "scroll")
    const forecastClicks = recent.filter(s => s.type === "forecast_click")
    const paywallViews = recent.filter(s => s.type === "paywall_view")

    // compare: multiple beaches opened + back to map
    if (uniqueBeaches.size >= 2) {
      return {
        type: "compare",
        confidence: Math.min(90, 50 + uniqueBeaches.size * 10),
        signals: recent.slice(-5)
      }
    }

    // forecast_demand: forecast lock click
    if (forecastClicks.length > 0) {
      return {
        type: "forecast_demand",
        confidence: 85,
        signals: forecastClicks.slice(-3)
      }
    }

    // purchase: paywall view + checkout intent
    if (paywallViews.length > 0) {
      return {
        type: "purchase",
        confidence: 70,
        signals: paywallViews.slice(-3)
      }
    }

    // decide: deep scroll on verdict/forecast
    if (scrollEvents.length >= 2 && beachOpens.length >= 1) {
      const maxScroll = Math.max(...scrollEvents.map(s => s.depth || 0))
      if (maxScroll >= 50) {
        return {
          type: "decide",
          confidence: Math.min(80, 40 + maxScroll),
          signals: recent.slice(-5)
        }
      }
    }

    // browse: default
    if (beachOpens.length >= 1 && recent.length <= 5) {
      return {
        type: "browse",
        confidence: 40,
        signals: recent.slice(-3)
      }
    }

    return null
  }

  reset() {
    this.signals = []
    this.sessions.clear()
  }
}

/* ══════════════════════════════════════════════════════════════
   MAP INTELLIGENCE
   ══════════════════════════════════════════════════════════════ */

/**
 * trackMapView — fire sg_map_view on first render.
 */
export function trackMapView(region, viewport, pinCount) {
  if (!isBehaviorTrackingEnabled()) return
  safeTrack("sg_map_view", buildContext({
    region,
    viewport,
    pin_count: pinCount,
    component: "WorldMapView"
  }))
}

/**
 * trackMapReady — fire sg_map_ready when map data loaded.
 */
export function trackMapReady(region, loadTimeMs, dataFreshnessH) {
  if (!isBehaviorTrackingEnabled()) return
  safeTrack("sg_map_ready", buildContext({
    region,
    load_time_ms: loadTimeMs,
    data_freshness_h: dataFreshnessH,
    component: "WorldMapView"
  }))
}

/**
 * trackMapZoom — fire sg_map_zoom (throttled).
 */
export const trackMapZoom = (() => {
  let last = 0
  return function (region, fromLevel, toLevel, trigger) {
    if (!isBehaviorTrackingEnabled()) return
    const now = Date.now()
    if (now - last < 500) return
    last = now
    safeTrack("sg_map_zoom", buildContext({
      region,
      from_level: fromLevel,
      to_level: toLevel,
      trigger,
      component: "WorldMapView"
    }))
  }
})()

/**
 * trackMapPan — fire sg_map_pan (throttled).
 */
export const trackMapPan = (() => {
  let last = 0
  return function (region, deltaX, deltaY) {
    if (!isBehaviorTrackingEnabled()) return
    const now = Date.now()
    if (now - last < 1000) return
    last = now
    safeTrack("sg_map_pan", buildContext({
      region,
      delta_x: deltaX,
      delta_y: deltaY,
      component: "WorldMapView"
    }))
  }
})()

/**
 * trackBeachPinClick — fire sg_beach_pin_click with beach_id.
 */
export function trackBeachPinClick(beach_id, region, source, status, pinColor) {
  if (!isBehaviorTrackingEnabled()) return
  safeTrack("sg_beach_pin_click", buildContext({
    beach_id,
    region,
    source,
    status,
    pin_color: pinColor,
    component: "WorldMapView"
  }))
}

/* ══════════════════════════════════════════════════════════════
   MEDIA INSTRUMENTATION
   ══════════════════════════════════════════════════════════════ */

/**
 * useVideoTracking — tracks video play/completion events.
 */
export function useVideoTracking({ beach_id, video_id, videoRef }) {
  useEffect(() => {
    if (!isBehaviorTrackingEnabled()) return
    const vid = videoRef?.current
    if (!vid) return

    const pct25 = { fired: false }
    const pct50 = { fired: false }
    const pct75 = { fired: false }

    function onPlay() {
      safeTrack("sg_video_start", buildContext({ beach_id, video_id, component: "Media" }))
    }

    function onTimeUpdate() {
      const dur = vid.duration
      if (!dur || dur <= 0) return
      const pct = vid.currentTime / dur
      if (pct >= 0.25 && !pct25.fired) { pct25.fired = true; safeTrack("sg_video_25", buildContext({ beach_id, video_id })) }
      if (pct >= 0.50 && !pct50.fired) { pct50.fired = true; safeTrack("sg_video_50", buildContext({ beach_id, video_id })) }
      if (pct >= 0.75 && !pct75.fired) { pct75.fired = true; safeTrack("sg_video_75", buildContext({ beach_id, video_id })) }
    }

    function onEnded() {
      safeTrack("sg_video_complete", buildContext({
        beach_id, video_id,
        duration_ms: Math.round((vid.duration || 0) * 1000),
        component: "Media"
      }))
    }

    vid.addEventListener("play", onPlay)
    vid.addEventListener("timeupdate", onTimeUpdate)
    vid.addEventListener("ended", onEnded)
    return () => {
      vid.removeEventListener("play", onPlay)
      vid.removeEventListener("timeupdate", onTimeUpdate)
      vid.removeEventListener("ended", onEnded)
    }
  }, [beach_id, video_id, videoRef])
}

/* ══════════════════════════════════════════════════════════════
   EXPORTS
   ══════════════════════════════════════════════════════════════ */

export {
  isBehaviorTrackingEnabled,
  hasConsent,
  buildContext,
  safeTrack
}
