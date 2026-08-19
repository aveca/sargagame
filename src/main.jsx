import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import MapSkeleton from './components/MapSkeleton.jsx'

const App = lazy(() => import('./Sargasses_PROD.jsx'))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<MapSkeleton />}>
      <App />
    </Suspense>
  </React.StrictMode>
)

// RUM Core Web Vitals → GA4, hors chemin critique : import différé à l'idle pour que
// web-vitals parte dans un chunk LAZY séparé (zéro impact bundle d'entrée / first paint).
const startVitals = () =>
  import('./perf-vitals.js').then((m) => m.initVitals()).catch(() => {})
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) requestIdleCallback(startVitals, { timeout: 4000 })
  else setTimeout(startVitals, 2500)
}
