'use strict';

/**
 * Request Materials Form Builder — standalone Coolify service.
 *
 * Serves the builder SPA from ./public and proxies same-origin /api/* calls to
 * the Agri360 CRM, injecting the shared X-Builder-Key header SERVER-SIDE so the
 * browser never sees the key. Node 20 has a global fetch; express is the only
 * dependency.
 */

const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const CRM_API_BASE = (process.env.CRM_API_BASE || 'https://agri360.proagrihub.com').replace(/\/+$/, '');
const BUILDER_KEY = process.env.BUILDER_KEY || '';

// Capture the raw body for proxying (any content type) without parsing it.
app.use('/api', express.raw({ type: '*/*', limit: '25mb' }));

// Health check for Coolify
app.get('/health', (req, res) => res.status(200).send('ok'));

// Expose only NON-secret public config to the browser (never the key).
// Serves the CLIENT_PORTAL_BASE so the SPA can build the portal preview URL.
const CLIENT_PORTAL_BASE = (process.env.CLIENT_PORTAL_BASE || 'https://clientportal.proagrihub.com').replace(/\/+$/, '');
app.get('/config.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.send('window.__CLIENT_PORTAL_BASE__ = ' + JSON.stringify(CLIENT_PORTAL_BASE) + ';');
});

// Static SPA
app.use(express.static(path.join(__dirname, 'public')));

// ── Proxy: ANY /api/* -> CRM_API_BASE + same path, adding the builder key ──
app.all('/api/*', async (req, res) => {
  const target = CRM_API_BASE + req.originalUrl;

  const headers = {
    'X-Builder-Key': BUILDER_KEY,
    Accept: 'application/json',
  };

  // Preserve the incoming content-type so the CRM parses the body correctly.
  const incomingType = req.headers['content-type'];
  if (incomingType) headers['Content-Type'] = incomingType;

  const init = { method: req.method, headers };

  // Forward a body for methods that carry one.
  if (!['GET', 'HEAD'].includes(req.method) && req.body && req.body.length) {
    init.body = req.body;
  }

  try {
    const crmRes = await fetch(target, init);
    const text = await crmRes.text();
    const type = crmRes.headers.get('content-type') || 'application/json';
    res.status(crmRes.status);
    res.set('Content-Type', type);
    res.send(text);
  } catch (err) {
    console.error('CRM proxy error:', err && err.message ? err.message : err);
    res.status(502).json({ error: 'Upstream CRM request failed', detail: String(err && err.message ? err.message : err) });
  }
});

app.listen(PORT, () => {
  console.log(`Request Materials Form Builder listening on :${PORT} -> CRM ${CRM_API_BASE}`);
});
