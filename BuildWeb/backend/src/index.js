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

app.use(helmet());
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:3000',
  process.env.CORS_USER_ORIGIN || 'http://localhost:5175',
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
  message: { error: 'Quá nhiều lần đăng nhập, thử lại sau 15 phút' },
});

app.use(express.json({ limit: '10mb' }));

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

app.use('/api/user/auth/login', loginLimiter);
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
