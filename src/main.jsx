import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './Sargasses_PROD.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// ── Prefetch perf : les chunks ci-dessous sont lazy (sortis du chunk d'entrée pour
// alléger le 1er paint), mais certains sont quasi-certains d'être affichés. On les
// précharge au bon moment pour que le lazy n'ajoute AUCUNE latence perçue.
// Même spécificateur que les import() de Sargasses_PROD → Vite dédoublonne (1 seul chunk).
try {
  // La CARTE est le 1er écran : on la réchauffe DÈS que l'entrée est parsée (en parallèle
  // du mount React) → elle est en cache avant que l'app en ait besoin.
  import('./WorldMapView').catch(() => {})
  // Chunks « probables au prochain tap » : réchauffés à l'idle, après le 1er paint, pour
  // ne pas concurrencer le chemin critique. Tap fiche/premium ⇒ instantané.
  const warm = () => {
    import('./PremiumModal.jsx').catch(() => {})
    import('./ChasseHome').catch(() => {})
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 4000 })
  else setTimeout(warm, 2500)
} catch (_) {}
