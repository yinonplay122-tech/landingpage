// server.js
const express = require('express');
const dotenv  = require('dotenv');
const fetch   = require('node-fetch'); // v2
const cors    = require('cors');
const path    = require('path');

dotenv.config();
const app  = express();
const PORT = process.env.PORT || 3001;

// לוג
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// סטטי: HTML ללא קאש, נכסים אחרים עם קאש ארוך
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

const sendNoCache = (res, file) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, file));
};

// דפים
app.get('/',                   (_req, res) => sendNoCache(res, 'index.html'));    // HOME (היה home.html)
app.get(['/register','/register.html'], (_req, res) => sendNoCache(res, 'register.html'));
app.get(['/success','/success.html'],   (_req, res) => sendNoCache(res, 'success.html'));

// בדיקות
app.get('/whoami',        (_req, res) => res.send('Node landing-page server OK'));
app.get('/api/lead/ping', (_req, res) => res.json({ ok: true }));

// ולידציות צד-שרת (כמו שכבר בנינו)
const nameHeb = /^[\u0590-\u05FF\s'-]+$/;
const nameEng = /^[A-Za-z\s'-]+$/;
const phoneRe = /^\d{10}$/;
const emailRe = /^[A-Za-z]+@[A-Za-z]+\.[A-Za-z]+$/;
const isValidName  = s => nameHeb.test(s) || nameEng.test(s);
const isValidPhone = s => phoneRe.test(s);
const isValidEmail = s => emailRe.test(s);
const escAT = s => String(s).replace(/'/g, "''");

// API
app.get('/api/lead', (_req, res) => res.status(405).send('Use POST /api/lead'));

app.post('/api/lead', async (req, res) => {
  const name  = (req.body.name  || '').trim();
  const phone = (req.body.phone || '').trim();
  const email = (req.body.email || '').trim();
  const age   = Number(req.body.age);

  if (!isValidName(name) || !isValidPhone(phone) || !isValidEmail(email) || Number.isNaN(age)) {
    return res.status(422).json({ ok:false, error:'VALIDATION', message:'אחד מהשדות לא הוזן כראוי' });
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const table  = process.env.AIRTABLE_TABLE_NAME;
  const apiKey = process.env.AIRTABLE_PAT;
  if (!baseId || !table || !apiKey) {
    return res.status(500).json({ ok:false, error:'ENV', message:'Airtable env vars missing' });
    }

  const filter = `OR({Email}='${escAT(email)}',{Phone Number}='${escAT(phone)}')`;
  const listURL = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=1&filterByFormula=${encodeURIComponent(filter)}`;

  try {
    const checkResp = await fetch(listURL, { headers: { Authorization: `Bearer ${apiKey}` }});
    if (!checkResp.ok) return res.status(502).json({ ok:false, error:'AIRTABLE_LIST', message:'שגיאה בבדיקת כפילויות' });
    const checkData = await checkResp.json();
    if (Array.isArray(checkData.records) && checkData.records.length > 0) {
      return res.status(409).json({ ok:false, error:'EXISTS', message:'קיים ברשימה' });
    }

    const createURL = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
    const body = { records: [{ fields: { Name: name, 'Phone Number': phone, Email: email, Age: age } }] };
    const createResp = await fetch(createURL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (createResp.ok) return res.redirect(303, '/success.html');

    const text = await createResp.text();
    console.error('Airtable create error:', text);
    return res.status(createResp.status).type('application/json').send(text);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, error:'SERVER', message:'Unexpected server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
