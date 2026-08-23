// GA4 Ecommerce Helper — funnel complet B2C + B2B
// Usage: import { ga4 } from './ga4-ecommerce.js'; ga4.purchase({...})

const GA4_MEASUREMENT_ID = 'G-V8JGMDZZ2Y'; // MQ/GP
const GA4_API_SECRET = 'eFHMRr4tQ-2B-JYidixOSA';

// Session ID persistant anonyme (stocké en localStorage)
function getSessionId() {
  let sid = localStorage.getItem('sg_sid');
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('sg_sid', sid);
  }
  return sid;
}

// User ID seulement après achat (premium activé)
function getUserId() {
  const isPremium = localStorage.getItem('sg_premium') === '1' ||
                    parseInt(localStorage.getItem('sg_premium_pass_end') || '0') > Date.now();
  if (isPremium) {
    let uid = localStorage.getItem('sg_uid');
    if (!uid) {
      uid = 'usr_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('sg_uid', uid);
    }
    return uid;
  }
  return undefined;
}

// Client ID GA4 (depuis cookie _ga)
function getClientId() {
  const match = document.cookie.match(/_ga=GA\d+\.\d+\.(\d+\.\d+)/);
  return match ? match[1] : 'a.' + Date.now();
}

// Envoie via gtag (si dispo) + Measurement Protocol (fallback DMA)
function sendGA4(eventName, params) {
  const payload = {
    client_id: getClientId(),
    session_id: getSessionId(),
    user_id: getUserId(),
    events: [{
      name: eventName,
      params: {
        ...params,
        currency: 'EUR',
        region: window.location.hostname.includes('guadeloupe') ? 'GP' : 'MQ'
      }
    }]
  };

  // 1. gtag.js (primary)
  if (typeof window.gtag === 'function') {
    try { window.gtag('event', eventName, payload.events[0].params); } catch (_) {}
  }

  // 2. Measurement Protocol direct (bypass DMA block)
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`,
        JSON.stringify(payload)
      );
    }
  } catch (_) {}
}

// 1. view_item_list — liste de plages (carte, liste, home)
export function viewItemList(beaches, listName, listId) {
  sendGA4('view_item_list', {
    item_list_id: listId,
    item_list_name: listName,
    items: beaches.slice(0, 20).map((b, idx) => ({
      item_id: b.id,
      item_name: b.name || `Plage ${b.id}`,
      item_category: 'beach',
      item_variant: b.status || 'unknown', // clean/moderate/alert
      price: 0,
      currency: 'EUR',
      index: idx
    }))
  });
}

// 2. view_item — fiche plage (verdict)
export function viewItem(beach) {
  sendGA4('view_item', {
    currency: 'EUR',
    value: 0,
    items: [{
      item_id: beach.id,
      item_name: beach.name || `Plage ${beach.id}`,
      item_category: 'beach',
      item_variant: beach.status || 'unknown',
      price: 0,
      currency: 'EUR'
    }]
  });
}

// 3. begin_checkout — ouverture paywall / clic CTA vers checkout
export function beginCheckout(plan, source, value, currency = 'EUR') {
  sendGA4('begin_checkout', {
    currency,
    value,
    items: [{
      item_id: plan,
      item_name: plan === 'pro_monthly' ? 'Pro Mensuel' :
               plan === 'pro_annual' ? 'Pro Annuel' :
               plan === 'brief_monthly' ? 'Brief Mensuel' :
               `Pass ${plan}`,
      item_category: plan.startsWith('pro_') || plan.startsWith('brief_') ? 'subscription' : 'pass',
      price: value,
      quantity: 1
    }],
    checkout_source: source, // 'paywall', 'beach_list', 'map', 'comic', etc.
    session_id: getSessionId()
  });
}

// 4. add_payment_info — sélection méthode de paiement
export function addPaymentInfo(method, plan, value, currency = 'EUR') {
  sendGA4('add_payment_info', {
    currency,
    value,
    payment_type: method, // 'mollie_onsite', 'paypal', 'apple_pay', 'google_pay', 'card'
    items: [{
      item_id: plan,
      item_name: plan === 'pro_monthly' ? 'Pro Mensuel' :
               plan === 'pro_annual' ? 'Pro Annuel' :
               plan === 'brief_monthly' ? 'Brief Mensuel' :
               `Pass ${plan}`,
      item_category: plan.startsWith('pro_') || plan.starts_with('brief_') ? 'subscription' : 'pass',
      price: value,
      quantity: 1
    }],
    session_id: getSessionId()
  });
}

// 5. purchase — paiement réussi (conversion)
export function purchase(transactionId, plan, value, currency = 'EUR', paymentMethod) {
  const userId = getUserId();
  sendGA4('purchase', {
    transaction_id: transactionId,
    currency,
    value,
    items: [{
      item_id: plan,
      item_name: plan === 'pro_monthly' ? 'Pro Mensuel' :
               plan === 'pro_annual' ? 'Pro Annuel' :
               plan === 'brief_monthly' ? 'Brief Mensuel' :
               `Pass ${plan}`,
      item_category: plan.startsWith('pro_') || plan.startsWith('brief_') ? 'subscription' : 'pass',
      price: value,
      quantity: 1
    }],
    payment_method: paymentMethod,
    user_id: userId,
    session_id: getSessionId()
  });
}

// 6. refund — remboursement / échec / annulation
export function refund(transactionId, plan, value, currency = 'EUR', reason) {
  sendGA4('refund', {
    transaction_id: transactionId,
    currency,
    value,
    items: [{
      item_id: plan,
      item_name: plan === 'pro_monthly' ? 'Pro Mensuel' :
               plan === 'pro_annual' ? 'Pro Annuel' :
               plan === 'brief_monthly' ? 'Brief Mensuel' :
               `Pass ${plan}`,
      item_category: plan.startsWith('pro_') || plan.startsWith('brief_') ? 'subscription' : 'pass',
      price: value,
      quantity: 1
    }],
    refund_reason: reason, // 'payment_failed', 'cancelled', 'chargeback', 'webhook_replay'
    session_id: getSessionId()
  });
}

// 7. select_item — clic sur une plage depuis une liste (carte, liste)
export function selectItem(beach, listName) {
  sendGA4('select_item', {
    item_list_name: listName,
    items: [{
      item_id: beach.id,
      item_name: beach.name || `Plage ${beach.id}`,
      item_category: 'beach',
      item_variant: beach.status || 'unknown'
    }]
  });
}

// 8. view_promotion — affichage promo (ex: garantie 14j, trial 30j)
export function viewPromotion(promoName, creativeName) {
  sendGA4('view_promotion', {
    promotion_id: promoName,
    promotion_name: promoName,
    creative_name: creativeName,
    creative_slot: 'paywall'
  });
}

// 9. select_promotion — clic sur promo (ex: "Essayer 30 jours gratuit")
export function selectPromotion(promoName, creativeName) {
  sendGA4('select_promotion', {
    promotion_id: promoName,
    promotion_name: promoName,
    creative_name: creativeName,
    creative_slot: 'paywall'
  });
}

// Helpers pour plans B2C/B2B
export const PLAN_META = {
  // B2C passes (EUR)
  p30: { name: 'Pass 30 jours', price: 14.99, category: 'pass', currency: 'EUR', days: 30 },
  trip7: { name: 'Pass 7 jours', price: 4.99, category: 'pass', currency: 'EUR', days: 7 },
  season: { name: 'Pass Saison', price: 19.99, category: 'pass', currency: 'EUR', days: 210 },
  p7: { name: 'Pass 7 jours', price: 7.99, category: 'pass', currency: 'EUR', days: 7 },
  // B2C passes (USD)
  p30_usd: { name: '30-Day Pass', price: 11.99, category: 'pass', currency: 'USD', days: 30 },
  trip7_usd: { name: '7-Day Pass', price: 5.99, category: 'pass', currency: 'USD', days: 7 },
  // B2B
  pro_monthly: { name: 'Pro Mensuel', price: 79.00, category: 'subscription', currency: 'EUR', interval: 'month' },
  pro_annual: { name: 'Pro Annuel', price: 690.00, category: 'subscription', currency: 'EUR', interval: 'year' },
  brief_monthly: { name: 'Brief Mensuel', price: 29.00, category: 'subscription', currency: 'EUR', interval: 'month' },
};

export function getPlanMeta(planKey, currency = 'EUR') {
  const key = currency === 'USD' && PLAN_META[planKey + '_usd'] ? planKey + '_usd' : planKey;
  return PLAN_META[key] || { name: planKey, price: 0, category: 'unknown', currency };
}

export default {
  viewItemList,
  viewItem,
  beginCheckout,
  addPaymentInfo,
  purchase,
  refund,
  selectItem,
  viewPromotion,
  selectPromotion,
  getPlanMeta,
  getSessionId,
  getUserId
};