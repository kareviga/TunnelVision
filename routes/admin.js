const router = require('express').Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { computeRaceScores, clearRaceScores } = require('../services/scoringService');

// POST /api/admin/lock — toggle picks lock
router.post('/lock', requireAdmin, (req, res) => {
  const current = db.prepare("SELECT value FROM settings WHERE key = 'picks_locked'").get()?.value;
  const newVal = current === '1' ? '0' : '1';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'picks_locked'").run(newVal);
  res.json({ picks_locked: newVal === '1' });
});

// GET /api/admin/races — all races
router.get('/races', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM races ORDER BY round ASC').all());
});

// POST /api/admin/races — add a race
router.post('/races', requireAdmin, (req, res) => {
  const { round, name, circuit, date } = req.body;
  if (!round || !name || !circuit || !date) return res.status(400).json({ error: 'All fields required' });
  const result = db.prepare('INSERT INTO races (round, name, circuit, date) VALUES (?, ?, ?, ?)').run(round, name, circuit, date);
  res.json({ id: result.lastInsertRowid });
});

// POST /api/admin/races/:id/results — submit race results + compute scores
// Body: { results: [{ driver_id, points }] }
router.post('/races/:id/results', requireAdmin, (req, res) => {
  const raceId = parseInt(req.params.id);
  const { results } = req.body;

  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'results array required' });
  }

  // Clear any existing data for idempotency
  clearRaceScores(raceId);

  // Insert raw race results
  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO race_results (race_id, driver_id, points) VALUES (?, ?, ?)
  `);
  const insertAll = db.transaction(() => {
    for (const r of results) {
      if (r.points > 0) insertResult.run(raceId, r.driver_id, r.points);
    }
  });
  insertAll();

  // Compute and store user scores (also marks race complete + updates driver pts)
  try {
    computeRaceScores(raceId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/admin/races/:id/results — wipe results for re-entry
router.delete('/races/:id/results', requireAdmin, (req, res) => {
  clearRaceScores(parseInt(req.params.id));
  res.json({ success: true });
});

// GET /api/admin/drivers — all drivers
router.get('/drivers', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM drivers ORDER BY championship_pts DESC').all());
});

// PUT /api/admin/drivers/:id — update driver pts or info
router.put('/drivers/:id', requireAdmin, (req, res) => {
  const { championship_pts, team, team_color } = req.body;
  const id = parseInt(req.params.id);
  if (championship_pts !== undefined) {
    db.prepare('UPDATE drivers SET championship_pts = ? WHERE id = ?').run(championship_pts, id);
  }
  if (team) db.prepare('UPDATE drivers SET team = ? WHERE id = ?').run(team, id);
  if (team_color) db.prepare('UPDATE drivers SET team_color = ? WHERE id = ?').run(team_color, id);
  res.json({ success: true });
});

// GET /api/admin/users — all users with pick info
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, is_admin, created_at FROM users').all();
  const enriched = users.map(u => {
    const picks = db.prepare('SELECT * FROM user_picks WHERE user_id = ?').get(u.id);
    const d1 = picks?.driver1_id ? db.prepare('SELECT name FROM drivers WHERE id = ?').get(picks.driver1_id)?.name : null;
    const d2 = picks?.driver2_id ? db.prepare('SELECT name FROM drivers WHERE id = ?').get(picks.driver2_id)?.name : null;
    return { ...u, driver1: d1, driver2: d2 };
  });
  res.json(enriched);
});

// GET /api/admin/settings — all settings
router.get('/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

// PUT /api/admin/settings/:key
router.put('/settings/:key', requireAdmin, (req, res) => {
  const { value } = req.body;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(req.params.key, String(value));
  res.json({ success: true });
});

module.exports = router;
