const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

function calcHandicap(driverPts, leaderPts, maxHandicap) {
  if (leaderPts <= 0) return 1.0;
  if (driverPts <= 0) return maxHandicap;
  return Math.min(leaderPts / driverPts, maxHandicap);
}

function enrichDriver(d, leaderPts, maxHandicap) {
  return { ...d, handicap: +calcHandicap(d.championship_pts, leaderPts, maxHandicap).toFixed(2) };
}

// GET /api/picks/drivers
router.get('/drivers', requireAuth, (req, res) => {
  const drivers = db.all('drivers').sort((a, b) => b.championship_pts - a.championship_pts);
  const leaderPts = drivers[0]?.championship_pts || 0;
  const max = parseFloat(db.getSetting('max_handicap') || '30');
  res.json(drivers.map(d => enrichDriver(d, leaderPts, max)));
});

// GET /api/picks/my
router.get('/my', requireAuth, (req, res) => {
  const picks = db.findOne('user_picks', r => r.user_id === req.user.id);
  if (!picks) return res.json({ driver1: null, driver2: null, swaps_used: 0 });

  const drivers = db.all('drivers').sort((a, b) => b.championship_pts - a.championship_pts);
  const leaderPts = drivers[0]?.championship_pts || 0;
  const max = parseFloat(db.getSetting('max_handicap') || '30');

  const d1 = picks.driver1_id ? db.findOne('drivers', d => d.id === picks.driver1_id) : null;
  const d2 = picks.driver2_id ? db.findOne('drivers', d => d.id === picks.driver2_id) : null;

  res.json({
    driver1: d1 ? enrichDriver(d1, leaderPts, max) : null,
    driver2: d2 ? enrichDriver(d2, leaderPts, max) : null,
    swaps_used: picks.swaps_used,
  });
});

// PUT /api/picks
router.put('/', requireAuth, (req, res) => {
  if (db.getSetting('picks_locked') === '1') {
    return res.status(403).json({ error: 'Picks are locked — race weekend in progress' });
  }

  const { driver1_id, driver2_id } = req.body;
  if (!driver1_id || !driver2_id) return res.status(400).json({ error: 'Must select 2 drivers' });
  if (driver1_id === driver2_id) return res.status(400).json({ error: 'Must select 2 different drivers' });

  if (!db.findOne('drivers', d => d.id === driver1_id) || !db.findOne('drivers', d => d.id === driver2_id)) {
    return res.status(400).json({ error: 'Invalid driver selection' });
  }

  const existing = db.findOne('user_picks', r => r.user_id === req.user.id);
  const swapsUsed = existing?.driver1_id ? (existing.swaps_used + 1) : (existing?.swaps_used || 0);

  db.upsert('user_picks', 'user_id', req.user.id, {
    user_id: req.user.id, driver1_id, driver2_id,
    swaps_used: swapsUsed,
    last_updated: new Date().toISOString(),
  });

  res.json({ success: true });
});

module.exports = router;
