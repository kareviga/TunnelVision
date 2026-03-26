const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

function getHandicap(driverPts, leaderPts, maxHandicap) {
  if (leaderPts <= 0) return 1.0;
  if (driverPts <= 0) return maxHandicap;
  return Math.min(leaderPts / driverPts, maxHandicap);
}

function enrichDriver(driver, leaderPts, maxHandicap) {
  return {
    ...driver,
    handicap: +getHandicap(driver.championship_pts, leaderPts, maxHandicap).toFixed(2),
  };
}

// GET /api/picks/drivers — all drivers with live handicaps
router.get('/drivers', requireAuth, (req, res) => {
  const drivers = db.prepare('SELECT * FROM drivers ORDER BY championship_pts DESC').all();
  const leaderPts = drivers[0]?.championship_pts || 0;
  const maxHandicap = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'max_handicap'").get()?.value || '30');
  res.json(drivers.map(d => enrichDriver(d, leaderPts, maxHandicap)));
});

// GET /api/picks/my — current user's picks
router.get('/my', requireAuth, (req, res) => {
  const picks = db.prepare('SELECT * FROM user_picks WHERE user_id = ?').get(req.user.id);
  if (!picks) return res.json({ driver1: null, driver2: null, swaps_used: 0 });

  const leaderPts = db.prepare('SELECT MAX(championship_pts) as m FROM drivers').get().m || 0;
  const maxHandicap = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'max_handicap'").get()?.value || '30');

  const d1 = picks.driver1_id ? db.prepare('SELECT * FROM drivers WHERE id = ?').get(picks.driver1_id) : null;
  const d2 = picks.driver2_id ? db.prepare('SELECT * FROM drivers WHERE id = ?').get(picks.driver2_id) : null;

  res.json({
    driver1: d1 ? enrichDriver(d1, leaderPts, maxHandicap) : null,
    driver2: d2 ? enrichDriver(d2, leaderPts, maxHandicap) : null,
    swaps_used: picks.swaps_used,
  });
});

// PUT /api/picks — set driver picks
router.put('/', requireAuth, (req, res) => {
  const locked = db.prepare("SELECT value FROM settings WHERE key = 'picks_locked'").get()?.value === '1';
  if (locked) return res.status(403).json({ error: 'Picks are locked — race weekend in progress' });

  const { driver1_id, driver2_id } = req.body;
  if (!driver1_id || !driver2_id) return res.status(400).json({ error: 'Must select 2 drivers' });
  if (driver1_id === driver2_id) return res.status(400).json({ error: 'Must select 2 different drivers' });

  const d1 = db.prepare('SELECT id FROM drivers WHERE id = ?').get(driver1_id);
  const d2 = db.prepare('SELECT id FROM drivers WHERE id = ?').get(driver2_id);
  if (!d1 || !d2) return res.status(400).json({ error: 'Invalid driver selection' });

  const existing = db.prepare('SELECT * FROM user_picks WHERE user_id = ?').get(req.user.id);

  if (!existing) {
    db.prepare('INSERT INTO user_picks (user_id, driver1_id, driver2_id, swaps_used) VALUES (?, ?, ?, 0)')
      .run(req.user.id, driver1_id, driver2_id);
  } else {
    const swapsUsed = existing.driver1_id ? existing.swaps_used + 1 : existing.swaps_used;
    db.prepare(`UPDATE user_picks SET driver1_id = ?, driver2_id = ?, swaps_used = ?,
      last_updated = CURRENT_TIMESTAMP WHERE user_id = ?`)
      .run(driver1_id, driver2_id, swapsUsed, req.user.id);
  }

  res.json({ success: true });
});

module.exports = router;
