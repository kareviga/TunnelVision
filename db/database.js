const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'f1handicap.json');

function getInitialData() {
  return {
    users: [],
    drivers: [],
    user_picks: [],
    races: [],
    race_results: [],
    user_race_scores: [],
    settings: {
      picks_locked: '0',
      max_handicap: '30.0',
      season_year: '2025',
    },
  };
}

class JsonDB {
  constructor() {
    if (fs.existsSync(DB_PATH)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      } catch {
        this.data = getInitialData();
      }
    } else {
      this.data = getInitialData();
      this._save();
    }
  }

  _save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
  }

  // Settings
  getSetting(key) { return this.data.settings[key]; }
  setSetting(key, value) {
    this.data.settings[key] = String(value);
    this._save();
  }
  allSettings() { return { ...this.data.settings }; }

  // Table ops
  all(table) { return this.data[table] || []; }
  find(table, pred) { return this.all(table).filter(pred); }
  findOne(table, pred) { return this.all(table).find(pred) || null; }
  count(table) { return this.all(table).length; }

  insert(table, obj) {
    const arr = this.data[table];
    const maxId = arr.reduce((m, r) => Math.max(m, r.id || 0), 0);
    const newObj = { id: maxId + 1, created_at: new Date().toISOString(), ...obj };
    arr.push(newObj);
    this._save();
    return newObj;
  }

  // Upsert by a key field (e.g. user_picks keyed on user_id)
  upsert(table, keyField, keyValue, data) {
    const arr = this.data[table];
    const idx = arr.findIndex(r => r[keyField] === keyValue);
    if (idx > -1) {
      arr[idx] = { ...arr[idx], ...data };
    } else {
      arr.push({ ...data });
    }
    this._save();
  }

  // Upsert by composite key
  upsertBy(table, pred, data) {
    const arr = this.data[table];
    const idx = arr.findIndex(pred);
    if (idx > -1) {
      arr[idx] = { ...arr[idx], ...data };
    } else {
      arr.push({ ...data });
    }
    this._save();
  }

  update(table, pred, updates) {
    let changed = 0;
    for (const item of this.data[table]) {
      if (pred(item)) { Object.assign(item, updates); changed++; }
    }
    if (changed) this._save();
    return changed;
  }

  delete(table, pred) {
    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(r => !pred(r));
    const deleted = before - this.data[table].length;
    if (deleted) this._save();
    return deleted;
  }
}

module.exports = new JsonDB();
