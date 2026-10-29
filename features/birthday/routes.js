const path = require('node:path');
const express = require('express');

function createBirthdayRouter() {
  const router = express.Router();
  const assets = path.join(__dirname, '../../public/chucmungsinhnhat');
  router.use('/assets/chucmungsinhnhat', express.static(assets, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  router.get('/chucmungsinhnhat', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(assets, 'index.html'));
  });
  return router;
}

module.exports = { createBirthdayRouter };
