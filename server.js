const express = require('express');
const dotenv  = require('dotenv');
const fetch   = require('node-fetch');

dotenv.config();

const app = express();
app.use(express.json());

// Serve static files (index.html and success.html)
app.use(express.static(__dirname));

// API endpoint to receive form data and send to Airtable
app.post('/api/lead', async (req, res) => {
  const { name, phone, email, age } = req.body || {};

  if (!name || !phone || !email || typeof age !== 'number') {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const baseId  = process.env.AIRTABLE_BASE_ID;
  const table   = process.env.AIRTABLE_TABLE_NAME;
  const apiKey  = process.env.AIRTABLE_PAT;

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const body = {
    records: [
      {
        fields: {
          Name:         name,
          'Phone Number': phone,
          Email:        email,
          Age:          age
        }
      }
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    return res.status(response.status).type('application/json').send(text);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
