// ── State ────────────────────────────────────────────────────────────────
let token = localStorage.getItem('f1_token');
let currentUser = JSON.parse(localStorage.getItem('f1_user') || 'null');
let allDrivers = [];
let selectedDriverIds = []; // up to 2
let currentPicks = { driver1: null, driver2: null };
let picksLocked = false;
let adminRaces = [];

// ── API helper ───────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Toast ────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ── Auth ─────────────────────────────────────────────────────────────────
function showAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return showToast('Enter username and password', 'error');
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    saveSession(data);
    initApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Allow Enter key on login
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  if (!username || !password) return showToast('Fill in all fields', 'error');
  if (password !== confirm) return showToast('Passwords do not match', 'error');
  try {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    saveSession(data);
    if (data.is_admin) showToast('Welcome, admin!', 'success');
    else showToast('Account created!', 'success');
    initApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function saveSession(data) {
  token = data.token;
  currentUser = { username: data.username, is_admin: data.is_admin };
  localStorage.setItem('f1_token', token);
  localStorage.setItem('f1_user', JSON.stringify(currentUser));
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('f1_token');
  localStorage.removeItem('f1_user');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// ── App Init ─────────────────────────────────────────────────────────────
async function initApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('header-user').textContent = currentUser.username;

  if (currentUser.is_admin) {
    document.getElementById('nav-admin').style.display = '';
  }

  await showScreen('team');
}

// ── Screen Navigation ─────────────────────────────────────────────────────
async function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'team')    await loadTeam();
  if (name === 'drivers') await loadDrivers();
  if (name === 'lb')      await loadStandings();
  if (name === 'admin')   await loadAdmin();
}

// ── My Team Screen ────────────────────────────────────────────────────────
async function loadTeam() {
  try {
    const [picks, races, settings, standings] = await Promise.all([
      api('/api/picks/my'),
      api('/api/league/my-races'),
      api('/api/league/settings'),
      api('/api/league/standings'),
    ]);

    picksLocked = settings.picks_locked;
    updateHeaderPill(settings.picks_locked);

    // Stats
    const myStanding = standings.find(s => s.is_me);
    const rank = standings.findIndex(s => s.is_me) + 1;
    document.getElementById('team-pts').textContent = myStanding?.score ?? '0';
    document.getElementById('team-rank').textContent = rank > 0 ? `#${rank}` : '—';
    document.getElementById('team-swaps').textContent = picks.swaps_used ?? '0';

    // No picks warning
    const noPicks = !picks.driver1 && !picks.driver2;
    document.getElementById('no-picks-msg').style.display = noPicks ? 'block' : 'none';

    // Driver cards
    if (!noPicks) {
      document.getElementById('team-drivers').innerHTML = [picks.driver1, picks.driver2]
        .filter(Boolean)
        .map(d => driverCardHTML(d))
        .join('');
    }

    // Race log
    const racesEl = document.getElementById('team-races');
    if (races.length === 0) {
      racesEl.innerHTML = '<div class="empty">No completed races yet</div>';
    } else {
      racesEl.innerHTML = races.map(r => `
        <div class="race-row">
          <div><span class="race-round">R${r.round}</span><span class="race-name">${r.race_name}</span></div>
          <div class="race-pts">+${r.score} pts</div>
        </div>
      `).join('');
    }

    // Next race
    const nextEl = document.getElementById('team-next');
    if (settings.next_race) {
      const nr = settings.next_race;
      const pill = settings.picks_locked
        ? '<div class="locked-pill">🔒 LOCKED</div>'
        : '<div class="open-pill">✓ OPEN</div>';
      nextEl.innerHTML = `
        <div class="next-race">
          <div>
            <div class="next-round">Round ${nr.round}</div>
            <div class="next-name">${nr.name}</div>
            <div class="next-detail">${nr.circuit} · ${formatDate(nr.date)}</div>
          </div>
          ${pill}
        </div>`;
    } else {
      nextEl.innerHTML = '<div class="empty">Season complete</div>';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function driverCardHTML(d) {
  return `
    <div class="driver-card" style="border-left-color:${d.team_color}">
      <div class="driver-num" style="color:${d.team_color}">${d.number}</div>
      <div class="driver-name">${d.name}</div>
      <div class="driver-team" style="color:${d.team_color}">${d.team}</div>
      <div class="driver-hf">
        <span>${d.championship_pts} pts</span>
        <span class="hf">×${d.handicap}</span>
      </div>
    </div>`;
}

// ── Drivers / Picks Screen ────────────────────────────────────────────────
async function loadDrivers() {
  try {
    const [drivers, picks, settings] = await Promise.all([
      api('/api/picks/drivers'),
      api('/api/picks/my'),
      api('/api/league/settings'),
    ]);

    allDrivers = drivers;
    picksLocked = settings.picks_locked;
    currentPicks = picks;

    // Pre-select current picks
    selectedDriverIds = [];
    if (picks.driver1) selectedDriverIds.push(picks.driver1.id);
    if (picks.driver2) selectedDriverIds.push(picks.driver2.id);

    // Lock banners
    document.getElementById('picks-lock-banner').style.display = picksLocked ? 'block' : 'none';
    document.getElementById('picks-open-banner').style.display = picksLocked ? 'none' : 'block';

    renderPicksGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderPicksGrid() {
  const grid = document.getElementById('drivers-grid');
  const count = selectedDriverIds.length;
  document.getElementById('picks-count').textContent = `${count}/2 ${count === 2 ? '✓' : ''}`;

  grid.innerHTML = allDrivers.map(d => {
    const selected = selectedDriverIds.includes(d.id);
    return `
      <div class="pick-card ${selected ? 'selected' : ''}" onclick="togglePick(${d.id})">
        ${selected ? '<div class="pick-check">✓</div>' : ''}
        <div class="driver-num" style="color:${d.team_color};font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;font-weight:900">${d.number}</div>
        <div class="driver-name">${d.short_name}</div>
        <div class="driver-team" style="color:${d.team_color};font-size:0.72rem">${d.team}</div>
        <div class="pick-hf">
          <span>${d.championship_pts} pts</span>
          <span class="mult">×${d.handicap}</span>
        </div>
      </div>`;
  }).join('');

  const saveBtn = document.getElementById('btn-save-picks');
  saveBtn.disabled = picksLocked || count !== 2;
  if (picksLocked) {
    saveBtn.textContent = '🔒 Picks Locked — Race Weekend';
  } else if (count !== 2) {
    saveBtn.textContent = `Select ${2 - count} more driver${2 - count === 1 ? '' : 's'}`;
  } else {
    saveBtn.textContent = 'Save Picks';
  }
}

function togglePick(driverId) {
  if (picksLocked) return;
  const idx = selectedDriverIds.indexOf(driverId);
  if (idx > -1) {
    selectedDriverIds.splice(idx, 1);
  } else {
    if (selectedDriverIds.length >= 2) {
      showToast('Already at 2 drivers — deselect one first', 'error');
      return;
    }
    selectedDriverIds.push(driverId);
  }
  renderPicksGrid();
}

async function savePicks() {
  if (selectedDriverIds.length !== 2) return;
  try {
    await api('/api/picks', {
      method: 'PUT',
      body: JSON.stringify({ driver1_id: selectedDriverIds[0], driver2_id: selectedDriverIds[1] }),
    });
    showToast('Picks saved!', 'success');
    // Refresh to show updated swaps
    await loadDrivers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Standings Screen ──────────────────────────────────────────────────────
async function loadStandings() {
  try {
    const [standings, settings] = await Promise.all([
      api('/api/league/standings'),
      api('/api/league/settings'),
    ]);

    const sub = `${standings.length} players · After Round ${settings.completed_races}`;
    document.getElementById('lb-sub').textContent = sub;

    const medals = ['🥇', '🥈', '🥉'];
    const medalColors = ['gold', 'silver', 'bronze'];

    document.getElementById('lb-list').innerHTML = standings.map((s, i) => {
      const rankLabel = i < 3
        ? `<div class="lb-rank ${medalColors[i]}">${medals[i]}</div>`
        : `<div class="lb-rank" style="color:var(--muted)">#${i + 1}</div>`;

      const scoreColor = i < 3 ? medalColors[i] : '';
      const picks = [s.driver1?.short_name, s.driver2?.short_name].filter(Boolean).join(' · ') || 'No picks yet';

      return `
        <div class="lb-row ${s.is_me ? 'me' : ''}">
          ${rankLabel}
          <div class="lb-info">
            <div class="lb-name ${s.is_me ? 'me' : ''}">${s.username}${s.is_me ? ' (you)' : ''}</div>
            <div class="lb-picks">${picks}</div>
          </div>
          <div class="lb-score ${scoreColor}" style="${s.is_me && i >= 3 ? 'color:var(--orange)' : ''}">${s.score}</div>
        </div>`;
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Admin Screen ──────────────────────────────────────────────────────────
async function loadAdmin() {
  if (!currentUser.is_admin) return;
  try {
    const [settings, races, drivers, users] = await Promise.all([
      api('/api/admin/settings'),
      api('/api/admin/races'),
      api('/api/admin/drivers'),
      api('/api/admin/users'),
    ]);

    adminRaces = races;
    picksLocked = settings.picks_locked === '1';
    updateLockButton();

    // Race select dropdown
    const select = document.getElementById('admin-race-select');
    select.innerHTML = '<option value="">— Select race —</option>' +
      races.map(r => `<option value="${r.id}">${r.is_completed ? '✓' : '○'} R${r.round} ${r.name}</option>`).join('');

    // Driver pts form
    document.getElementById('driver-pts-form').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>#</th><th>Driver</th><th>Team</th><th>Pts</th></tr></thead>
        <tbody>${drivers.map(d => `
          <tr>
            <td style="color:${d.team_color}">${d.number}</td>
            <td>${d.short_name}</td>
            <td style="color:${d.team_color};font-size:0.75rem">${d.team}</td>
            <td><input class="pts-input" type="number" min="0" data-driver-id="${d.id}" value="${d.championship_pts}"></td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    // Users list
    document.getElementById('admin-users-list').innerHTML = users.map(u => `
      <div class="race-row">
        <div>
          <span style="font-weight:600">${u.username}</span>
          ${u.is_admin ? '<span style="color:var(--red);font-size:0.7rem;margin-left:6px">ADMIN</span>' : ''}
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">
            ${u.driver1 && u.driver2 ? `${u.driver1} · ${u.driver2}` : 'No picks yet'}
          </div>
        </div>
        <div style="font-size:0.72rem;color:var(--muted)">${formatDate(u.created_at?.split('T')[0])}</div>
      </div>`).join('') || '<div class="empty">No users yet</div>';

  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateLockButton() {
  const btn = document.getElementById('btn-lock');
  if (picksLocked) {
    btn.textContent = '🔒 PICKS LOCKED — Tap to Unlock';
    btn.classList.add('locked');
  } else {
    btn.textContent = '✓ PICKS OPEN — Tap to Lock';
    btn.classList.remove('locked');
  }
}

async function toggleLock() {
  try {
    const data = await api('/api/admin/lock', { method: 'POST' });
    picksLocked = data.picks_locked;
    updateLockButton();
    updateHeaderPill(picksLocked);
    showToast(picksLocked ? 'Picks locked 🔒' : 'Picks unlocked ✓', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadRaceResultsForm() {
  const raceId = document.getElementById('admin-race-select').value;
  const formEl = document.getElementById('race-results-form');
  if (!raceId) { formEl.innerHTML = ''; return; }

  const race = adminRaces.find(r => r.id == raceId);
  const drivers = await api('/api/admin/drivers');

  // Load existing results if any
  let existingPts = {};
  if (race.is_completed) {
    // We can't directly fetch results, so pre-fill from driver pts (approximation)
    // In a real scenario we'd have GET /api/admin/races/:id/results
    // For now show a re-enter warning
  }

  formEl.innerHTML = `
    ${race.is_completed ? '<div class="lock-banner" style="margin-bottom:12px">⚠️ This race already has results. Submitting will overwrite them.</div>' : ''}
    <p style="font-size:0.75rem;color:var(--muted);margin-bottom:10px">
      Enter points scored in this race only (standard F1: P1=25, P2=18, P3=15, P4=12, P5=10, P6=8, P7=6, P8=4, P9=2, P10=1). Leave 0 for drivers who didn't score.
    </p>
    <table class="admin-table" style="margin-bottom:16px">
      <thead><tr><th>#</th><th>Driver</th><th>Race Pts</th></tr></thead>
      <tbody>${drivers.map(d => `
        <tr>
          <td style="color:${d.team_color}">${d.number}</td>
          <td>${d.short_name}</td>
          <td><input class="pts-input" type="number" min="0" step="0.5" data-result-driver="${d.id}" value="0"></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <button class="btn btn-green" style="margin-top:0" onclick="submitRaceResults(${raceId})">
      Submit R${race.round} ${race.name} Results
    </button>`;
}

async function submitRaceResults(raceId) {
  const inputs = document.querySelectorAll('[data-result-driver]');
  const results = [];
  inputs.forEach(input => {
    const pts = parseFloat(input.value) || 0;
    results.push({ driver_id: parseInt(input.dataset.resultDriver), points: pts });
  });

  try {
    await api(`/api/admin/races/${raceId}/results`, {
      method: 'POST',
      body: JSON.stringify({ results }),
    });
    showToast('Results saved! Scores updated.', 'success');
    await loadAdmin(); // Refresh to update race list
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveDriverPts() {
  const inputs = document.querySelectorAll('[data-driver-id]');
  try {
    for (const input of inputs) {
      await api(`/api/admin/drivers/${input.dataset.driverId}`, {
        method: 'PUT',
        body: JSON.stringify({ championship_pts: parseInt(input.value) || 0 }),
      });
    }
    showToast('Driver points updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function updateHeaderPill(locked) {
  const pill = document.getElementById('header-pill');
  pill.style.display = locked ? 'block' : 'none';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

// ── Boot ─────────────────────────────────────────────────────────────────
if (token && currentUser) {
  initApp();
} else {
  document.getElementById('auth-screen').style.display = 'flex';
}
