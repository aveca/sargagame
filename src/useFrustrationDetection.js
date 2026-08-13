// useFrustrationDetection.js — Hook React pour détecter frustration user en temps réel
// Signaux : rage-clicks, scroll frénétique, mouse shake, temps mort
// Trigger : callback quand seuil atteint + contexte (élément, page, action)
// Track : events Supabase pour apprentissage funnel

import { useState, useEffect, useRef, useCallback } from 'react'

// GitHub Pages base path helper
function getPathname() {
  if (typeof window === 'undefined') return '/'
  let p = getPathname()
  if (location.hostname === 'aveca.github.io' && p.indexOf('/sargagame') === 0) p = p.slice('/sargagame'.length) || '/'
  return p
}

// Configurable thresholds
const CONFIG = {
  rageClick: { threshold: 3, window: 5000 }, // 3 clics en 5s = rage
  scrollFrenzy: { threshold: 5, window: 3000 }, // 5 scrolls rapides en 3s
  mouseShake: { threshold: 10, window: 2000 }, // 10 mouvements erratiques en 2s
  hesitation: { threshold: 10000 }, // 10s sans interaction
  triggerCooldown: 30000, // 30s entre 2 triggers (pas spam)
}

export function useFrustrationDetection(onFrustration, options = {}) {
  const config = { ...CONFIG, ...options }
  const [enabled, setEnabled] = useState(true)
  const lastTrigger = useRef(0)
  
  // Rage-click detection
  const clickHistory = useRef([])
  const [rageClickElement, setRageClickElement] = useState(null)
  
  // Scroll frenzy detection
  const scrollHistory = useRef([])
  const lastScrollY = useRef(window.scrollY)
  const lastScrollTime = useRef(Date.now())
  
  // Mouse shake detection
  const mouseHistory = useRef([])
  
  // Hesitation detection
  const lastInteraction = useRef(Date.now())
  
  // Track frustration signals
  const trackSignal = useCallback((type, context) => {
    // Track to Supabase for learning
    if (window.trackFrustration) {
      window.trackFrustration(type, context)
    }
  }, [])
  
  // Check if we should trigger (cooldown)
  const shouldTrigger = useCallback(() => {
    const now = Date.now()
    if (now - lastTrigger.current < config.triggerCooldown) return false
    lastTrigger.current = now
    return true
  }, [config.triggerCooldown])
  
  // Rage-click handler
  useEffect(() => {
    if (!enabled) return
    
    const handleClick = (e) => {
      const now = Date.now()
      const target = e.target
      
      // Filter out interactive elements (buttons, links, inputs)
      const isInteractive = target.matches('button, a, input, textarea, select, [role="button"], [onclick]')
      if (isInteractive) return
      
      // Add to history
      clickHistory.current.push({ time: now, element: target })
      
      // Clean old entries
      clickHistory.current = clickHistory.current.filter(
        c => now - c.time < config.rageClick.window
      )
      
      // Check if same element clicked multiple times
      const recentClicks = clickHistory.current.filter(
        c => c.element === target
      )
      
      if (recentClicks.length >= config.rageClick.threshold) {
        setRageClickElement(target)
        
        if (shouldTrigger()) {
          const context = {
            type: 'rage-click',
            element: describeElement(target),
            page: getPathname(),
            timestamp: now,
            count: recentClicks.length,
          }
          trackSignal('rage-click', context)
          onFrustration?.(context)
        }
        
        // Reset history
        clickHistory.current = []
      }
    }
    
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [enabled, config.rageClick, onFrustration, shouldTrigger, trackSignal])
  
  // Scroll frenzy handler
  useEffect(() => {
    if (!enabled) return
    
    const handleScroll = () => {
      const now = Date.now()
      const currentY = window.scrollY
      const deltaY = Math.abs(currentY - lastScrollY.current)
      const deltaTime = now - lastScrollTime.current
      
      // Detect rapid scroll (large delta in short time)
      if (deltaY > 200 && deltaTime < 300) {
        scrollHistory.current.push({ time: now, delta: deltaY })
        
        // Clean old entries
        scrollHistory.current = scrollHistory.current.filter(
          s => now - s.time < config.scrollFrenzy.window
        )
        
        if (scrollHistory.current.length >= config.scrollFrenzy.threshold) {
          if (shouldTrigger()) {
            const context = {
              type: 'scroll-frenzy',
              page: getPathname(),
              timestamp: now,
              scrollCount: scrollHistory.current.length,
            }
            trackSignal('scroll-frenzy', context)
            onFrustration?.(context)
          }
          scrollHistory.current = []
        }
      }
      
      lastScrollY.current = currentY
      lastScrollTime.current = now
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [enabled, config.scrollFrenzy, onFrustration, shouldTrigger, trackSignal])
  
  // Mouse shake handler
  useEffect(() => {
    if (!enabled) return
    
    const handleMouseMove = (e) => {
      const now = Date.now()
      mouseHistory.current.push({ time: now, x: e.clientX, y: e.clientY })
      
      // Clean old entries
      mouseHistory.current = mouseHistory.current.filter(
        m => now - m.time < config.mouseShake.window
      )
      
      // Detect erratic movement (rapid direction changes)
      if (mouseHistory.current.length >= config.mouseShake.threshold) {
        let directionChanges = 0
        let prevDx = 0
        let prevDy = 0
        
        for (let i = 1; i < mouseHistory.current.length; i++) {
          const curr = mouseHistory.current[i]
          const prev = mouseHistory.current[i - 1]
          const dx = curr.x - prev.x
          const dy = curr.y - prev.y
          
          // Check direction change
          if ((dx * prevDx < 0) || (dy * prevDy < 0)) {
            directionChanges++
          }
          
          prevDx = dx
          prevDy = dy
        }
        
        // If many direction changes = shake
        if (directionChanges > config.mouseShake.threshold / 2) {
          if (shouldTrigger()) {
            const context = {
              type: 'mouse-shake',
              page: getPathname(),
              timestamp: now,
              directionChanges,
            }
            trackSignal('mouse-shake', context)
            onFrustration?.(context)
          }
          mouseHistory.current = []
        }
      }
    }
    
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [enabled, config.mouseShake, onFrustration, shouldTrigger, trackSignal])
  
  // Hesitation handler (no interaction for X seconds)
  useEffect(() => {
    if (!enabled) return
    
    const updateInteraction = () => {
      lastInteraction.current = Date.now()
    }
    
    // Track all interactions
    const events = ['click', 'scroll', 'mousemove', 'keydown', 'touchstart']
    events.forEach(e => document.addEventListener(e, updateInteraction, { passive: true }))
    
    // Check hesitation periodically
    const interval = setInterval(() => {
      const now = Date.now()
      const idle = now - lastInteraction.current
      
      if (idle >= config.hesitation.threshold) {
        if (shouldTrigger()) {
          const context = {
            type: 'hesitation',
            page: getPathname(),
            timestamp: now,
            idleTime: idle,
          }
          trackSignal('hesitation', context)
          onFrustration?.(context)
        }
        // Reset to avoid re-trigger
        lastInteraction.current = now
      }
    }, 1000)
    
    return () => {
      clearInterval(interval)
      events.forEach(e => document.removeEventListener(e, updateInteraction))
    }
  }, [enabled, config.hesitation, onFrustration, shouldTrigger, trackSignal])
  
  return {
    enabled,
    setEnabled,
    rageClickElement,
  }
}

// Helper: describe element for tracking
function describeElement(el) {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const classes = el.className && typeof el.className === 'string'
    ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
    : ''
  const text = el.textContent?.trim().slice(0, 50) || ''
  
  return `${tag}${id}${classes}${text ? ` "${text}"` : ''}`
}

// Expose tracking function globally for use in components
if (typeof window !== 'undefined') {
  window.trackFrustration = async (type, context) => {
    // Track to Supabase analytics_events table
    try {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.__SG_ENV__ || {}
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return
      
      await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          event_type: 'sg_frustration_detected',
          email: localStorage.getItem('sg_email') || '',
          island: localStorage.getItem('sg_region') || '',
          props: { type, ...context },
        }),
      })
    } catch (e) {
      // Silent fail
    }
  }
}
