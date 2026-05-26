const express = require('express');
const router = express.Router();

const { findUserByName, sendOtpDm } = require('../lib/slack');
const otp = require('../lib/otp');
const { setSessionCookie, clearSessionCookie } = require('../lib/session');

// POST /api/auth/request-otp  { slackName }
router.post('/request-otp', async (req, res) => {
  try {
    const { slackName } = req.body || {};
    if (!slackName || typeof slackName !== 'string') {
      return res.status(400).json({ error: 'slackName_required' });
    }
    const user = await findUserByName(slackName);
    if (!user) {
      // Don't leak which names exist -- but for an internal tool the friendlier
      // error is more useful. Adjust if you want to harden against enumeration.
      return res.status(404).json({ error: 'user_not_found' });
    }
    const code = otp.issue(user.id, user.profile.display_name || user.name);
    await sendOtpDm(user.id, code);
    return res.json({
      ok: true,
      slackUserId: user.id,
      message: 'Code sent via Slack DM. Check your Slack.',
    });
  } catch (err) {
    console.error('request-otp error:', err);
    return res.status(500).json({ error: 'internal_error', detail: String(err.message || err) });
  }
});

// POST /api/auth/verify-otp  { slackUserId, code }
router.post('/verify-otp', async (req, res) => {
  try {
    const { slackUserId, code } = req.body || {};
    if (!slackUserId || !code) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const result = otp.verify(slackUserId, code);
    if (!result.ok) {
      return res.status(401).json({ error: result.reason, attemptsLeft: result.attemptsLeft });
    }
    setSessionCookie(res, {
      slackUserId,
      slackUserName: result.slackUserName,
    });
    return res.json({ ok: true, slackUserName: result.slackUserName });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: 'internal_error', detail: String(err.message || err) });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const { requireAuth } = require('../lib/session');
  requireAuth(req, res, () => {
    res.json({ user: req.user });
  });
});

module.exports = router;
