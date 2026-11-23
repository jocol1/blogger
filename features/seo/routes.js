const express = require('express');

// Public, indexable pages. Keep in step with the routers that serve them; admin, API and login paths stay out.
const PAGES = [
  { path: '/tra-da', changefreq: 'weekly', priority: '1.0' },
  { path: '/gia', changefreq: 'daily', priority: '0.8' },
  { path: '/co-tuong', changefreq: 'monthly', priority: '0.6' },
  { path: '/party', changefreq: 'monthly', priority: '0.6' },
];
const PRIVATE = ['/api/', '/tra-da/admin', '/party/admin', '/xin-tien/admin', '/admin', '/login', '/files', '/notes'];

// The canonical origin is configuration, never the Host header, so a spoofed Host cannot put another domain in the sitemap.
function createSeoRouter({ origin = process.env.PUBLIC_URL || 'https://locly.lol' } = {}) {
  const base = String(origin).replace(/\/+$/, '');
  const router = express.Router();
  const robots = ['User-agent: *', 'Allow: /', ...PRIVATE.map(p => `Disallow: ${p}`), '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(p => `  <url><loc>${base}${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
  router.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robots));
  router.get('/sitemap.xml', (req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemap));
  return router;
}

module.exports = { createSeoRouter, PAGES };
