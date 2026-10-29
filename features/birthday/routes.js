const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

function createBirthdayRouter() {
  const router = express.Router();
  const assets = path.join(__dirname, '../../public/chucmungsinhnhat');

  // Stamp every local css/js link with a hash of its content, so a deploy never
  // pairs fresh HTML with a stylesheet the browser cached from the last one.
  const render = () => {
    const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
    return html.replace(/(\/assets\/chucmungsinhnhat\/)([\w.-]+\.(?:css|js))"/g, (match, prefix, file) => {
      const source = path.join(assets, file);
      if (!fs.existsSync(source)) return match;
      const version = crypto.createHash('sha1').update(fs.readFileSync(source)).digest('hex').slice(0, 10);
      return `${prefix}${file}?v=${version}"`;
    });
  };
  const production = process.env.NODE_ENV === 'production';
  const page = production ? render() : null;

  router.use('/assets/chucmungsinhnhat', express.static(assets, { index: false, maxAge: production ? '7d' : 0 }));
  router.get('/chucmungsinhnhat', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(page || render());
  });
  return router;
}

module.exports = { createBirthdayRouter };
