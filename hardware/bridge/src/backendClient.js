

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

async function logManualEvent(payload) {
  try {
    await http.post('/api/hardware/manual-event', payload);
  } catch (_) {}  // best-effort, không crash bridge
}

async function fetchSlots() {
  const { data } = await http.get('/api/hardware/slots');
  return data;  // { available_slots, capacity, occupied }
}

async function fetchGuestPaymentStatus(sessionCode) {
  const { data } = await http.get(`/api/hardware/guest-payment-status/${sessionCode}`);
  return data;
}

module.exports = { reportEntry, reportExit, logManualEvent, fetchSlots, fetchGuestPaymentStatus };
