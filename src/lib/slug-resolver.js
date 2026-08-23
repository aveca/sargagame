/**
 * slug-resolver.js — Single source of truth for generating canonical slugs
 * to prevent regex drift between the SSR builder and the React frontend.
 */

export const slugify = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

export const getCanonicalSlug = (beach) => {
  if (!beach) return '';
  if (beach.slug) return beach.slug;
  return slugify(beach.name);
};

/**
 * beachPageUrl(beach) — URL ABSOLUE de la fiche SEO de la plage, région-aware.
 * Préfixe par langue de build (vérifié sur prod) : MQ/GP = /plages/,
 * régions EN = /beaches/, régions ES = /playas/. Sur le build partagé MQ/GP,
 * une plage de L'AUTRE île pointe vers le domaine partenaire (les pages de
 * l'autre île sont purgées de chaque FTP → un lien same-origin serait un 404).
 * '' si l'URL ne peut pas être construite (l'appelant garde son fallback).
 */
export const beachPageUrl = (beach) => {
  const slug = getCanonicalSlug(beach);
  if (!slug) return '';
  try {
    const R = (typeof __REGION__ !== 'undefined' && __REGION__) || null;
    const isNew = !!(R && R.id !== 'mq' && R.id !== 'gp');
    const prefix = isNew ? (R.primaryLang === 'es' ? 'playas' : 'beaches') : 'plages';
    const p = '/' + prefix + '/' + slug + '/';
    if (!isNew) {
      const onGp = (window.location.hostname || '').includes('guadeloupe');
      if (beach.island === 'gp' && !onGp) return 'https://sargasses-guadeloupe.com' + p;
      if (beach.island === 'mq' && onGp) return 'https://sargasses-martinique.com' + p;
    }
    return (window.location.origin || '') + p;
  } catch (_) { return ''; }
};
