// server.js
const express = require('express');
const dotenv  = require('dotenv');
const fetch   = require('node-fetch'); // v2
const cors    = require('cors');
const path    = require('path');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

// לוג בסיסי
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// סטטי בלי אינדקס אוטומטי + קאש-קונטרול
app.use(express.static(__dirname, {
  index: false,
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// ===== כאן שמים את הראוטים של הדפים =====
function sendNoCache(res, filename) {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, filename));
}

// "/" יגיש את דף הבית
app.get('/', (req, res) => {
  sendNoCache(res, 'home.html');
});

// הרשמה ותודה
app.get(['/register', '/register.html', '/index.html'], (req, res) => {
  sendNoCache(res, 'index.html');
});
app.get(['/success', '/success.html'], (req, res) => {
  sendNoCache(res, 'success.html');
});

// ===== בדיקות =====
app.get('/whoami', (_req, res) => res.send('Node landing-page server OK'));
app.get('/api/lead/ping', (_req, res) => res.json({ ok: true }));

// ===== API =====
app.get('/api/lead', (_req, res) => res.status(405).send('Use POST /api/lead'));

app.post('/api/lead', async (req, res) => {
  const name  = (req.body.name  || '').trim();
  const phone = (req.body.phone || '').trim();
  const email = (req.body.email || '').trim();
  const age   = Number(req.body.age);

  if (!name || !phone || !email || Number.isNaN(age)) {
    return res.status(400).send('Missing fields');
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const table  = process.env.AIRTABLE_TABLE_NAME;
  const apiKey = process.env.AIRTABLE_PAT;

  if (!baseId || !table || !apiKey) {
    return res.status(500).send('Airtable env vars missing');
  }

  const url  = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const body = {
    records: [{ fields: { Name: name, 'Phone Number': phone, Email: email, Age: age } }]
  };

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (r.ok) {
      return res.redirect(303, '/success.html');
    }

    const text = await r.text();
    console.error('Airtable error:', text);
    return res.status(r.status).type('application/json').send(text);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Unexpected server error');
  }
});

// האזנה
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
