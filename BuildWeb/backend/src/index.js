require('dotenv').config();
const path       = require('path');
const http       = require('http');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { Server } = require('socket.io');
const { testConnection } = require('./db');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Trust nginx/proxy để rate limiter dùng IP thật của client
// (không trust proxy → req.ip = 127.0.0.1 → tất cả user cùng bucket)
app.set('trust proxy', 1);

app.use(helmet());
const allowedOrigins = [
  ...(process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()),
  ...(process.env.CORS_USER_ORIGIN || 'http://localhost:5175').split(',').map(s => s.trim()),
];
app.use(cors({
  origin: (origin, callback) => {

    if (!origin || origin === 'null' || allowedOrigins.includes(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần đăng nhập, thử lại sau 15 phút' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 10,                   // 10 lần đăng ký/IP/giờ
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu đăng ký, thử lại sau 1 giờ' },
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/event-logs', require('./routes/eventLogs'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/config', require('./routes/config'));
app.use('/api/barriers',  require('./routes/barriers'));
app.use('/api/hardware',  require('./routes/hardware'));
app.use('/api/ai',        require('./routes/aiProxy'));

app.use('/api/user/auth/login', loginLimiter);
app.use('/api/user/auth/register', registerLimiter);
app.use('/api/user/auth', require('./routes/user/auth'));
app.use('/api/user/vehicles', require('./routes/user/vehicles'));
app.use('/api/user/wallet', require('./routes/user/wallet'));
app.use('/api/user/sessions', require('./routes/user/sessions'));
app.use('/api/user/authorizations', require('./routes/user/authorizations'));
app.use('/api/user/notifications', require('./routes/user/notifications'));
app.use('/api/user/face-images',   require('./routes/user/faceImages'));
app.use('/api/user/monthly-passes',require('./routes/user/monthlyPasses'));

const { pool } = require('./db');
const userAuth  = require('./middleware/userAuth');
app.get('/api/user/parking-lots', userAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT lot_id, name, address, total_capacity FROM parking_lots WHERE is_active = true ORDER BY name'
    );
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: `Route không tồn tại: ${req.method} ${req.path}` });
});

app.use(errorHandler);

const httpServer = http.createServer(app);

// ── WebSocket proxy: /bridge-ws → ws://localhost:4002 ───────────────────────
// Cho phép admin-web kết nối Bridge qua HTTPS domain (tránh mixed-content).
{
  const { WebSocket: WS, WebSocketServer } = require('ws');
  const proxyWss = new WebSocketServer({ noServer: true });

  const ALLOWED_ORIGINS = [
    process.env.CORS_ORIGIN      || 'http://localhost:3000',
    process.env.CORS_USER_ORIGIN || 'http://localhost:5175',
    'https://admin-baixethongminh.duckdns.org',
  ];

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname !== '/bridge-ws') return; // socket.io tự xử lý /socket.io

      const origin = req.headers.origin || '';
      const ok = !origin
        || ALLOWED_ORIGINS.includes(origin)
        || /^http:\/\/localhost:\d+$/.test(origin);
      if (!ok) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      proxyWss.handleUpgrade(req, socket, head, (clientWs) => {
        const BRIDGE_URL = process.env.BRIDGE_WS_URL || 'wss://localhost:4002';
        const bridgeWs   = new WS(BRIDGE_URL, { rejectUnauthorized: false }); // self-signed cert OK (localhost)

        clientWs.on('message', (data) => {
          if (bridgeWs.readyState === WS.OPEN) bridgeWs.send(data);
        });
        bridgeWs.on('message', (data) => {
          if (clientWs.readyState === WS.OPEN) clientWs.send(data);
        });

        const close = () => {
          try { if (clientWs.readyState <= WS.OPEN) clientWs.close(); } catch (_) {}
          try { if (bridgeWs.readyState  <= WS.OPEN) bridgeWs.close();  } catch (_) {}
        };
        clientWs.on('close', close);
        bridgeWs.on('close', close);
        clientWs.on('error', close);
        bridgeWs.on('error', (e) => {
          console.error('[WS-proxy] Bridge error:', e.message);
          close();
        });
      });
    } catch (e) {
      console.error('[WS-proxy] upgrade error:', e.message);
      socket.destroy();
    }
  });
}

const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.CORS_ORIGIN      || 'http://localhost:3000',
      process.env.CORS_USER_ORIGIN || 'http://localhost:5175',
      /^http:\/\/localhost:\d+$/,
    ],
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('[Socket.IO] Admin Web kết nối:', socket.id);
  socket.on('disconnect', () => {
    console.log('[Socket.IO] Ngắt kết nối:', socket.id);
  });
});

app.set('io', io);

const PORT = parseInt(process.env.PORT) || 4000;
httpServer.listen(PORT, async () => {
  console.log(`\n🚀 Backend API đang chạy tại http://localhost:${PORT}`);
  console.log(`   Admin web (CORS): ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
  console.log(`   User web  (CORS): ${process.env.CORS_USER_ORIGIN || 'http://localhost:5175'}`);
  await testConnection();
});
