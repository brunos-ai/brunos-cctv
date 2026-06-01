const fetch = require('node-fetch');

const ENDPOINT = 'https://api.monday.com/v2';

async function gql(query, variables = {}) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN is not set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error('monday.com error: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

function boardId() {
  const id = process.env.MONDAY_BOARD_ID;
  if (!id) throw new Error('MONDAY_BOARD_ID is not set');
  return id;
}

/**
 * Create an item. column_values must be JSON-stringified per Monday's API.
 * Returns the new item's id.
 */
async function createItem({ ticket, date, branch, status }) {
  const cols = {
    [process.env.MONDAY_COL_TICKET || 'ticket']: ticket,
    [process.env.MONDAY_COL_DATE || 'date']: { date }, // YYYY-MM-DD
    [process.env.MONDAY_COL_BRANCH || 'branch']: branch,
    [process.env.MONDAY_COL_STATUS || 'status']: { label: status },
  };
  // create_labels_if_missing lets the Status column accept any label we send,
  // even if a board admin hasn't pre-defined it. Means we can ship without
  // hand-curating the four status labels on the board first.
  const data = await gql(
    `mutation ($boardId: ID!, $itemName: String!, $cols: JSON!) {
       create_item(
         board_id: $boardId,
         item_name: $itemName,
         column_values: $cols,
         create_labels_if_missing: true
       ) { id }
     }`,
    { boardId: boardId(), itemName: ticket, cols: JSON.stringify(cols) }
  );
  return data.create_item.id;
}

/** Update the status column on an existing item. */
async function updateStatus(itemId, status) {
  const statusCol = process.env.MONDAY_COL_STATUS || 'status';
  const data = await gql(
    `mutation ($boardId: ID!, $itemId: ID!, $colId: String!, $val: JSON!) {
       change_column_value(
         board_id: $boardId,
         item_id: $itemId,
         column_id: $colId,
         value: $val,
         create_labels_if_missing: true
       ) { id }
     }`,
    { boardId: boardId(), itemId, colId: statusCol, val: JSON.stringify({ label: status }) }
  );
  return data.change_column_value.id;
}

/** Returns a list of column ids + titles + types on the board. Handy for setup. */
async function listColumns() {
  const data = await gql(
    `query ($boardId: [ID!]) {
       boards(ids: $boardId) {
         columns { id title type }
       }
     }`,
    { boardId: [boardId()] }
  );
  return data.boards[0].columns;
}

function itemUrl(itemId) {
  const sub = process.env.MONDAY_SUBDOMAIN; // e.g. "brunosbarbers"
  const host = sub ? `${sub}.monday.com` : 'monday.com';
  return `https://${host}/boards/${boardId()}/pulses/${itemId}`;
}

module.exports = { gql, createItem, updateStatus, listColumns, itemUrl };
