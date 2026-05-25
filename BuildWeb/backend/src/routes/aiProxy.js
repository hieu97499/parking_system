/**
 * Proxy các request từ admin-web tới AI Service (localhost:5001).
 * Giải quyết vấn đề mixed-content khi web chạy qua HTTPS domain.
 *
 * Routes:
 *   GET  /api/ai/health
 *   GET  /api/ai/cameras
 *   GET  /api/ai/cameras/assignment
 *   POST /api/ai/cameras/assignment
 *   GET  /api/ai/stream/:idx        – MJPEG stream (pipe trực tiếp)
 */

const express  = require('express');
const https    = require('https');
const axios    = require('axios');
const router   = express.Router();

const AI_BASE = process.env.AI_SERVICE_URL || 'https://localhost:5001';

// Agent bỏ qua self-signed cert cho kết nối server-to-server localhost
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── MJPEG stream – pipe toàn bộ response ──────────────────────────────────
router.get('/stream/:idx', (req, res) => {
  const url = new URL(`/stream/${req.params.idx}`, AI_BASE);

  const proxyReq = https.get(
    url.toString(),
    { rejectUnauthorized: false },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type' : proxyRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache, no-store',
        'Connection'   : 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      proxyRes.pipe(res);
      proxyRes.on('error', () => { try { res.end(); } catch (_) {} });
    }
  );

  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: 'AI offline' });
  });

  req.on('close', () => { try { proxyReq.destroy(); } catch (_) {} });
});

// ── Helpers cho JSON endpoints ────────────────────────────────────────────
// /cameras cần đọc frames từ mỗi cam → timeout cao hơn
const TIMEOUTS = { '/cameras': 20000 };

async function fwd(method, path, body, res) {
  try {
    const cfg = { timeout: TIMEOUTS[path] || 5000, httpsAgent };
    const r = method === 'POST'
      ? await axios.post(`${AI_BASE}${path}`, body, cfg)
      : await axios.get(`${AI_BASE}${path}`, cfg);
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status || 502;
    res.status(status).json({ error: 'AI offline', detail: e.message });
  }
}

router.get('/health',              (req, res) => fwd('GET',  '/health',              null, res));
router.get('/cameras',             (req, res) => fwd('GET',  '/cameras',             null, res));
router.get('/cameras/assignment',  (req, res) => fwd('GET',  '/cameras/assignment',  null, res));
router.post('/cameras/assignment', (req, res) => fwd('POST', '/cameras/assignment',  req.body, res));

module.exports = router;

