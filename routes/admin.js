const router = require('express').Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { computeRaceScores, clearRaceScores } = require('../services/scoringService');

// POST /api/admin/lock
router.post('/lock', requireAdmin, (req, res) => {
  const newVal = db.getSetting('picks_locked') === '1' ? '0' : '1';
  db.setSetting('picks_locked', newVal);
  res.json({ picks_locked: newVal === '1' });
});

// GET /api/admin/races
router.get('/races', requireAdmin, (req, res) => {
  res.json(db.all('races').sort((a, b) => a.round - b.round));
});

// POST /api/admin/races
router.post('/races', requireAdmin, (req, res) => {
  const { round, name, circuit, date } = req.body;
  if (!round || !name || !circuit || !date) return res.status(400).json({ error: 'All fields required' });
  const race = db.insert('races', { round: parseInt(round), name, circuit, date, is_completed: false });
  res.json({ id: race.id });
});

// POST /api/admin/races/:id/results
router.post('/races/:id/results', requireAdmin, (req, res) => {
  const raceId = parseInt(req.params.id);
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'results array required' });
  }

  clearRaceScores(raceId);

  for (const r of results) {
    if (r.points > 0) {
      db.upsertBy(
        'race_results',
        x => x.race_id === raceId && x.driver_id === r.driver_id,
        { race_id: raceId, driver_id: r.driver_id, points: r.points }
      );
    }
  }

  try {
    computeRaceScores(raceId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/admin/races/:id/results
router.delete('/races/:id/results', requireAdmin, (req, res) => {
  clearRaceScores(parseInt(req.params.id));
  res.json({ success: true });
});

// GET /api/admin/drivers
router.get('/drivers', requireAdmin, (req, res) => {
  res.json(db.all('drivers').sort((a, b) => b.championship_pts - a.championship_pts));
});

// PUT /api/admin/drivers/:id
router.put('/drivers/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { championship_pts, team, team_color } = req.body;
  const updates = {};
  if (championship_pts !== undefined) updates.championship_pts = parseInt(championship_pts);
  if (team) updates.team = team;
  if (team_color) updates.team_color = team_color;
  db.update('drivers', d => d.id === id, updates);
  res.json({ success: true });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const users = db.all('users').map(u => {
    const picks = db.findOne('user_picks', r => r.user_id === u.id);
    const d1 = picks?.driver1_id ? db.findOne('drivers', d => d.id === picks.driver1_id)?.name : null;
    const d2 = picks?.driver2_id ? db.findOne('drivers', d => d.id === picks.driver2_id)?.name : null;
    const { password_hash, ...safe } = u;
    return { ...safe, driver1: d1, driver2: d2 };
  });
  res.json(users);
});

// GET /api/admin/settings
router.get('/settings', requireAdmin, (req, res) => {
  res.json(db.allSettings());
});

// PUT /api/admin/settings/:key
router.put('/settings/:key', requireAdmin, (req, res) => {
  db.setSetting(req.params.key, req.body.value);
  res.json({ success: true });
});

module.exports = router;
