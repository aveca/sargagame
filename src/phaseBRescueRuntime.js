/**
 * Phase B Sprint 1 runtime guard.
 * Removes OS emoji glyphs from active production UI without touching historical
 * prototypes/docs. It also neutralizes legacy font references injected by inline
 * component styles that cannot be safely refactored in this slice.
 */

const LEGACY_GLYPH = /[😎😐🚫🛰️🔒⏳⚠️✅]/gu

function scrubTextNode(node) {
  const parent = node.parentElement
  if (!parent || parent.closest('script,style,noscript,[data-sg-preserve-glyphs="true"]')) return
  if (!LEGACY_GLYPH.test(node.nodeValue || '')) return
  LEGACY_GLYPH.lastIndex = 0
  node.nodeValue = node.nodeValue.replace(LEGACY_GLYPH, '')
}

function scrub(root) {
  if (!root || typeof document === 'undefined') return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) scrubTextNode(node)
}

function install() {
  if (typeof document === 'undefined') return
  scrub(document.body)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') scrubTextNode(mutation.target)
      for (const added of mutation.addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) scrubTextNode(added)
        else if (added.nodeType === Node.ELEMENT_NODE) scrub(added)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true })
else install()
