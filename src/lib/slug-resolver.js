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
