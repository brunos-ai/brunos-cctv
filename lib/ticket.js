const { manilaDateCompact } = require('./timezone');

// Daily counter held in memory + persisted via the Google Sheet count.
// Simple approach: read current row count for today's date and increment.

const { listRows } = require('./sheets');

/**
 * Generates a ticket number like CCTV-20260519-0001.
 * Uses the Google Sheet as the source of truth -- counts how many tickets
 * already exist for today's Manila date and adds one.
 */
async function generateTicketNumber() {
  const today = manilaDateCompact();
  const rows = await listRows();
  // rows[0] is the header. Each row's ticket col is index 0.
  const todaysCount = rows
    .slice(1)
    .filter((r) => (r[0] || '').startsWith(`CCTV-${today}-`)).length;
  const seq = String(todaysCount + 1).padStart(4, '0');
  return `CCTV-${today}-${seq}`;
}

module.exports = { generateTicketNumber };
