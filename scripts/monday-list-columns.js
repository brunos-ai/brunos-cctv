#!/usr/bin/env node
// Lists the column IDs on your Monday.com board so you can fill in the
// MONDAY_COL_* env vars. Run after MONDAY_API_TOKEN and MONDAY_BOARD_ID
// are set in your .env:
//
//   node scripts/monday-list-columns.js

require('dotenv').config();
const { listColumns } = require('../lib/monday');

(async () => {
  try {
    const cols = await listColumns();
    const widths = { id: 4, title: 5, type: 4 };
    cols.forEach((c) => {
      widths.id = Math.max(widths.id, c.id.length);
      widths.title = Math.max(widths.title, c.title.length);
      widths.type = Math.max(widths.type, c.type.length);
    });
    const pad = (s, w) => String(s).padEnd(w, ' ');
    console.log(`${pad('id', widths.id)}  ${pad('title', widths.title)}  ${pad('type', widths.type)}`);
    console.log(`${'-'.repeat(widths.id)}  ${'-'.repeat(widths.title)}  ${'-'.repeat(widths.type)}`);
    cols.forEach((c) => {
      console.log(`${pad(c.id, widths.id)}  ${pad(c.title, widths.title)}  ${pad(c.type, widths.type)}`);
    });
    console.log('\nCopy the IDs that match your Ticket/Date/Branch/Status columns into .env.');
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
})();
