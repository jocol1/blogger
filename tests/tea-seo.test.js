const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createSeoRouter, PAGES } = require('../features/seo/routes');

const html = fs.readFileSync(path.join(__dirname, '../public/tea/index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const tag = (re) => (head.match(re) || [])[1];

test('the café page has a Vietnamese title, description, canonical and social preview', () => {
  const title = tag(/<title>([^<]+)<\/title>/), desc = tag(/<meta name="description" content="([^"]+)"/);
  assert.ok(title && title.length <= 65, `title length ${title?.length}`); assert.match(title, /trà đá/i);
  assert.ok(desc && desc.length >= 70 && desc.length <= 160, `description length ${desc?.length}`);
  assert.equal(tag(/<link rel="canonical" href="([^"]+)"/), 'https://locly.lol/tra-da');
  assert.match(head, /<meta name="robots" content="index,follow/);
  for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:locale']) assert.match(head, new RegExp(`property="${p}"`));
  assert.match(head, /name="twitter:card" content="summary_large_image"/);
  const image = tag(/property="og:image" content="([^"]+)"/);
  assert.ok(fs.existsSync(path.join(__dirname, '../public/tea', path.basename(image))), 'og image file exists');
  assert.equal((head.match(/<title>/g) || []).length, 1);
});

test('structured data is valid JSON describing a free web app', () => {
  const ld = JSON.parse(tag(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
  assert.equal(ld['@type'], 'WebApplication'); assert.equal(ld.offers.price, '0'); assert.deepEqual(ld.inLanguage, ['vi', 'en']);
  assert.equal(ld.url, 'https://locly.lol/tra-da');
});

test('people without JavaScript still get real text and links', () => {
  assert.match(html, /<noscript>[\s\S]*<h1>[\s\S]*href="\/gia"[\s\S]*<\/noscript>/);
});

test('robots.txt and sitemap.xml use the configured origin and keep private paths out', async () => {
  const app = express(); app.use(createSeoRouter({ origin: 'https://example.test/' }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const robots = await (await fetch(base + '/robots.txt', { headers: { Host: 'evil.test' } })).text();
    assert.match(robots, /Sitemap: https:\/\/example\.test\/sitemap\.xml/); assert.match(robots, /Disallow: \/tra-da\/admin/); assert.match(robots, /Disallow: \/api\//);
    const res = await fetch(base + '/sitemap.xml', { headers: { Host: 'evil.test' } });
    assert.match(res.headers.get('content-type'), /xml/); const xml = await res.text();
    for (const page of PAGES) assert.ok(xml.includes(`<loc>https://example.test${page.path}</loc>`), page.path);
    assert.doesNotMatch(xml, /evil\.test|admin/);
  } finally { server.close(); }
});
