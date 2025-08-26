// server.js
const express = require('express');
const dotenv  = require('dotenv');
const fetch   = require('node-fetch'); // v2
const cors    = require('cors');
const path    = require('path');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

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

function sendNoCache(res, filename) {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, filename));
}

app.get('/', (req, res) => sendNoCache(res, 'home.html'));
app.get(['/register', '/register.html', '/index.html'], (req, res) => sendNoCache(res, 'index.html'));
app.get(['/success', '/success.html'], (req, res) => sendNoCache(res, 'success.html'));

app.get('/whoami', (_req, res) => res.send('Node landing-page server OK'));
app.get('/api/lead/ping', (_req, res) => res.json({ ok: true }));

const reHeb = /^[\u0590-\u05FF\s'\-]+$/;
const reEng = /^[A-Za-z\s'\-]+$/;
function isHebrew(s){ return /[\u0590-\u05FF]/.test(s); }
function isEnglish(s){ return /[A-Za-z]/.test(s); }

function validateName(name){
  if (!name) return false;
  if (/\d/.test(name)) return false;
  const hasHeb = isHebrew(name);
  const hasEng = isEnglish(name);
  if (hasHeb && hasEng) return false;
  return hasHeb ? reHeb.test(name) : reEng.test(name);
}
function normalizePhone(p){ return String(p||'').replace(/\D/g,''); }
function validatePhone(p){ return /^\d{10}$/.test(normalizePhone(p)); }

// >>> אימייל עם ספרות מותרות (עדיין ASCII בלבד)
function validateEmail(email){
  if (!email) return false;
  const re = /^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*@[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+$/;
  return re.test(email);
}

app.get('/api/lead', (_req, res) => res.status(405).send('Use POST /api/lead'));

app.post('/api/lead', async (req, res) => {
  const name  = (req.body.name  || '').trim();
  const phone = (req.body.phone || '').trim();
  const email = (req.body.email || '').trim();
  const age   = Number(req.body.age);

  if (!name || !phone || !email || Number.isNaN(age)) {
    return res.status(400).send('יש למלא את כל השדות.');
  }
  if (!validateName(name))   return res.status(400).send('שם חייב להיות בשפה אחת (עברית או אנגלית), בלי ספרות.');
  if (!validatePhone(phone)) return res.status(400).send('מספר טלפון חייב להכיל 10 ספרות בלבד.');
  if (!validateEmail(email)) return res.status(400).send('אימייל חייב להכיל @ ומותר בו אותיות באנגלית וספרות בלבד.');

  const phoneDigits = normalizePhone(phone);
  const emailLower  = email.toLowerCase();

  const baseId = process.env.AIRTABLE_BASE_ID;
  const table  = process.env.AIRTABLE_TABLE_NAME;
  const apiKey = process.env.AIRTABLE_PAT;

  if (!baseId || !table || !apiKey) {
    return res.status(500).send('Airtable env vars missing');
  }

  // בדיקת כפילויות
  try {
    const formula = `OR({Email}="${emailLower}", {Phone Number}="${phoneDigits}")`;
    const dupURL  = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?pageSize=1&filterByFormula=${encodeURIComponent(formula)}`;
    const dupRes  = await fetch(dupURL, { headers: { Authorization: `Bearer ${apiKey}` } });

    if (!dupRes.ok) {
      const t = await dupRes.text();
      console.error('Airtable duplicate-check error:', t);
      return res.status(502).send('שגיאה מול Airtable בבדיקת כפילויות.');
    }

    const dupJson = await dupRes.json();
    if (Array.isArray(dupJson.records) && dupJson.records.length > 0) {
      return res.status(409).send('האימייל או מספר הטלפון כבר קיימים במערכת.');
    }
  } catch (e) {
    console.error('Duplicate-check exception:', e);
    return res.status(502).send('שגיאה בבדיקת כפילויות.');
  }

  // יצירה
  const url  = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const body = {
    records: [{
      fields: {
        Name: name,
        'Phone Number': phoneDigits,
        Email: emailLower,
        Age: age
      }
    }]
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
