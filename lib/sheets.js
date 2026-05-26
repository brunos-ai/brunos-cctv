const { sheets } = require('./google');

const HEADER = [
  'Ticket',
  'Submitted At (Manila)',
  'Submitted By (Slack)',
  'Name',
  'Branch',
  'Incident Date',
  'Incident Time',
  'Area',
  'Event Description',
  'Person Description',
  'Signature URL',
  'Status',
  'Monday Item ID',
  'Last Updated (Manila)',
];

function sheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID is not set');
  return id;
}

function tab() {
  return process.env.GOOGLE_SHEET_TAB || 'Requests';
}

/** Ensures the tab exists and has a header row. Safe to call repeatedly. */
async function ensureHeader() {
  const api = await sheets();
  // Make sure the tab exists
  const meta = await api.spreadsheets.get({ spreadsheetId: sheetId() });
  const exists = meta.data.sheets.some((s) => s.properties.title === tab());
  if (!exists) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: { requests: [{ addSheet: { properties: { title: tab() } } }] },
    });
  }
  // Check header row
  const got = await api.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${tab()}!A1:Z1`,
  });
  const current = (got.data.values && got.data.values[0]) || [];
  if (current.length === 0) {
    await api.spreadsheets.values.update({
      spreadsheetId: sheetId(),
      range: `${tab()}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER] },
    });
  }
}

async function listRows() {
  const api = await sheets();
  const res = await api.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${tab()}!A1:Z`,
  });
  return res.data.values || [[...HEADER]];
}

async function appendRow(values) {
  const api = await sheets();
  await api.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: `${tab()}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

/**
 * Update the status (and Monday item id + last-updated) for a row matched by ticket.
 * Returns the 1-indexed row number it updated, or null if not found.
 */
async function updateRowByTicket(ticket, patch) {
  const api = await sheets();
  const rows = await listRows();
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === ticket);
  if (idx === -1) return null;

  // Build a full row from the current row, applying patches by column name.
  const row = [...rows[idx]];
  for (const [key, val] of Object.entries(patch)) {
    const col = HEADER.indexOf(key);
    if (col >= 0) row[col] = val;
  }
  const rowNum = idx + 1; // 1-indexed for the API
  await api.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${tab()}!A${rowNum}:${columnLetter(HEADER.length)}${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row.slice(0, HEADER.length)] },
  });
  return rowNum;
}

function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${sheetId()}/edit`;
}

module.exports = {
  HEADER,
  ensureHeader,
  listRows,
  appendRow,
  updateRowByTicket,
  sheetUrl,
};
