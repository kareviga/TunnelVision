const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.trim().length < 2 || username.trim().length > 20) {
    return res.status(400).json({ error: 'Username must be 2–20 characters' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return res.status(400).json({ error: 'Username: letters, numbers, underscores only' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash = bcrypt.hashSync(password, 10);

  // First registered user becomes admin
  const register = db.transaction(() => {
    const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
    const isAdmin = userCount === 0 ? 1 : 0;
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)'
    ).run(username.trim(), hash, isAdmin);
    return { id: result.lastInsertRowid, isAdmin };
  });

  const { id, isAdmin } = register();
  const token = jwt.sign({ id, username: username.trim(), is_admin: isAdmin }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: username.trim(), is_admin: isAdmin });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, username: user.username, is_admin: user.is_admin });
});

module.exports = router;
