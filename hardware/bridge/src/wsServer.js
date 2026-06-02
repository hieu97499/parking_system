

const http   = require('http');
const https  = require('https');
const path   = require('path');
const fs     = require('fs');
const { WebSocketServer } = require('ws');
const cfg     = require('./config');
const serial  = require('./esp8266Handler');
const backend = require('./backendClient');

let wss = null;
let _controller = null;

function setController(ctrl) { _controller = ctrl; }

function start() {
  // HTTP thuần – không cần SSL cert, Operator Web chạy local http://localhost:5200
  // nên không có mixed-content issue
  const httpServer = http.createServer();

  // Handle HTTP requests: CORS preflight + MJPEG stream proxy
  httpServer.on('request', (req, res) => {
    const origin = req.headers.origin || '*';
    const baseCors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Allow-Credentials': 'true',
    };
    Object.entries(baseCors).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // MJPEG proxy: GET /stream/:camIndex → pipe từ AI Service
    const streamMatch = req.url && req.url.match(/^\/stream\/(\d+)(?:[?#].*)?$/);
    if (streamMatch) {
      const camIndex = streamMatch[1];
      const aiBase   = (cfg.AI_SERVICE_URL || 'http://localhost:5001').replace(/\/$/, '');
      const aiUrl    = `${aiBase}/stream/${camIndex}`;
      const proto    = aiUrl.startsWith('https') ? https : http;
      const aiReq    = proto.get(aiUrl, { rejectUnauthorized: false }, aiRes => {
        res.writeHead(200, {
          ...baseCors,
          'Content-Type': aiRes.headers['content-type'] || 'multipart/x-mixed-replace;boundary=frame',
          'Cache-Control': 'no-cache, no-store',
          'Connection':    'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        aiRes.pipe(res);
        req.on('close', () => { try { aiReq.destroy(); } catch (_) {} });
      });
      aiReq.on('error', err => {
        console.error(`[Stream proxy] cam${camIndex} error: ${err.message}`);
        if (!res.headersSent) res.writeHead(503, baseCors);
        res.end();
      });
      return;
    }

    // Generic AI Service proxy: /ai/* → forward đến AI_SERVICE_URL/*
    if (req.url && req.url.startsWith('/ai/')) {
      const aiBase = (cfg.AI_SERVICE_URL || 'http://localhost:5001').replace(/\/$/, '');
      const target = `${aiBase}${req.url.slice(3)}`; // bỏ "/ai" prefix
      const proto  = target.startsWith('https') ? https : http;
      const u      = new URL(target);
      const opts = {
        method: req.method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: { ...req.headers, host: u.host },
        rejectUnauthorized: false,
      };
      const aiReq = proto.request(opts, aiRes => {
        const headers = { ...aiRes.headers, ...baseCors };
        res.writeHead(aiRes.statusCode || 200, headers);
        aiRes.pipe(res);
      });
      aiReq.on('error', err => {
        console.error(`[AI proxy] ${req.url} → ${err.message}`);
        if (!res.headersSent) res.writeHead(502, baseCors);
        res.end(JSON.stringify({ error: err.message }));
      });
      req.pipe(aiReq);
      return;
    }

    // Status page: GET /
    if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2 style="font-family:sans-serif;padding:2rem">✅ Bridge đang hoạt động. Không cần trust SSL.</h2>');
      return;
    }
  });

  wss = new WebSocketServer({ server: httpServer });
  httpServer.listen(cfg.WS_PORT);
  console.log(`[WS] WS server lắng nghe cổng ${cfg.WS_PORT}`);
  console.log(`[Stream] MJPEG proxy: http://localhost:${cfg.WS_PORT}/stream/0..3`);

  wss.on('connection', (ws) => {
    console.log('[WS] Admin Web kết nối');
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Hardware Bridge ready' }));

    ws.on('message', raw => {
      try {
        const { type, gate } = JSON.parse(raw);
        if (type === 'OPEN_BARRIER') {
          if (gate) serial.openBarrier(gate);
          ws.send(JSON.stringify({ type: 'BARRIER_OPENED', data: { gate }, ts: Date.now() }));
          backend.logManualEvent({
            event_type:  'BARRIER_MANUAL_OPEN',
            gate,
            description: `Mở barrier thủ công – cổng ${gate === 'entry' ? 'vào' : 'ra'}`,
          });
          return;
        }
        if (type === 'CLOSE_BARRIER') {
          if (gate) serial.closeBarrier(gate);
          ws.send(JSON.stringify({ type: 'BARRIER_CLOSED', data: { gate }, ts: Date.now() }));
          backend.logManualEvent({
            event_type:  'BARRIER_MANUAL_CLOSE',
            gate,
            description: `Đóng barrier thủ công – cổng ${gate === 'entry' ? 'vào' : 'ra'}`,
          });
          return;
        }

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
