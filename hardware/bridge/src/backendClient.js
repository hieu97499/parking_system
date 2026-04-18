

const axios = require('axios');
const cfg   = require('./config');

const http = axios.create({
  baseURL: cfg.BACKEND_URL,
  timeout: 8000,
  headers: {
    'x-hardware-key': cfg.HARDWARE_API_KEY,
    'Content-Type':   'application/json',
  },
});

async function reportEntry(payload) {
  const { data } = await http.post('/api/hardware/entry', payload);
  return data;
}

async function reportExit(payload) {
  const { data } = await http.post('/api/hardware/exit', payload);
  return data;
}

module.exports = { reportEntry, reportExit };
