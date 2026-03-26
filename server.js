require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// API routes (must be before static middleware)
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/picks',  require('./routes/picks'));
app.use('/api/league', require('./routes/league'));
app.use('/api/admin',  require('./routes/admin'));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`F1×Handicap running on http://localhost:${PORT}`);
  console.log(`First user to register will be admin.`);
});
