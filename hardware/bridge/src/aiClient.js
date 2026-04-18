

const axios = require('axios');
const cfg   = require('./config');

const http = axios.create({
  baseURL: cfg.AI_SERVICE_URL,
  timeout: cfg.AI_TIMEOUT_MS,
});

async function processEntry() {
  const { data } = await http.post('/process/entry');
  return data;
}

async function processExit() {
  const { data } = await http.post('/process/exit');
  return data;
}

async function reloadFaces() {
  const { data } = await http.post('/faces/reload');
  return data;
}

async function healthCheck() {
  try {
    const { data } = await http.get('/health');
    return data;
  } catch {
    return null;
  }
}

module.exports = { processEntry, processExit, reloadFaces, healthCheck };
