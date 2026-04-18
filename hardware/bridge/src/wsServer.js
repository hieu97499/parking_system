

const { WebSocketServer } = require('ws');
const cfg                 = require('./config');
const serial              = require('./esp8266Handler');

let wss = null;
let _controller = null;

function setController(ctrl) { _controller = ctrl; }

function start() {
  wss = new WebSocketServer({ port: cfg.WS_PORT });
  console.log(`[WS] WebSocket server lắng nghe cổng ${cfg.WS_PORT}`);

  wss.on('connection', (ws) => {
    console.log('[WS] Admin Web kết nối');
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Hardware Bridge ready' }));

    ws.on('message', raw => {
      try {
        const { type, gate } = JSON.parse(raw);
        if (type === 'OPEN_BARRIER')  { if (gate) serial.openBarrier(gate); return; }
        if (type === 'CLOSE_BARRIER') { if (gate) serial.closeBarrier(gate); return; }

        if (type === 'SIMULATE_SENSOR') {
          const g = gate || 'entry';
          console.log(`[WS] SIMULATE_SENSOR gate=${g}`);
          if (_controller) _controller.simulate(g);
          return;
        }
      } catch (e) { console.error('[WS] message parse error:', e.message); }
    });

    ws.on('error', err => console.error('[WS] lỗi client:', err.message));
  });
}

function broadcast(type, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1 ) {
      client.send(msg);
    }
  });
}

module.exports = { start, broadcast, setController };
