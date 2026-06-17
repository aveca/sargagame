import React from 'react';
import './Dock.css';

/**
 * Dock — Sélecteur de profondeur (FAR / MID / PREMIUM)
 * Style : Glassmorphism flottant en bas de l'écran.
 */
export default function Dock({ activeLayer, onShowMap, onShowBeaches, openPremium, lang = "fr" }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  
  const T = {
    fr: { map: "Carte", beaches: "Plages", alert: "Veilleur" },
    en: { map: "Map", beaches: "Beaches", alert: "Watchman" },
    es: { map: "Mapa", beaches: "Playas", alert: "Vigía" }
  };
  const labels = T[lang] || T.fr;

  return (
    <div className="sg-dock-container">
      <div className="sg-dock-glass">
        
        <button 
          className={`sg-dock-btn ${activeLayer === 'map' ? 'active' : ''}`}
          onClick={onShowMap}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
            <line x1="9" y1="3" x2="9" y2="18"></line>
            <line x1="15" y1="6" x2="15" y2="21"></line>
          </svg>
          <span className="sg-dock-label">{labels.map}</span>
        </button>
        
        <button 
          className={`sg-dock-btn ${activeLayer === 'beaches' ? 'active' : ''}`}
          onClick={onShowBeaches}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span className="sg-dock-label">{labels.beaches}</span>
        </button>

        <div className="sg-dock-divider" />

        <button 
          className="sg-dock-btn sg-dock-premium"
          onClick={() => openPremium('nav_dock')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
          </svg>
          <span className="sg-dock-label">{labels.alert}</span>
        </button>

      </div>
    </div>
  );
}
