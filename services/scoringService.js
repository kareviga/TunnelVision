const db = require('../db/database');

function computeRaceScores(raceId) {
  const race = db.findOne('races', r => r.id === raceId);
  if (!race) throw new Error('Race not found');

  const results = db.find('race_results', r => r.race_id === raceId);
  if (results.length === 0) throw new Error('No results entered for this race');

  // Map driver_id → points scored THIS race
  const racePoints = {};
  for (const r of results) racePoints[r.driver_id] = r.points;

  // Compute cumulative championship pts for each driver (all completed races + this one)
  const completedRaceIds = db.find('races', r => r.is_completed).map(r => r.id);
  const allRelevantRaceIds = new Set([...completedRaceIds, raceId]);

  const allResults = db.find('race_results', r => allRelevantRaceIds.has(r.race_id));
  const cumPts = {};
  for (const r of allResults) {
    cumPts[r.driver_id] = (cumPts[r.driver_id] || 0) + r.points;
  }

  const leaderPts = Math.max(...Object.values(cumPts), 1);
  const maxHandicap = parseFloat(db.getSetting('max_handicap') || '30');

  function getHandicap(driverId) {
    const pts = cumPts[driverId] || 0;
    if (pts <= 0) return maxHandicap;
    return Math.min(leaderPts / pts, maxHandicap);
  }

  // Update cached championship_pts on each driver
  for (const [driverId, pts] of Object.entries(cumPts)) {
    db.update('drivers', d => d.id === parseInt(driverId), { championship_pts: pts });
  }

  // Compute and store score for each user
  const users = db.all('users');
  for (const user of users) {
    const picks = db.findOne('user_picks', r => r.user_id === user.id);
    if (!picks?.driver1_id || !picks?.driver2_id) continue;

    const d1 = db.findOne('drivers', d => d.id === picks.driver1_id);
    const d2 = db.findOne('drivers', d => d.id === picks.driver2_id);
    if (!d1 || !d2) continue;

    const pts1 = racePoints[d1.id] || 0;
    const pts2 = racePoints[d2.id] || 0;
    const score = +(pts1 * getHandicap(d1.id) + pts2 * getHandicap(d2.id)).toFixed(2);

    db.upsertBy(
      'user_race_scores',
      r => r.user_id === user.id && r.race_id === raceId,
      { user_id: user.id, race_id: raceId, score, driver1_id: d1.id, driver2_id: d2.id, driver1_name: d1.name, driver2_name: d2.name }
    );
  }

  // Mark race complete
  db.update('races', r => r.id === raceId, { is_completed: true });
}

function clearRaceScores(raceId) {
  db.delete('race_results', r => r.race_id === raceId);
  db.delete('user_race_scores', r => r.race_id === raceId);
  db.update('races', r => r.id === raceId, { is_completed: false });

  // Recompute cached championship_pts from remaining completed races
  const drivers = db.all('drivers');
  for (const driver of drivers) {
    const completedResults = db.find('race_results', r => r.driver_id === driver.id);
    const completedRaceIds = new Set(db.find('races', r => r.is_completed).map(r => r.id));
    const total = completedResults
      .filter(r => completedRaceIds.has(r.race_id))
      .reduce((s, r) => s + r.points, 0);
    db.update('drivers', d => d.id === driver.id, { championship_pts: total });
  }
}

module.exports = { computeRaceScores, clearRaceScores };
