// All date logic forces Asia/Manila (UTC+8) regardless of the server's TZ.
// Never use `new Date().toLocaleString()` without an explicit timeZone option.

const TZ = 'Asia/Manila';

/** Returns the current Date object (UTC under the hood -- timezone is a display concern). */
function nowUtc() {
  return new Date();
}

/** Format a Date in Manila time as "YYYY-MM-DD HH:mm:ss" (24-hour). */
function formatManila(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** YYYY-MM-DD in Manila time. */
function manilaDate(date = new Date()) {
  return formatManila(date).slice(0, 10);
}

/** HH:mm in Manila time. */
function manilaTime(date = new Date()) {
  return formatManila(date).slice(11, 16);
}

/** Compact YYYYMMDD for ticket numbers. */
function manilaDateCompact(date = new Date()) {
  return manilaDate(date).replace(/-/g, '');
}

module.exports = {
  TZ,
  nowUtc,
  formatManila,
  manilaDate,
  manilaTime,
  manilaDateCompact,
};
