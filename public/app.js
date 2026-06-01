// Tiny client-side state machine: name -> code -> form -> done/mine.
// Talks only to /api/* on the same origin.

const $ = (id) => document.getElementById(id);
const sections = ['step-name', 'step-code', 'step-form', 'step-done', 'step-mine'];
function show(which) {
  for (const s of sections) {
    $(s).classList.toggle('hidden', s !== which);
  }
}

function setMsg(id, text, kind = '') {
  const el = $(id);
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (kind) el.classList.add(kind);
}

let pendingSlackUserId = null;
let signaturePad = null;

// ------- Auth: name -------
$('sendCode').addEventListener('click', async () => {
  const name = $('slackName').value.trim();
  if (!name) return setMsg('loginMsg', 'Please enter your Slack username.', 'err');
  setMsg('loginMsg', 'Sending...', '');
  $('sendCode').disabled = true;
  try {
    const r = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slackName: name }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(humanError(data));
    pendingSlackUserId = data.slackUserId;
    setMsg('loginMsg', 'Code sent. Check your Slack.', 'ok');
    show('step-code');
  } catch (e) {
    setMsg('loginMsg', e.message, 'err');
  } finally {
    $('sendCode').disabled = false;
  }
});

// ------- Auth: code -------
$('verifyCode').addEventListener('click', async () => {
  const code = $('code').value.trim();
  if (!/^\d{6}$/.test(code)) return setMsg('codeMsg', 'Enter the 6-digit code.', 'err');
  setMsg('codeMsg', 'Verifying...', '');
  $('verifyCode').disabled = true;
  try {
    const r = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slackUserId: pendingSlackUserId, code }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(humanError(data));
    onSignedIn(data.slackUserName);
  } catch (e) {
    setMsg('codeMsg', e.message, 'err');
  } finally {
    $('verifyCode').disabled = false;
  }
});

$('resendCode').addEventListener('click', () => {
  pendingSlackUserId = null;
  $('code').value = '';
  setMsg('codeMsg', '');
  show('step-name');
});

$('logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.reload();
});

function onSignedIn(slackUserName) {
  $('userbox').hidden = false;
  $('who').textContent = '@' + slackUserName;
  // IMPORTANT: show the form FIRST, then init. If we init while step-form
  // is still display:none, canvas.offsetWidth is 0 and SignaturePad ends up
  // drawing into a zero-width buffer (= invisible strokes).
  show('step-form');
  initForm(slackUserName);
}

// ------- Form -------
function initForm(slackUserName) {
  // Default the requester name to the Slack handle to save typing
  if (!$('f_name').value) $('f_name').value = slackUserName.replace(/^@/, '').replace(/\./g, ' ');

  // Set today's Manila date as default
  fetch('/api/requests/today-date').then((r) => r.json()).then((d) => {
    if (d.date && !$('f_date').value) $('f_date').value = d.date;
  });

  // Signature pad
  const canvas = $('sig');
  if (!signaturePad) {
    signaturePad = new SignaturePad(canvas, {
      backgroundColor: '#ffffff',
      penColor: '#111111',
      minWidth: 1,
      maxWidth: 2.5,
    });
    window.addEventListener('resize', () => resizeSig(canvas));
  }
  // Wait one frame so the freshly-shown section has laid out, then size the canvas.
  // Without this, canvas.offsetWidth can momentarily read stale (0) on first show.
  requestAnimationFrame(() => requestAnimationFrame(() => resizeSig(canvas)));
  $('sigClear').onclick = () => signaturePad.clear();
}

function resizeSig(canvas) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  // If parent is briefly display:none we'd get 0 -- fall back to a sane default.
  const cssW = canvas.offsetWidth || canvas.parentElement.offsetWidth || 600;
  const cssH = 180;
  canvas.width = cssW * ratio;
  canvas.height = cssH * ratio;
  canvas.getContext('2d').scale(ratio, ratio);
  if (signaturePad) signaturePad.clear();
}

$('submitReq').addEventListener('click', async () => {
  const payload = {
    name: $('f_name').value.trim(),
    branch: $('f_branch').value.trim(),
    incidentDate: $('f_date').value,
    incidentTime: $('f_time').value,
    area: $('f_area').value.trim(),
    eventDesc: $('f_event').value.trim(),
    personDesc: $('f_person').value.trim(),
    status: $('f_status').value,
    signatureDataUrl: signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL('image/png') : '',
  };
  for (const [k, v] of Object.entries(payload)) {
    if (!v) {
      setMsg('formMsg', `Please complete: ${labelFor(k)}`, 'err');
      return;
    }
  }
  setMsg('formMsg', 'Submitting...', '');
  $('submitReq').disabled = true;
  try {
    const r = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(humanError(data));
    $('d_ticket').textContent = data.ticket;
    $('d_when').textContent = 'Submitted ' + data.submittedAt + ' (Asia/Manila).';
    show('step-done');
  } catch (e) {
    setMsg('formMsg', e.message, 'err');
  } finally {
    $('submitReq').disabled = false;
  }
});

$('newRequest').addEventListener('click', () => {
  // clear form except name
  ['f_branch', 'f_time', 'f_area', 'f_event', 'f_person'].forEach((id) => { $(id).value = ''; });
  $('f_status').value = 'Open';
  signaturePad.clear();
  setMsg('formMsg', '');
  show('step-form');
});

$('viewMine').addEventListener('click', loadMine);
$('backToForm').addEventListener('click', () => show('step-form'));

async function loadMine() {
  show('step-mine');
  $('myList').innerHTML = '<div class="muted">Loading...</div>';
  try {
    const r = await fetch('/api/requests');
    const data = await r.json();
    if (!r.ok) throw new Error(humanError(data));
    renderMine(data.requests);
  } catch (e) {
    $('myList').innerHTML = `<div class="msg err">${escapeHtml(e.message)}</div>`;
  }
}

function renderMine(rows) {
  if (!rows.length) {
    $('myList').innerHTML = '<div class="muted">No requests yet.</div>';
    return;
  }
  const html = rows.map((r) => {
    const statusClass = r.Status.replace(/\s+/g, '.');
    return `
      <div class="row-item">
        <div>
          <div class="ticket">${escapeHtml(r.Ticket)}</div>
          <div class="meta">${escapeHtml(r.Branch)} &middot; ${escapeHtml(r['Incident Date'])} ${escapeHtml(r['Incident Time'])}</div>
        </div>
        <div>
          <span class="badge ${statusClass}">${escapeHtml(r.Status)}</span>
        </div>
        <div>
          <select data-ticket="${escapeHtml(r.Ticket)}">
            ${['Open','In Progress','Resolved','Closed'].map((s) => `<option ${s===r.Status?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>`;
  }).join('');
  $('myList').innerHTML = html;
  $('myList').querySelectorAll('select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const ticket = e.target.dataset.ticket;
      const status = e.target.value;
      e.target.disabled = true;
      try {
        const r = await fetch(`/api/requests/${encodeURIComponent(ticket)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(humanError(d));
        }
        await loadMine();
      } catch (err) {
        alert('Update failed: ' + err.message);
        e.target.disabled = false;
      }
    });
  });
}

// ------- helpers -------
function labelFor(key) {
  return ({
    name: 'Full name', branch: 'Branch', incidentDate: 'Incident date',
    incidentTime: 'Incident time', area: 'Area', eventDesc: 'Event description',
    personDesc: 'Person description', signatureDataUrl: 'Signature',
  })[key] || key;
}
function humanError(d) {
  if (!d) return 'Network error';
  if (d.error === 'user_not_found') return "We couldn't find that Slack username.";
  if (d.error === 'bad_code') return `Wrong code. Attempts left: ${d.attemptsLeft ?? '?'}`;
  if (d.error === 'expired') return 'That code expired. Request a new one.';
  if (d.error === 'too_many_attempts') return 'Too many attempts. Request a new code.';
  if (d.error === 'missing_fields') return 'Missing: ' + (d.fields || []).join(', ');
  if (d.error === 'not_authenticated') return 'Please sign in again.';
  if (d.error === 'forbidden') return "You can only update your own requests.";
  return d.detail || d.error || 'Something went wrong.';
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// On load: try to restore session
(async () => {
  try {
    const r = await fetch('/api/auth/me');
    if (r.ok) {
      const data = await r.json();
      onSignedIn(data.user.slackUserName);
    }
  } catch (_) {}
})();
