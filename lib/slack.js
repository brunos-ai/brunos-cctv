const { WebClient } = require('@slack/web-api');

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.SLACK_BOT_TOKEN) {
      throw new Error('SLACK_BOT_TOKEN is not set');
    }
    client = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return client;
}

/**
 * Look up a Slack user by their display name or real name.
 * Returns the user object or null if not found.
 * Note: requires the bot to have `users:read` scope.
 */
async function findUserByName(name) {
  const slack = getClient();
  const needle = name.trim().toLowerCase().replace(/^@/, '');
  let cursor;
  do {
    const res = await slack.users.list({ cursor, limit: 200 });
    for (const u of res.members) {
      if (u.deleted || u.is_bot) continue;
      const candidates = [
        u.name,
        u.profile && u.profile.display_name,
        u.profile && u.profile.display_name_normalized,
        u.profile && u.profile.real_name,
        u.profile && u.profile.real_name_normalized,
      ].filter(Boolean).map((s) => s.toLowerCase());
      if (candidates.includes(needle)) return u;
    }
    cursor = res.response_metadata && res.response_metadata.next_cursor;
  } while (cursor);
  return null;
}

/** DM a user a one-time code. */
async function sendOtpDm(slackUserId, code) {
  const slack = getClient();
  await slack.chat.postMessage({
    channel: slackUserId,
    text: `Your Bruno's CCTV request form login code is *${code}*.\nIt expires in 10 minutes. If you didn't request this, ignore this message.`,
  });
}

/** Post a new-request notification to the configured channel. */
async function postNewRequest({ ticket, name, branch, area, time, eventDesc, personDesc, status, sheetUrl, mondayUrl }) {
  const channel = process.env.SLACK_NOTIFY_CHANNEL;
  if (!channel) return; // user said they'd fill this in later -- skip silently

  const slack = getClient();
  await slack.chat.postMessage({
    channel,
    text: `New CCTV request ${ticket} from ${name} (${branch})`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `New CCTV Request: ${ticket}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Requester:*\n${name}` },
          { type: 'mrkdwn', text: `*Branch:*\n${branch}` },
          { type: 'mrkdwn', text: `*Incident time:*\n${time}` },
          { type: 'mrkdwn', text: `*Area:*\n${area}` },
          { type: 'mrkdwn', text: `*Status:*\n${status}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Event:*\n${eventDesc}\n\n*Person involved:*\n${personDesc}` },
      },
      {
        type: 'context',
        elements: [
          ...(sheetUrl ? [{ type: 'mrkdwn', text: `<${sheetUrl}|Open Sheet>` }] : []),
          ...(mondayUrl ? [{ type: 'mrkdwn', text: `<${mondayUrl}|Open Monday>` }] : []),
        ],
      },
    ],
  });
}

/** Post a status-change notification. */
async function postStatusChange({ ticket, name, oldStatus, newStatus }) {
  const channel = process.env.SLACK_NOTIFY_CHANNEL;
  if (!channel) return;
  const slack = getClient();
  await slack.chat.postMessage({
    channel,
    text: `${ticket} status: ${oldStatus} -> ${newStatus} (updated by ${name})`,
  });
}

module.exports = {
  findUserByName,
  sendOtpDm,
  postNewRequest,
  postStatusChange,
};
