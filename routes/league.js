const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/league/standings
router.get('/standings', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, username FROM users ORDER BY username').all();
  const leaderPts = db.prepare('SELECT MAX(championship_pts) as m FROM drivers').get().m || 0;
  const maxHandicap = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'max_handicap'").get()?.value || '30');

  const standings = users.map(user => {
    const totalScore = db.prepare(
      'SELECT COALESCE(SUM(score), 0) as total FROM user_race_scores WHERE user_id = ?'
    ).get(user.id).total;

    const picks = db.prepare('SELECT * FROM user_picks WHERE user_id = ?').get(user.id);
    let driver1 = null, driver2 = null;
    if (picks) {
      const d1 = picks.driver1_id ? db.prepare('SELECT * FROM drivers WHERE id = ?').get(picks.driver1_id) : null;
      const d2 = picks.driver2_id ? db.prepare('SELECT * FROM drivers WHERE id = ?').get(picks.driver2_id) : null;
      if (d1) driver1 = { ...d1, handicap: leaderPts > 0 ? +Math.min(leaderPts / Math.max(d1.championship_pts, 1), maxHandicap).toFixed(2) : 1 };
      if (d2) driver2 = { ...d2, handicap: leaderPts > 0 ? +Math.min(leaderPts / Math.max(d2.championship_pts, 1), maxHandicap).toFixed(2) : 1 };
    }

    return {
      user_id: user.id,
      username: user.username,
      score: +parseFloat(totalScore).toFixed(1),
      driver1,
      driver2,
      is_me: user.id === req.user.id,
    };
  });

  standings.sort((a, b) => b.score - a.score);
  res.json(standings);
});

// GET /api/league/my-races — race-by-race breakdown for current user
router.get('/my-races', requireAuth, (req, res) => {
  const scores = db.prepare(`
    SELECT urs.*, r.round, r.name as race_name
    FROM user_race_scores urs
    JOIN races r ON r.id = urs.race_id
    WHERE urs.user_id = ?
    ORDER BY r.round DESC
  `).all(req.user.id);
  res.json(scores);
});

// GET /api/league/settings — public app settings
router.get('/settings', requireAuth, (req, res) => {
  const picksLocked = db.prepare("SELECT value FROM settings WHERE key = 'picks_locked'").get()?.value === '1';
  const nextRace = db.prepare('SELECT * FROM races WHERE is_completed = 0 ORDER BY round ASC LIMIT 1').get();
  const completedCount = db.prepare('SELECT COUNT(*) as n FROM races WHERE is_completed = 1').get().n;
  res.json({ picks_locked: picksLocked, next_race: nextRace, completed_races: completedCount });
});

module.exports = router;
