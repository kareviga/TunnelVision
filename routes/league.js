const router = require('express').Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/league/standings
router.get('/standings', requireAuth, (req, res) => {
  const users = db.all('users').filter(u => !u.is_admin);
  const drivers = db.all('drivers').sort((a, b) => b.championship_pts - a.championship_pts);
  const leaderPts = drivers[0]?.championship_pts || 0;
  const max = parseFloat(db.getSetting('max_handicap') || '30');

  function handicap(d) {
    if (leaderPts <= 0) return 1.0;
    if (d.championship_pts <= 0) return max;
    return +Math.min(leaderPts / d.championship_pts, max).toFixed(2);
  }

  const standings = users.map(user => {
    const scores = db.find('user_race_scores', r => r.user_id === user.id);
    const total = +scores.reduce((s, r) => s + r.score, 0).toFixed(1);

    const picks = db.findOne('user_picks', r => r.user_id === user.id);
    const d1 = picks?.driver1_id ? db.findOne('drivers', d => d.id === picks.driver1_id) : null;
    const d2 = picks?.driver2_id ? db.findOne('drivers', d => d.id === picks.driver2_id) : null;

    return {
      user_id: user.id,
      username: user.username,
      score: total,
      driver1: d1 ? { ...d1, handicap: handicap(d1) } : null,
      driver2: d2 ? { ...d2, handicap: handicap(d2) } : null,
      is_me: user.id === req.user.id,
    };
  });

  standings.sort((a, b) => b.score - a.score);
  res.json(standings);
});

// GET /api/league/my-races
router.get('/my-races', requireAuth, (req, res) => {
  const scores = db.find('user_race_scores', r => r.user_id === req.user.id);
  const enriched = scores.map(s => {
    const race = db.findOne('races', r => r.id === s.race_id);
    return { ...s, round: race?.round, race_name: race?.name };
  }).sort((a, b) => b.round - a.round);
  res.json(enriched);
});

// GET /api/league/settings
router.get('/settings', requireAuth, (req, res) => {
  const picksLocked = db.getSetting('picks_locked') === '1';
  const races = db.all('races').sort((a, b) => a.round - b.round);
  const nextRace = races.find(r => !r.is_completed) || null;
  const completedCount = races.filter(r => r.is_completed).length;
  res.json({ picks_locked: picksLocked, next_race: nextRace, completed_races: completedCount });
});

module.exports = router;
