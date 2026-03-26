const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'f1handicap.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    team TEXT NOT NULL,
    team_color TEXT NOT NULL,
    championship_pts INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_picks (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    driver1_id INTEGER REFERENCES drivers(id),
    driver2_id INTEGER REFERENCES drivers(id),
    swaps_used INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round INTEGER NOT NULL,
    name TEXT NOT NULL,
    circuit TEXT NOT NULL,
    date TEXT NOT NULL,
    is_completed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER REFERENCES races(id),
    driver_id INTEGER REFERENCES drivers(id),
    points REAL DEFAULT 0,
    UNIQUE(race_id, driver_id)
  );

  -- Pre-computed scores per user per race (snapshotted at result entry time)
  CREATE TABLE IF NOT EXISTS user_race_scores (
    user_id INTEGER REFERENCES users(id),
    race_id INTEGER REFERENCES races(id),
    score REAL DEFAULT 0,
    driver1_id INTEGER,
    driver2_id INTEGER,
    driver1_name TEXT,
    driver2_name TEXT,
    PRIMARY KEY (user_id, race_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Default settings (INSERT OR IGNORE = only set if not already present)
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('picks_locked', '0')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('max_handicap', '30.0')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('season_year', '2025')").run();

module.exports = db;
