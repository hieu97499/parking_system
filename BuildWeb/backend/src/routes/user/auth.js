const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

router.post('/register', async (req, res, next) => {
  try {
    const { full_name, phone_number, password } = req.body;
    if (!full_name || !phone_number || !password) {
      return res.status(400).json({ error: 'Thiếu thông tin đăng ký (họ tên, số điện thoại, mật khẩu)' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }
    const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
    }

    const exists = await pool.query('SELECT 1 FROM users WHERE phone_number = $1', [phone_number]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Số điện thoại đã được đăng ký' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const userRes = await pool.query(
      `INSERT INTO users (full_name, phone_number, password_hash)
       VALUES ($1, $2, $3)
       RETURNING user_id, full_name, phone_number, is_active, created_at`,
      [full_name.trim(), phone_number.trim(), password_hash]
    );
    const user = userRes.rows[0];

    const token = jwt.sign(
      { id: user.user_id, phone: user.phone_number, type: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.user_id,
        full_name: user.full_name,
        phone_number: user.phone_number,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { phone_number, password } = req.body;
    if (!phone_number || !password) {
      return res.status(400).json({ error: 'Thiếu số điện thoại hoặc mật khẩu' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE phone_number = $1',
      [phone_number.trim()]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Số điện thoại chưa được đăng ký' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa, liên hệ quản trị viên' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Mật khẩu không đúng' });
    }

    const token = jwt.sign(
      { id: user.user_id, phone: user.phone_number, type: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, device_info, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '8 hours')`,
      [user.user_id, tokenHash, req.ip, req.headers['user-agent'] || 'web']
    );

    res.json({
      token,
      user: {
        id: user.user_id,
        full_name: user.full_name,
        phone_number: user.phone_number,
        is_verified: user.is_verified,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', userAuth, async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader.split(' ')[1];
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [hash]
    );
    res.json({ message: 'Đăng xuất thành công' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id AS id, u.full_name, u.phone_number, u.is_active, u.is_verified,
              u.created_at, w.balance AS wallet_balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.user_id
       WHERE u.user_id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.patch('/change-password', userAuth, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.id]);
    const user = result.rows[0];
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newHash, req.user.id]);

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', userAuth, async (req, res, next) => {
  try {
    const { full_name } = req.body;
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'Họ tên không được để trống' });
    }
    const result = await pool.query(
      `UPDATE users SET full_name = $1 WHERE user_id = $2
       RETURNING user_id AS id, full_name, phone_number`,
      [full_name.trim(), req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
