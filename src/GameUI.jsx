import React, { useState, useEffect } from 'react';

/**
 * Interface de gestion de crise : SARGAGAME (Serious Game)
 * Rendu par-dessus la carte Leaflet existante.
 */
export default function GameUI() {
  const [budget, setBudget] = useState(36000000);
  const [h2s, setH2s] = useState(0);
  const [attractiveness, setAttractiveness] = useState(100);
  const [news, setNews] = useState("Bienvenue, Préfet. La crise commence.");

  // Connection to Python API Server
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('http://localhost:5000/state');
        const data = await res.json();
        setBudget(data.budget);
        setH2s(data.h2s);
        setAttractiveness(data.attractiveness);
        
        if (data.h2s > 80) setNews("ALERTE : Taux de H2S critique sur la côte !");
        else if (data.attractiveness < 50) setNews("Les touristes fuient l'île.");
      } catch (err) {
        console.error("API Server off", err);
      }
    };
    const timer = setInterval(fetchState, 2000);
    return () => clearInterval(timer);
  }, []);

  const deploy = async (action, cost) => {
    if (budget >= cost) {
      try {
        const res = await fetch('http://localhost:5000/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        const data = await res.json();
        if (data.success) {
          setBudget(data.budget);
          setH2s(data.h2s);
          setAttractiveness(data.attractiveness);
          setNews(`Vous avez déployé : ${action}`);
        }
      } catch (err) {
        setNews("Erreur connexion API !");
      }
    } else {
      setNews("Fonds insuffisants !");
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 20, left: 20, zIndex: 9999, 
      background: 'rgba(10, 20, 15, 0.9)', color: '#0f0', 
      padding: 20, borderRadius: 8, border: '2px solid #0f0',
      fontFamily: 'monospace', width: 300
    }}>
      <h2 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #0f0' }}>SARGAGAME CONTROL</h2>
      
      <div style={{ marginBottom: 15 }}>
        <div>BUDGET : {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(budget)}</div>
        <div>H₂S TOXICITY : <span style={{ color: h2s > 70 ? 'red' : '#0f0' }}>{h2s.toFixed(1)} ppm</span></div>
        <div>ATTRACTIVITÉ : {attractiveness.toFixed(1)}%</div>
      </div>
      
      <div style={{ background: '#000', color: '#fff', padding: 5, marginBottom: 15, minHeight: 40 }}>
        {news}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button onClick={() => deploy("Barrage", 150000)}>Déployer Barrage (-150k€)</button>
        <button onClick={() => deploy("Navire Collecteur", 500000)}>Navire Collecteur (-500k€)</button>
        <button onClick={() => deploy("Brigades Vertes", 20000)}>Brigades Vertes (-20k€)</button>
      </div>
    </div>
  );
}
