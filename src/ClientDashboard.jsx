/**
 * ClientDashboard — Page dashboard accessible avec widget token
 * Auth: ?token=XXX (vérifie dans Supabase b2b_subscriptions)
 * Track: sg_client_dashboard_view
 */

import { useEffect, useState } from 'react';
import { supa } from '../supabasePhotos'; // reuse supabase client pattern

export default function ClientDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'widget' | 'alerts' | 'billing'>('overview');

  // Récupérer le token de l'URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const t = searchParams.get('token');
    if (!t) { setError('Token manquant'); setLoading(false); return; }
    setToken(t);
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    try {
      const rows = await supa('b2b_subscriptions', 'GET', null, `?widget_token=eq.${token}&select=*&limit=1`);
      if (!rows?.length) { setError('Token invalide'); setLoading(false); return; }
      setSub(rows[0]);
      setView('overview');
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally { setLoading(false); }
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{padding: '20px', textAlign: 'center', color: '#dc2626'}}>{error}</div>;
  if (!sub) return <div>Aucun abonnement trouvé</div>;

  // Helper: format date
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{minHeight: '100vh', background: '#f8f9fa', fontFamily: 'system-ui'}}>
      <nav style={{background: '#0d1117', padding: '16px 24px', color: '#white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h1 style={{margin: 0, color: '#0d7f63'}}>
          {view === 'overview' ? 'Dashboard SargaGame' : 'Widget'}
        </h1>
        <span style={{fontSize: '12px', color: '#888'}}>
          {sub.plan} · {sub.region} · {sub.status}
        </span>
      </nav>

      <main style={{padding: '24px', maxWidth: '800px', margin: '0 auto'}}>

        {/* Vue aperçu */}
        {view === 'overview' && (
          <div style={{marginBottom: '32px', padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}>
            <h2 style={{color: '#0d7f63', marginTop: 0}}>Subscription Details</h2>
            <p><strong>Plan:</strong> {sub.plan}</p>
            <p><strong>Region:</strong> {sub.region}</p>
            <p><strong>Domain:</strong> {sub.domain}</p>
            <p><strong>Status:</strong> {sub.status}</p>
            <p><strong>Since:</strong> {fmtDate(sub.created_at)}</p>
            <iframe
              src={`https://${sub.domain}/widget?token=${token}`}
              width="100%" height="260"
              style={{border: 'none', margin: '16px 0'}}
              frameBorder="0"
            />
            <div style={{marginTop: '16px'}}>
              <button
                onClick={() => setView('widget')}
                style={{display: 'inline-block', background: '#FFC72C', color: '#0d1117', padding: '10px 24px', borderRadius: '999px', fontWeight: '700', textDecoration: 'none', fontSize: '14px'}}
              >
                View Widget Code
              </button>
            </div>
          </div>
        )}

        {/* Vue widget */}
        {view === 'widget' && (
          <div style={{marginBottom: '32px', padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}>
            <h2 style={{color: '#0d7f63', marginTop: 0}}>Widget Integration Code</h2>
            <code style={{background: '#f1f8ff', padding: '12px 16px', borderRadius: '6px', fontFamily: 'monospace', overflowX: 'auto', fontSize: '13px'}}>
              <iframe src="https://${sub.domain}/widget?token={token}" width="100%" height="320" frameborder="0"></code>
            </code>
            <p style={{marginTop: '12px', fontSize: '12px', color: '#666'}>
              Copy the code above and paste it into your website.
            </p>
            <button
              onClick={() => setView('overview')}
              style={{display: 'inline-block', background: '#0d7f63', color: 'white', padding: '10px 24px', borderRadius: '999px', fontWeight: '700', textDecoration: 'none', fontSize: '14px', marginLeft: '8px'}}
            >
              Back to Overview
            </button>
          </div>
        )}

        {/* Vue alertes */}
        {view === 'alerts' && (
          <div style={{marginBottom: '32px', padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}>
            <h2 style={{color: '#0d7f63', marginTop: 0}}>Alertes Widget</h2>
            <p>Widget alerts configuration would go here.</p>
          </div>
        )}

        {/* Vue facturation */}
        {view === 'billing' && (
          <div style={{marginBottom: '32px', padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}>
            <h2 style={{color: '#0d7f63', marginTop: 0}}>Billing & Mollie</h2>
            <p>Mollie dashboard: <a href="https://www.mollie.com/dashboard" target="_blank" style={{color: '#0d7f63', textDecoration: 'none'}}>
              Mollie Dashboard
            </a></p>
            <p>Invoice history would be displayed here.</p>
            <button
              onClick={() => window.open('https://www.mollie.com/dashboard', '_blank')}
              style={{display: 'inline-block', background: '#036efc', color: 'white', padding: '10px 24px', borderRadius: '999px', fontWeight: '700', textDecoration: 'none', fontSize: '14px'}}
            >
              Open Mollie Dashboard
            </button>
            <button
              onClick={() => setView('overview')}
              style={{display: 'inline-block', background: '#FFC72C', color: '#0d1117', padding: '10px 24px', borderRadius: '999px', fontWeight: '700', textDecoration: 'none', fontSize: '14px', marginLeft: '8px'}}
            >
              Back to Overview
            </button>
          </div>
        )}

        {/* Bouton annuler */}
        {view !== 'billing' && (
          <div style={{marginTop: '32px', padding: '16px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to cancel your subscription?')) {
                  // TODO: call Mollie cancel webhook or Supabase update
                  setView('overview');
                }
              }}
              style={{
                width: '100%', marginTop: '8px',
                background: '#dc2626', color: 'white', padding: '12px',
                borderRadius: '6px', fontWeight: '700', border: 'none', cursor: 'pointer'
              }}
            >
              Cancel Subscription
            </button>
          </div>
        )}

      </main>
    </div>
  );
}