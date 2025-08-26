// server.js — ללא חבילות חיצוניות, מוכן לפריסה
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const PORT = process.env.PORT || 3000; // ← פורט דינמי לפריסה (Render/Glitch וכו')
const AIRTABLE_PAT   = process.env.AIRTABLE_PAT || '';
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Leads';

const staticMap = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/success.html': 'success.html',
};

function serveStatic(res, file, contentType = 'text/html; charset=utf-8', code = 200) {
  const full = path.join(__dirname, file);
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      return res.end('Not found');
    }
    res.writeHead(code, {'Content-Type': contentType});
    res.end(data);
  });
}

function parseBody(req, cb) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  let raw = '';
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 1e6) req.destroy(); // הגבלת גודל בטיחותית
  });
  req.on('end', () => {
    try {
      if (ct.startsWith('application/json')) {
        return cb(null, JSON.parse(raw || '{}'));
      }
      if (ct.startsWith('application/x-www-form-urlencoded')) {
        return cb(null, querystring.parse(raw));
      }
      return cb(null, {}); // אין גוף/סוג אחר
    } catch (e) {
      cb(e);
    }
  });
}

function postToAirtable({ name, phone, email, age }, done) {
  if (!AIRTABLE_PAT || !AIRTABLE_BASE || !AIRTABLE_TABLE) {
    return done(new Error('Missing Airtable env vars: AIRTABLE_PAT / AIRTABLE_BASE_ID / AIRTABLE_TABLE_NAME'));
  }
  const body = JSON.stringify({
    records: [{ fields: { Name: name, 'Phone Number': phone, Email: email, Age: age } }]
  });
  const options = {
    hostname: 'api.airtable.com',
    path: `/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_PAT}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  const req = https.request(options, (r) => {
    let resp = '';
    r.on('data', d => resp += d);
    r.on('end', () => {
      if (r.statusCode >= 200 && r.statusCode < 300) return done(null, resp);
      return done(new Error(`Airtable error ${r.statusCode}: ${resp}`));
    });
  });
  req.on('error', done);
  req.write(body);
  req.end();
}

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // בדיקות מהירות
  if (req.method === 'GET' && req.url === '/whoami') {
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    return res.end('Node landing-page server OK');
  }
  if (req.method === 'GET' && req.url === '/api/lead/ping') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    return res.end(JSON.stringify({ ok: true }));
  }

  // קבצים סטטיים
  if (req.method === 'GET' && staticMap[req.url]) {
    const file = staticMap[req.url];
    const ct = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    return serveStatic(res, file, ct);
  }

  // קליטת טופס → Airtable → Redirect להצלחה
  if (req.method === 'POST' && req.url === '/api/lead') {
    return parseBody(req, (err, body) => {
      if (err) {
        res.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
        return res.end('Bad Request');
      }
      const name  = (body.name  || '').toString().trim();
      const phone = (body.phone || '').toString().trim();
      const email = (body.email || '').toString().trim();
      const age   = Number(body.age);

      if (!name || !phone || !email || Number.isNaN(age)) {
        res.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
        return res.end('Missing fields');
      }
      postToAirtable({ name, phone, email, age }, (e) => {
        if (e) {
          console.error(e);
          res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
          return res.end('Failed to write to Airtable');
        }
        res.writeHead(303, { Location: '/success.html' });
        return res.end();
      });
    });
  }

  // favicon (לא חובה)
  if (req.method === 'GET' && req.url === '/favicon.ico') {
    res.writeHead(204); return res.end();
  }

  // 404 ברירת מחדל
  res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
