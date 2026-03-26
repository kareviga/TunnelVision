// Run once: node db/seed.js
// Seeds the 2025 F1 driver grid
require('dotenv').config();
const db = require('./database');

const count = db.prepare('SELECT COUNT(*) as n FROM drivers').get().n;
if (count > 0) {
  console.log('Drivers already seeded. Delete the db file and re-run to reset.');
  process.exit(0);
}

const insert = db.prepare(`
  INSERT INTO drivers (number, name, short_name, team, team_color, championship_pts)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const drivers = [
  [1,  'Max Verstappen',     'Verstappen', 'Red Bull Racing', '#3671C6', 0],
  [4,  'Lando Norris',       'Norris',     'McLaren',         '#FF8000', 0],
  [16, 'Charles Leclerc',    'Leclerc',    'Ferrari',         '#E8002D', 0],
  [81, 'Oscar Piastri',      'Piastri',    'McLaren',         '#FF8000', 0],
  [63, 'George Russell',     'Russell',    'Mercedes',        '#27F4D2', 0],
  [44, 'Lewis Hamilton',     'Hamilton',   'Ferrari',         '#E8002D', 0],
  [14, 'Fernando Alonso',    'Alonso',     'Aston Martin',    '#358C75', 0],
  [55, 'Carlos Sainz',       'Sainz',      'Williams',        '#37BEDD', 0],
  [12, 'Kimi Antonelli',     'Antonelli',  'Mercedes',        '#27F4D2', 0],
  [30, 'Liam Lawson',        'Lawson',     'Red Bull Racing', '#3671C6', 0],
  [18, 'Lance Stroll',       'Stroll',     'Aston Martin',    '#358C75', 0],
  [23, 'Alexander Albon',    'Albon',      'Williams',        '#37BEDD', 0],
  [10, 'Pierre Gasly',       'Gasly',      'Alpine',          '#0093CC', 0],
  [87, 'Oliver Bearman',     'Bearman',    'Haas',            '#B6BABD', 0],
  [22, 'Yuki Tsunoda',       'Tsunoda',    'RB Honda',        '#6692FF', 0],
  [6,  'Isack Hadjar',       'Hadjar',     'RB Honda',        '#6692FF', 0],
  [27, 'Nico Hülkenberg',    'Hülkenberg', 'Sauber',          '#52E252', 0],
  [5,  'Gabriel Bortoleto',  'Bortoleto',  'Sauber',          '#52E252', 0],
  [31, 'Esteban Ocon',       'Ocon',       'Haas',            '#B6BABD', 0],
  [7,  'Jack Doohan',        'Doohan',     'Alpine',          '#0093CC', 0],
];

const seedAll = db.transaction(() => {
  for (const d of drivers) insert.run(...d);
});
seedAll();

// Seed the 2025 race calendar
const insertRace = db.prepare('INSERT INTO races (round, name, circuit, date) VALUES (?, ?, ?, ?)');
const races = [
  [1,  'Australian GP',     'Melbourne',  '2025-03-16'],
  [2,  'Chinese GP',        'Shanghai',   '2025-03-23'],
  [3,  'Japanese GP',       'Suzuka',     '2025-04-06'],
  [4,  'Bahrain GP',        'Sakhir',     '2025-04-13'],
  [5,  'Saudi Arabian GP',  'Jeddah',     '2025-04-20'],
  [6,  'Miami GP',          'Miami',      '2025-05-04'],
  [7,  'Emilia Romagna GP', 'Imola',      '2025-05-18'],
  [8,  'Monaco GP',         'Monaco',     '2025-05-25'],
  [9,  'Spanish GP',        'Barcelona',  '2025-06-01'],
  [10, 'Canadian GP',       'Montreal',   '2025-06-15'],
  [11, 'Austrian GP',       'Spielberg',  '2025-06-29'],
  [12, 'British GP',        'Silverstone','2025-07-06'],
  [13, 'Belgian GP',        'Spa',        '2025-07-27'],
  [14, 'Hungarian GP',      'Budapest',   '2025-08-03'],
  [15, 'Dutch GP',          'Zandvoort',  '2025-08-31'],
  [16, 'Italian GP',        'Monza',      '2025-09-07'],
  [17, 'Azerbaijan GP',     'Baku',       '2025-09-21'],
  [18, 'Singapore GP',      'Singapore',  '2025-10-05'],
  [19, 'US GP',             'Austin',     '2025-10-19'],
  [20, 'Mexico City GP',    'Mexico City','2025-10-26'],
  [21, 'São Paulo GP',      'São Paulo',  '2025-11-09'],
  [22, 'Las Vegas GP',      'Las Vegas',  '2025-11-22'],
  [23, 'Qatar GP',          'Lusail',     '2025-11-30'],
  [24, 'Abu Dhabi GP',      'Yas Marina', '2025-12-07'],
];

const seedRaces = db.transaction(() => {
  for (const r of races) insertRace.run(...r);
});
seedRaces();

console.log(`✓ Seeded ${drivers.length} drivers and ${races.length} races`);
