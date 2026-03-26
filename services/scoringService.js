const db = require('../db/database');

/**
 * Compute and store each user's score for a given race.
 * Uses current picks snapshot + race results entered by admin.
 * Runs atomically in a single SQLite transaction.
 */
function computeRaceScores(raceId) {
  const computeAndStore = db.transaction(() => {
    // Validate race exists and has results
    const race = db.prepare('SELECT * FROM races WHERE id = ?').get(raceId);
    if (!race) throw new Error('Race not found');

    const results = db.prepare('SELECT * FROM race_results WHERE race_id = ?').all(raceId);
    if (results.length === 0) throw new Error('No results entered for this race');

    // Build a map: driver_id → race_pts
    const racePoints = {};
    for (const r of results) racePoints[r.driver_id] = r.points;

    // Compute each driver's cumulative championship points (sum of ALL completed race results)
    const driverCumPts = db.prepare(`
      SELECT rr.driver_id, SUM(rr.points) as total
      FROM race_results rr
      JOIN races r ON r.id = rr.race_id
      WHERE r.is_completed = 1 OR r.id = ?
      GROUP BY rr.driver_id
    `).all(raceId);

    const cumPtsMap = {};
    for (const d of driverCumPts) cumPtsMap[d.driver_id] = d.total;

    const leaderPts = Math.max(...Object.values(cumPtsMap), 1);

    const maxHandicap = parseFloat(
      db.prepare("SELECT value FROM settings WHERE key = 'max_handicap'").get()?.value || '30'
    );

    function getHandicap(driverId) {
      const pts = cumPtsMap[driverId] || 0;
      if (pts <= 0) return maxHandicap;
      return Math.min(leaderPts / pts, maxHandicap);
    }

    // Update cached championship_pts on each driver
    const updatePts = db.prepare('UPDATE drivers SET championship_pts = ? WHERE id = ?');
    for (const [driverId, pts] of Object.entries(cumPtsMap)) {
      updatePts.run(pts, driverId);
    }

    // For every user, compute their score using current picks
    const users = db.prepare('SELECT id FROM users').all();
    const insertScore = db.prepare(`
      INSERT OR REPLACE INTO user_race_scores
        (user_id, race_id, score, driver1_id, driver2_id, driver1_name, driver2_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const user of users) {
      const picks = db.prepare('SELECT * FROM user_picks WHERE user_id = ?').get(user.id);
      if (!picks || !picks.driver1_id || !picks.driver2_id) continue;

      const d1 = db.prepare('SELECT * FROM drivers WHERE id = ?').get(picks.driver1_id);
      const d2 = db.prepare('SELECT * FROM drivers WHERE id = ?').get(picks.driver2_id);
      if (!d1 || !d2) continue;

      const pts1 = racePoints[d1.id] || 0;
      const pts2 = racePoints[d2.id] || 0;
      const hf1 = getHandicap(d1.id);
      const hf2 = getHandicap(d2.id);
      const score = pts1 * hf1 + pts2 * hf2;

      insertScore.run(
        user.id, raceId, +score.toFixed(2),
        d1.id, d2.id, d1.name, d2.name
      );
    }

    // Mark race as completed
    db.prepare('UPDATE races SET is_completed = 1 WHERE id = ?').run(raceId);
  });

  computeAndStore();
}

/**
 * Clear a race's results so the admin can re-enter them.
 */
function clearRaceScores(raceId) {
  const clear = db.transaction(() => {
    db.prepare('DELETE FROM race_results WHERE race_id = ?').run(raceId);
    db.prepare('DELETE FROM user_race_scores WHERE race_id = ?').run(raceId);
    db.prepare('UPDATE races SET is_completed = 0 WHERE id = ?').run(raceId);

    // Recompute cached championship_pts from remaining completed races
    db.prepare('UPDATE drivers SET championship_pts = 0').run();
    const remaining = db.prepare(`
      SELECT rr.driver_id, SUM(rr.points) as total
      FROM race_results rr
      JOIN races r ON r.id = rr.race_id
      WHERE r.is_completed = 1
      GROUP BY rr.driver_id
    `).all();
    const updatePts = db.prepare('UPDATE drivers SET championship_pts = ? WHERE id = ?');
    for (const d of remaining) updatePts.run(d.total, d.driver_id);
  });
  clear();
}

module.exports = { computeRaceScores, clearRaceScores };
