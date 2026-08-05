import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'

const useTideTransition = (options = {}) => {
  const { duration = 800 } = options
  const [isTransitioning, setIsTransitioning] = useState(false)

  const withTransition = useCallback((callback) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setTimeout(() => {
      callback()
      setIsTransitioning(false)
    }, duration)
  }, [duration, isTransitioning])

  return { isTransitioning, withTransition }
}

const TideOverlay = ({ active }) => {
  if (!active) return null
  return (
    <div className="tide-overlay" aria-hidden="true">
      <svg className="tide-wave-svg" viewBox="0 0 1440 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tideGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0B2230" />
            <stop offset="50%" stopColor="#155A5A" />
            <stop offset="100%" stopColor="#1A5852" />
          </linearGradient>
        </defs>
        <path className="tide-wave-path"
          d="M0,200 Q360,50 720,200 T1440,200 V400 H0 Z"
          fill="url(#tideGrad)" />
      </svg>
    </div>
  )
}

export default useTideTransition
export { TideOverlay }
