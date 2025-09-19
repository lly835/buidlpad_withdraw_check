const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const ADDRESS_FILE = path.resolve(__dirname, 'address.txt');

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/api/check-address', async (req, res) => {
  const rawAddress = typeof req.query.address === 'string' ? req.query.address.trim() : '';
  if (!rawAddress) {
    return res.status(400).json({ status: 'error', message: 'address query parameter is required' });
  }

  try {
    const content = await fs.readFile(ADDRESS_FILE, 'utf8');
    const allowedAddresses = content
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);

    const isFound = allowedAddresses.includes(rawAddress.toLowerCase());

    if (isFound) {
      return res.json({ status: 'found' });
    }

    return res.json({ status: 'not_found' });
  } catch (error) {
    console.error('Failed to read address file', error);
    return res.status(500).json({ status: 'error', message: 'internal error' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Address validator backend listening on http://${HOST}:${PORT}`);
});
