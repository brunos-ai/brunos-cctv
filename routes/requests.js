const express = require('express');
const router = express.Router();

const { requireAuth } = require('../lib/session');
const { generateTicketNumber } = require('../lib/ticket');
const { appendRow, listRows, updateRowByTicket, sheetUrl, HEADER } = require('../lib/sheets');
const { uploadSignaturePng } = require('../lib/drive');
const { createItem, updateStatus, itemUrl } = require('../lib/monday');
const slackLib = require('../lib/slack');
const { formatManila, manilaDate } = require('../lib/timezone');

const VALID_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

function rowsToObjects(rows) {
  const [header, ...body] = rows;
  return body.map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] || ''; });
    return obj;
  });
}

// GET /api/requests  -- list requests submitted by the current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await listRows();
    const all = rowsToObjects(rows);
    const mine = all.filter((r) => r['Submitted By (Slack)'] === req.user.slackUserName);
    res.json({ requests: mine.reverse() });
  } catch (err) {
    console.error('GET /requests error:', err);
    res.status(500).json({ error: 'internal_error', detail: String(err.message || err) });
  }
});

// POST /api/requests  -- create a new CCTV request
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      name,           // requester full name
      branch,         // branch name
      incidentDate,   // YYYY-MM-DD (Manila)
      incidentTime,   // HH:mm (24h, Manila)
      area,           // area within the branch
      eventDesc,      // description of event
      personDesc,     // description of person involved
      signatureDataUrl, // "data:image/png;base64,...."
      status,         // initial status -- usually "Open"
    } = req.body || {};

    // Validate
    const missing = [];
    for (const [k, v] of Object.entries({
      name, branch, incidentDate, incidentTime, area, eventDesc, personDesc, signatureDataUrl,
    })) {
      if (!v || typeof v !== 'string' || !v.trim()) missing.push(k);
    }
    if (missing.length) {
      return res.status(400).json({ error: 'missing_fields', fields: missing });
    }
    const finalStatus = VALID_STATUSES.includes(status) ? status : 'Open';

    // Decode signature
    const m = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!m) {
      return res.status(400).json({ error: 'invalid_signature' });
    }
    const sigBuffer = Buffer.from(m[1], 'base64');

    const ticket = await generateTicketNumber();
    const submittedAt = formatManila();
    const submittedBy = req.user.slackUserName;

    // 1) Upload signature
    const sigUrl = await uploadSignaturePng(sigBuffer, `${ticket}-signature.png`);

    // 2) Append row in Sheet
    await appendRow([
      ticket,
      submittedAt,
      submittedBy,
      name,
      branch,
      incidentDate,
      incidentTime,
      area,
      eventDesc,
      personDesc,
      sigUrl,
      finalStatus,
      '', // monday item id -- filled in below
      submittedAt,
    ]);

    // 3) Create Monday.com item (ticket / date / branch / status)
    let mondayItemId = '';
    let mondayLink = '';
    try {
      mondayItemId = await createItem({
        ticket,
        date: incidentDate,
        branch,
        status: finalStatus,
      });
      mondayLink = itemUrl(mondayItemId);
      // Write back the item id
      await updateRowByTicket(ticket, { 'Monday Item ID': mondayItemId });
    } catch (e) {
      console.error('Monday create failed (continuing):', e.message);
    }

    // 4) Slack notification
    try {
      await slackLib.postNewRequest({
        ticket,
        name,
        branch,
        area,
        time: `${incidentDate} ${incidentTime}`,
        eventDesc,
        personDesc,
        status: finalStatus,
        sheetUrl: sheetUrl(),
        mondayUrl: mondayLink,
      });
    } catch (e) {
      console.error('Slack post failed (continuing):', e.message);
    }

    res.json({
      ok: true,
      ticket,
      submittedAt,
      mondayItemId,
      signatureUrl: sigUrl,
      status: finalStatus,
    });
  } catch (err) {
    console.error('POST /requests error:', err);
    res.status(500).json({ error: 'internal_error', detail: String(err.message || err) });
  }
});

// PATCH /api/requests/:ticket/status  { status }
router.patch('/:ticket/status', requireAuth, async (req, res) => {
  try {
    const { ticket } = req.params;
    const { status } = req.body || {};
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'invalid_status', allowed: VALID_STATUSES });
    }

    // Look up the row to make sure the user owns it (or is staff -- adjust as needed)
    const rows = await listRows();
    const all = rowsToObjects(rows);
    const row = all.find((r) => r['Ticket'] === ticket);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (row['Submitted By (Slack)'] !== req.user.slackUserName) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const oldStatus = row['Status'];
    const now = formatManila();

    await updateRowByTicket(ticket, {
      Status: status,
      'Last Updated (Manila)': now,
    });

    if (row['Monday Item ID']) {
      try {
        await updateStatus(row['Monday Item ID'], status);
      } catch (e) {
        console.error('Monday status update failed (continuing):', e.message);
      }
    }

    try {
      await slackLib.postStatusChange({
        ticket, name: row['Name'], oldStatus, newStatus: status,
      });
    } catch (e) {
      console.error('Slack status post failed:', e.message);
    }

    res.json({ ok: true, ticket, status });
  } catch (err) {
    console.error('PATCH status error:', err);
    res.status(500).json({ error: 'internal_error', detail: String(err.message || err) });
  }
});

// GET /api/requests/today-date  -- handy endpoint so the form prefills with Manila date
router.get('/today-date', requireAuth, (req, res) => {
  res.json({ date: manilaDate() });
});

module.exports = router;
