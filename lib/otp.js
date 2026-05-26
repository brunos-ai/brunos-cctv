const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

// In-memory store. Keyed by Slack user ID. On Render free tier the dyno
// may sleep and lose state -- that's fine: OTPs are short-lived anyway.
const store = new Map();

function generateCode() {
  // 6-digit numeric, no leading-zero loss
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function issue(slackUserId, slackUserName) {
  const code = generateCode();
  store.set(slackUserId, {
    code,
    slackUserName,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  return code;
}

function verify(slackUserId, code) {
  const entry = store.get(slackUserId);
  if (!entry) return { ok: false, reason: 'no_code' };
  if (Date.now() > entry.expiresAt) {
    store.delete(slackUserId);
    return { ok: false, reason: 'expired' };
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    store.delete(slackUserId);
    return { ok: false, reason: 'too_many_attempts' };
  }
  if (entry.code !== code.trim()) {
    return { ok: false, reason: 'bad_code', attemptsLeft: MAX_ATTEMPTS - entry.attempts };
  }
  store.delete(slackUserId);
  return { ok: true, slackUserName: entry.slackUserName };
}

module.exports = { issue, verify };
