const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'cctv_session';
const TTL_SECONDS = 60 * 60 * 12; // 12 hours

function secret() {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not set');
  }
  return process.env.SESSION_SECRET;
}

function sign(payload) {
  return jwt.sign(payload, secret(), { expiresIn: TTL_SECONDS });
}

function verify(token) {
  try {
    return jwt.verify(token, secret());
  } catch (_) {
    return null;
  }
}

function setSessionCookie(res, payload) {
  const token = sign(payload);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: TTL_SECONDS * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

/** Express middleware that populates req.user or 401s. */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'not_authenticated' });
  const claims = verify(token);
  if (!claims) return res.status(401).json({ error: 'not_authenticated' });
  req.user = claims; // { slackUserId, slackUserName, ... }
  next();
}

module.exports = { COOKIE_NAME, sign, verify, setSessionCookie, clearSessionCookie, requireAuth };
