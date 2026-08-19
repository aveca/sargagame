// getPathname.js — Shared pathname helper for GitHub Pages base path stripping
// Used by Sargasses_PROD.jsx and useFrustrationDetection.js

const _isGHPages = typeof window !== 'undefined' && location.hostname === 'aveca.github.io'
const _ghBase = '/sargagame'

export function getPathname() {
  if (typeof window === 'undefined') return '/'
  let p = window.location.pathname
  if (_isGHPages && p.indexOf(_ghBase) === 0) p = p.slice(_ghBase.length) || '/'
  return p
}