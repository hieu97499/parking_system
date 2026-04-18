require('dotenv').config();

module.exports = {

  ENTRY_SERIAL_PORT:   process.env.ENTRY_SERIAL_PORT   || 'COM6',
  EXIT_SERIAL_PORT:    process.env.EXIT_SERIAL_PORT    || 'COM11',
  SERIAL_BAUD:         parseInt(process.env.SERIAL_BAUD || '9600'),
  ENTRY_SERIAL_NUMBER: process.env.ENTRY_SERIAL_NUMBER || 'FX2348N',
  EXIT_SERIAL_NUMBER:  process.env.EXIT_SERIAL_NUMBER  || '7&3A95A8DB&0&4',

  AI_SERVICE_URL:    process.env.AI_SERVICE_URL    || 'http://localhost:5001',
  AI_TIMEOUT_MS:     parseInt(process.env.AI_TIMEOUT_MS || '10000'),

  BACKEND_URL:       process.env.BACKEND_URL       || 'http://localhost:4000',
  HARDWARE_API_KEY:  process.env.HARDWARE_API_KEY  || 'change_this_key',

  WS_PORT: parseInt(process.env.WS_PORT || '4002'),

  ENTRY_DEVICE_ID: process.env.ENTRY_DEVICE_ID || null,
  EXIT_DEVICE_ID:  process.env.EXIT_DEVICE_ID  || null,

  DEBOUNCE_MS: parseInt(process.env.DEBOUNCE_MS || '3000'),

  ESP8266_TCP_PORT: parseInt(process.env.ESP8266_TCP_PORT || '4003'),
};
