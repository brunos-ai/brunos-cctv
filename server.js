// Force Asia/Manila as the process TZ. This affects logs and any code that
// accidentally formats dates without specifying timeZone. All user-facing
// strings should still go through lib/timezone.js to be explicit.
process.env.TZ = 'Asia/Manila';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const requestRoutes = require('./routes/requests');
const { ensureHeader } = require('./lib/sheets');

const app = express();

// Body parser with a higher limit so signature PNGs (base64) fit.
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);

// Health check (Render uses this to confirm the service is up)
app.get('/healthz', (_req, res) => res.json({ ok: true, tz: process.env.TZ }));

// SPA-ish fallback: serve index.html for unknown GETs
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`CCTV form listening on :${PORT} (TZ=${process.env.TZ})`);
  // Best-effort: ensure the Sheet has the right header. Don't crash if it fails
  // -- the user might still be configuring credentials.
  try {
    await ensureHeader();
    console.log('Google Sheet header verified.');
  } catch (e) {
    console.warn('Could not verify Sheet header:', e.message);
  }
});
