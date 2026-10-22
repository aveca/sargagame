// Cloudflare Worker — Réception e-mail centralisée Factory V4
// Déploiement : wrangler deploy (après wrangler login)
// Trigger : Cloudflare Email Routing → ce Worker (alerte@ et support@)
// Stockage : Cloudflare KV (namespace EMAIL_QUEUE) — pollé par la Factory
// Traitement : Factory locale (modèles free/local) → auto-réponse via Resend API

export default {
  async email(message, env, ctx) {
    const from = message.from;
    const to = message.to;
    const subject = message.headers.get('subject') || '';
    const raw = await new Response(message.raw).text();

    // 1. Vérification anti-doublon (message-id)
    const messageId = message.headers.get('message-id') || '';
    if (messageId) {
      const existing = await env.EMAIL_QUEUE.get('msg:' + messageId);
      if (existing) {
        console.log('Doublon détecté, ignoré:', messageId);
        return;
      }
    }

    // 2. Classification simple (par destinataire et mots-clés)
    // NOTE: on ne cherche que dans le sujet + le corps texte (pas les en-têtes,
    // qui contiennent souvent "List-Unsubscribe" et déclenchent de faux positifs spam).
    const subjectLower = (subject || '').toLowerCase();
    const bodyLower = body.replace(/^[^\n]*\n/gm, '').toLowerCase(); // strip headers
    const combined = subjectLower + ' ' + bodyLower;
    let category = 'support';
    if (/prix|tarif|cost|price|devis|quote/i.test(combined)) category = 'pricing';
    if (/bug|erreur|error|problème|issue/i.test(combined)) category = 'technical';
    if (/spam|unsubscribe|remove me|désabonne/i.test(subjectLower)) category = 'spam'; // only subject
    if (/commande|order|paiement|payment/i.test(combined)) category = 'order';

    // 3. Stocker dans KV pour la Factory
    const entry = {
      id: messageId || crypto.randomUUID(),
      from, to, subject, category,
      receivedAt: new Date().toISOString(),
      raw: raw.slice(0, 5000), // cap pour KV
      status: 'pending',
      site: to.includes('bot-wow') ? 'bot-wow' : 'sargagame',
    };

    await env.EMAIL_QUEUE.put('email:' + entry.id, JSON.stringify(entry), { expirationTtl: 86400 * 7 }); // 7 jours
    await env.EMAIL_QUEUE.put('msg:' + messageId, '1', { expirationTtl: 86400 * 7 });

    // 4. Si support simple (pas de paiement/litige), auto-répondre
    if (category === 'support' || category === 'pricing') {
      // La Factory locale traitera via le polling — on ne répond pas ici
      // pour respecter le principe "les données GSC passent par les modèles locaux"
      console.log('Email queued for Factory processing:', entry.id, category);
    }

    // 5. Forward à l'adresse réelle si nécessaire
    // await message.forward('yacovassaraf@gmail.com');
  }
};
