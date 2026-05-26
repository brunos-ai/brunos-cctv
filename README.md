# Bruno's Barbers — CCTV Footage Request Form

A self-hosted CCTV footage request app. Slack-authenticated, Google Sheets as the database, Monday.com for ticket tracking, Slack messages on new requests. All times in Asia/Manila (UTC+8).

## What it does

1. Staff visit the URL and sign in with their Slack username.
2. The bot DMs them a 6-digit code; they paste it back to log in.
3. They fill out a CCTV footage request: name, branch, incident date/time, area, event description, person description, drawn signature, and an initial status.
4. On submit the app:
   - Generates a ticket number like `CCTV-20260519-0001`.
   - Uploads the signature PNG to Google Drive.
   - Appends a row to a Google Sheet (full record + signature link).
   - Creates a Monday.com item with **ticket**, **date**, **branch**, **status**.
   - Posts a Slack message to your notification channel.
5. Staff can view their own requests and change the status; updates sync to the Sheet, Monday.com, and Slack.

---

## Architecture

```
[ Browser ]
   |
   | HTTPS
   v
[ Render web service: Node + Express ]
   |---> Slack Web API   (auth DMs + channel notifications)
   |---> Google Sheets   (database)
   |---> Google Drive    (signature PNGs)
   |---> Monday.com API  (board items)
```

Sessions are JWT cookies signed with `SESSION_SECRET`. OTPs live in-memory for 10 minutes.

---

## Setup walkthrough

You will need accounts for: Slack (workspace admin), Google Cloud, Monday.com, and Render. All free tiers are sufficient.

### Step 1 — Slack app

Go to <https://api.slack.com/apps> -> **Create New App** -> **From scratch**.

1. **App name**: `Bruno's CCTV Bot` (or whatever). Pick your Bruno's workspace.
2. In the left sidebar, open **OAuth & Permissions**. Under **Scopes -> Bot Token Scopes**, add:
   - `users:read` — needed to look up users by Slack name
   - `chat:write` — needed to DM the OTP and post notifications
   - `im:write` — needed to open DMs to users
3. Scroll up and click **Install to Workspace**. Approve.
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`) — this is `SLACK_BOT_TOKEN`.
5. Decide which channel new requests should post to. Invite the bot to that channel (`/invite @Bruno's CCTV Bot`). Then in Slack: click the channel name -> bottom of the popup shows the channel ID like `C0123456789`. That's `SLACK_NOTIFY_CHANNEL`. You said you'd fill this in later — leave it blank in env vars until you're ready, and Slack notifications will be skipped silently.

### Step 2 — Google Cloud (Sheets + Drive)

1. Go to <https://console.cloud.google.com/> and create a new project (e.g. `brunos-cctv`).
2. Enable APIs: search for **Google Sheets API** -> Enable. Then **Google Drive API** -> Enable.
3. Go to **APIs & Services -> Credentials -> Create Credentials -> Service account**. Give it a name like `cctv-form`. Skip the optional steps. Open the service account, go to **Keys** tab -> **Add Key -> JSON**. Download the JSON file.
4. **Important:** open that JSON file. Copy the entire JSON content — this is `GOOGLE_SERVICE_ACCOUNT_JSON`. (Render lets you paste long values.)
5. Note the `client_email` inside the JSON (something like `cctv-form@brunos-cctv.iam.gserviceaccount.com`). You will share resources with this address.
6. **Create the Sheet:** make a new Google Sheet titled "CCTV Requests". Share it with the service-account email above as **Editor**. Copy the spreadsheet ID from the URL (`https://docs.google.com/spreadsheets/d/THIS_PART/edit`) — that's `GOOGLE_SHEET_ID`.
7. **Create the Drive folder:** make a new folder titled "CCTV Signatures". Share it with the service-account email as **Editor**. The URL is `https://drive.google.com/drive/folders/THIS_PART` — that's `GOOGLE_DRIVE_FOLDER_ID`.

The app will create a tab called `Requests` and add a header row automatically the first time it starts.

### Step 3 — Monday.com

Don't worry — the part that's tricky here is finding the column IDs. Here's the whole flow.

#### 3a. Create the board

1. In monday.com, **Create new** -> **Board** (blank). Name it "CCTV Requests".
2. Delete the default columns, then add exactly these four columns (the names don't matter, the *types* do):
   - **Ticket** — type: **Text**
   - **Date** — type: **Date**
   - **Branch** — type: **Text** (or **Dropdown** if you want fixed branch names)
   - **Status** — type: **Status**. Edit the labels so they match exactly: `Open`, `In Progress`, `Resolved`, `Closed`.
3. The board URL looks like `https://yourcompany.monday.com/boards/1234567890` — copy `1234567890`. That's `MONDAY_BOARD_ID`.

#### 3b. Get an API token

Top-right avatar -> **Developers** -> **My Access Tokens** -> **Show**. Copy the long token. That's `MONDAY_API_TOKEN`.

Treat this like a password — it has full access to your monday data.

#### 3c. Find the column IDs

Monday columns have *internal IDs* (like `status_1`, `text_mkr3xy7`) that are different from the labels you see in the UI. The app needs the internal IDs. There are two easy ways:

**Option A — Use the included script (recommended).** Once you've set `MONDAY_API_TOKEN` and `MONDAY_BOARD_ID` in `.env`, run:

```bash
node scripts/monday-list-columns.js
```

It prints a table like:

```
id              title    type
--              -----    ----
name            Name     name
text_abc123     Ticket   text
date_def456     Date     date
text_ghi789     Branch   text
status_jkl012   Status   status
```

Copy the `id` values into:

```
MONDAY_COL_TICKET=text_abc123
MONDAY_COL_DATE=date_def456
MONDAY_COL_BRANCH=text_ghi789
MONDAY_COL_STATUS=status_jkl012
```

**Option B — Use monday.com's API Playground.** Go to <https://developer.monday.com/api-reference/docs/playground>, paste your token, and run:

```graphql
query {
  boards(ids: [YOUR_BOARD_ID]) {
    columns { id title type }
  }
}
```

You'll see the same list. Use the `id` values.

#### 3d. (Optional) About status label matching

Monday's API matches status labels case-sensitively. Make sure your column labels are exactly `Open`, `In Progress`, `Resolved`, `Closed` (capital O, capital I/P, etc.). If you use different labels, set `MONDAY_COL_STATUS` correctly and either rename your labels or edit the `VALID_STATUSES` list in `routes/requests.js` and the `<option>` tags in `public/index.html`.

### Step 4 — Deploy to Render

1. Push this folder to a GitHub repo.
2. At <https://dashboard.render.com/>: **New + -> Web Service**. Connect your GitHub and pick the repo.
3. Render will detect `render.yaml` and pre-fill build/start commands. If not:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `Node`
   - Plan: **Free**
4. In the **Environment** section, fill in each variable from `.env.example` (Render generates `SESSION_SECRET` for you automatically because of `generateValue: true` in `render.yaml`).
5. Click **Create Web Service**. First deploy takes ~3 minutes.
6. Your URL is something like `https://brunos-cctv-form.onrender.com`. Set `PUBLIC_URL` to that and redeploy.

**About the Render free tier:** the service sleeps after 15 minutes of inactivity. First request after sleep takes ~30 seconds to wake up. For higher availability either upgrade to the $7/mo Starter plan, or set up a free uptime monitor (e.g. UptimeRobot) to ping `/healthz` every 5 minutes.

---

## Running locally

```bash
git clone <your repo>
cd "cctv request form"
cp .env.example .env
# Fill in .env with your tokens
npm install
npm start
```

Open <http://localhost:3000>.

For local testing without HTTPS, set `NODE_ENV=development` in `.env` so the session cookie isn't marked `secure`.

---

## File map

```
.
├── server.js                # Express entry point (forces TZ=Asia/Manila)
├── render.yaml              # Render Blueprint -- one-click deploy config
├── package.json
├── .env.example
├── public/
│   ├── index.html           # Login -> Form -> Done -> My Requests
│   ├── app.js               # Frontend logic (no framework)
│   └── style.css
├── routes/
│   ├── auth.js              # /api/auth/request-otp, /verify-otp, /me, /logout
│   └── requests.js          # /api/requests CRUD + status updates
├── lib/
│   ├── timezone.js          # Asia/Manila formatters
│   ├── ticket.js            # CCTV-YYYYMMDD-NNNN generator
│   ├── otp.js               # 6-digit code issue/verify (in-memory)
│   ├── session.js           # JWT session cookie helpers
│   ├── slack.js             # Slack DM auth + channel notifications
│   ├── google.js            # Shared Google auth
│   ├── sheets.js            # Google Sheets read/append/update
│   ├── drive.js             # Signature PNG upload
│   └── monday.js            # GraphQL client + create/update item
└── scripts/
    └── monday-list-columns.js  # Helper to print board column IDs
```

---

## Security notes

- **OTP brute-force:** capped at 5 attempts per code.
- **Session length:** 12 hours, signed JWT in an httpOnly cookie.
- **Status updates:** the route only allows the original submitter to update their own ticket. If you want staff to update *anyone's* status, add an allowlist of Slack user IDs in `routes/requests.js` and skip the ownership check for them.
- **Slack user discovery:** the API confirms whether a Slack username exists. If you'd rather not leak that, change the response in `routes/auth.js -> request-otp` to a generic message.
- **Service account JSON:** never commit it. Always paste it in Render's env vars, not in a file in the repo.

---

## Common problems

| Symptom | Likely fix |
|---|---|
| `SLACK_BOT_TOKEN is not set` on startup | Set the env var in Render -> Environment, then Manual Deploy -> Clear cache & redeploy. |
| OTP DM not received | Bot needs `chat:write` AND `im:write` scopes. Reinstall the app after adding scopes. |
| `user_not_found` for a real Slack user | The bot needs `users:read`. Some users may only match on `display_name` -- try their handle without `@`. |
| Google Sheets returns 403 | You didn't share the Sheet with the service account email. Open the JSON key, copy `client_email`, share the Sheet with it as Editor. |
| Monday item created but status stays "blank" | Status labels are case-sensitive. Your board's labels must match `Open` / `In Progress` / `Resolved` / `Closed` exactly. |
| Times look wrong | Don't rely on `new Date().toLocaleString()` in the frontend -- everything is server-formatted from `lib/timezone.js`. The server forces `process.env.TZ = 'Asia/Manila'`. |

---

## Next steps you might want

- Multi-branch dropdown instead of free text (set fixed branches in `public/index.html`).
- A staff-only view that lists *all* tickets (not just the current user's).
- Email + Slack notifications when status changes to `Resolved`.
- Attach the signature image directly into the Monday item (Files column).
