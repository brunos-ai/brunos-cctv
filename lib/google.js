const { google } = require('googleapis');

let authPromise = null;

function getAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      const scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ];
      const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      if (json && json.trim().startsWith('{')) {
        const creds = JSON.parse(json);
        // PEM newlines often arrive as literal \n when pasted into env vars.
        if (creds.private_key && creds.private_key.includes('\\n')) {
          creds.private_key = creds.private_key.replace(/\\n/g, '\n');
        }
        return new google.auth.GoogleAuth({ credentials: creds, scopes });
      }
      // Fall back to GOOGLE_APPLICATION_CREDENTIALS file path
      return new google.auth.GoogleAuth({ scopes });
    })();
  }
  return authPromise;
}

async function sheets() {
  return google.sheets({ version: 'v4', auth: await getAuth() });
}

async function drive() {
  return google.drive({ version: 'v3', auth: await getAuth() });
}

module.exports = { getAuth, sheets, drive };
