/**
 * slug-resolver.cjs — CommonJS version of the slug resolver
 * used by build scripts to maintain parity with the frontend.
 */

const slugify = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

const getCanonicalSlug = (beach) => {
  if (!beach) return '';
  if (beach.slug) return beach.slug;
  return slugify(beach.name);
};

module.exports = {
  slugify,
  getCanonicalSlug
};
