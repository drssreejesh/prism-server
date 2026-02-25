// ═══════════════════════════════════════════════════════════════════════════
// PRISM API CLIENT
// Drop this into index.html replacing the sendToSheet / fetchAllFromSheet block.
// All existing form logic, localStorage caching, and UI code stays untouched.
// ═══════════════════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Change this once when you deploy to Railway
const API_BASE = 'https://YOUR-APP-NAME.railway.app';

// ─── TOKEN MANAGEMENT ────────────────────────────────────────────────────────
function setAuthToken(token) {
  sessionStorage.setItem('prism_token', token);
}
function getAuthToken() {
  return sessionStorage.getItem('prism_token');
}
function clearAuthToken() {
  sessionStorage.removeItem('prism_token');
}

// ─── CORE FETCH WRAPPER ───────────────────────────────────────────────────────
async function _apiRequest(method, path, body) {
  const token = getAuthToken();
  const opts  = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {})
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({ error: 'Invalid server response' }));

  if (res.status === 401) {
    // Token expired — force re-login
    clearAuthToken();
    showToast('⚠️ Session expired — please log in again', 'error');
    setTimeout(() => switchRole(), 1500);
    throw new Error('Session expired');
  }

  if (!res.ok) {
    throw new Error(data.error || `Server error (${res.status})`);
  }

  return data;
}

// ─── REPLACE verifyRolePwd ────────────────────────────────────────────────────
// Calls the backend for login. On success, stores JWT and calls selectRole().
// Replaces the old hardcoded ROLE_PASSWORDS object entirely.
async function verifyRolePwd(role) {
  const input = document.getElementById('pwd-input-' + role);
  const err   = document.getElementById('pwd-err-' + role);
  if (!input) return;

  const password = input.value;
  input.value    = '';

  if (!password) {
    err.textContent = '⚠️ Enter a password';
    return;
  }

  err.textContent = '⏳ Verifying…';

  try {
    const data = await _apiRequest('POST', '/api/auth/login', { role, password });
    setAuthToken(data.token);
    err.textContent = '';
    selectRole(role);
  } catch (e) {
    err.textContent = '❌ Incorrect password';
    document.getElementById('pwd-input-' + role)?.focus();
  }
}

// ─── REPLACE sendToSheet ─────────────────────────────────────────────────────
// Maps the old payload.sheet / payload.action to the correct API endpoint.
// The existing calling code (registerPatient, saveAcceptance, etc.) doesn't change.
async function sendToSheet(payload, successMsg) {
  const path = _payloadToPath(payload);
  if (!path) {
    showToast('⚠️ Unknown action — cannot save', 'error');
    return;
  }

  // Anti-double-submit: disable the button that triggered this
  const btn = document.activeElement;
  const wasBtn = btn && (
    btn.classList.contains('mob-save-btn') ||
    btn.classList.contains('submit-btn')
  );
  if (wasBtn) {
    btn.disabled = true;
    btn._origText = btn.textContent;
    btn.textContent = '⏳ Saving…';
  }

  showToast('🔄 Saving…');

  try {
    await _apiRequest('POST', path, payload);
    showToast(successMsg || '✅ Saved', 'success');
  } catch (e) {
    showToast('❌ ' + e.message, 'error');
  } finally {
    if (wasBtn) {
      btn.disabled    = false;
      btn.textContent = btn._origText || '💾 Save';
    }
  }
}

// Maps old payload shape → API route
function _payloadToPath(payload) {
  const action = payload.action || '';
  const lab    = (payload.lab || '').toLowerCase();

  if (action === 'register')         return '/api/patients';
  if (action === 'save_morph')       return '/api/morph';
  if (action === 'save_order')       return `/api/orders/${lab}`;
  if (action === 'save_acceptance')  return `/api/acceptance/${lab}`;
  if (action === 'save_results')     return `/api/results/${lab}`;
  return null;
}

// ─── REPLACE fetchAllFromSheet ────────────────────────────────────────────────
// Fetches all data for a CR from the server and caches into localStorage.
// The rest of the app reads from localStorage exactly as before — no change needed.
async function fetchAllFromSheet(cr, callback) {
  showToast('🔄 Fetching from server…');
  try {
    const res = await _apiRequest('GET', '/api/patients/' + encodeURIComponent(cr));

    if (!res.data) {
      showToast('⚠️ CR not found on server', 'error');
      callback(false);
      return;
    }

    const { patients, morphs, orders, acceptance, results } = res.data;

    // Cache patients / visits
    (patients || []).forEach(function(p) {
      var ptObj = {
        cr:           p.cr,
        labid:        p.labid,
        date:         p.date_received ? p.date_received.slice(0, 10) : '',
        name:         p.name,
        age:          p.age,
        sex:          p.sex,
        faculty:      p.faculty,
        jr:           p.jr,
        sr:           p.sr,
        sample:       p.sample,
        tlc:          p.tlc,
        bmQuality:    p.bm_quality,
        blasts:       p.blasts,
        eos:          p.eos,
        plasma:       p.plasma,
        rightImprint: p.right_imprint,
        leftImprint:  p.left_imprint,
        suspicion:    p.suspicion,
      };
      saveVisit(cr, ptObj);
    });

    // Cache morphology
    (morphs || []).forEach(function(m) {
      var morphObj = { report: m.report, labid: m.labid };
      if (m.labid) saveLocal(vKey('morph', cr, m.labid), morphObj);
    });

    // Cache orders
    (orders || []).forEach(function(o) {
      var orderObj = { panels: o.panels, payment: o.payment, notes: o.notes, labid: o.labid };
      if (o.labid) {
        saveLocal(vKey('order_' + o.lab, cr, o.labid), orderObj);
        saveLocal('order_' + o.lab + '_' + cr, orderObj); // legacy fallback
      }
    });

    // Cache acceptance — note: panel_status is JSONB, comes back as object already
    (acceptance || []).forEach(function(a) {
      var accObj = {
        uniqueLabId:  a.unique_lab_id,
        panelStatus:  a.panel_status,
        notes:        a.notes,
        labid:        a.labid,
        locked:       a.locked,
      };
      if (a.labid) {
        saveLocal(vKey('accept_' + a.lab, cr, a.labid), accObj);
        saveLocal('accept_' + a.lab + '_' + cr, accObj); // legacy fallback
      }
    });

    // Cache results
    (results || []).forEach(function(r) {
      var resObj = {
        panelResults: r.panel_results,
        labid:        r.labid,
        locked:       r.locked,
      };
      if (r.labid) {
        saveLocal(vKey('entry_' + r.lab, cr, r.labid), resObj);
        saveLocal('entry_' + r.lab + '_' + cr, resObj); // legacy fallback
      }
    });

    // Set active_labid as the default selected visit
    if (res.active_labid) {
      // Update all module contexts for this CR to use the server-determined latest visit
      ['order', 'accept', 'entry', 'morph'].forEach(function(ctx) {
        setSelectedLabId(ctx, cr, res.active_labid);
        ['fish','fcm','rtpcr','ngsh12','ngsh9','tcr'].forEach(function(lab) {
          setSelectedLabId(ctx + '_' + lab, cr, res.active_labid);
        });
      });
    }

    showToast('✅ Data loaded', 'success');
    callback(true);

  } catch (e) {
    showToast('❌ ' + e.message, 'error');
    callback(false);
  }
}

// ─── REMOVE OLD GOOGLE SHEETS CONFIG ─────────────────────────────────────────
// These are no longer needed — keeping them as no-ops prevents any remaining
// references from crashing while you clean up the code.
let SCRIPT_URL = '';
function promptConfig() {
  showToast('ℹ️ App now uses PostgreSQL backend — no Google Sheets config needed', 'success');
}
function openConfig()  {}
function closeConfig() {}
function testConnection() {
  fetch(API_BASE + '/api/ping')
    .then(r => r.json())
    .then(d => showToast('✅ Server reachable: ' + d.ts, 'success'))
    .catch(() => showToast('❌ Cannot reach server: ' + API_BASE, 'error'));
}
