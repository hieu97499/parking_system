const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Thiếu username hoặc password' });
    }

    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1 AND is_active = true',
      [username]
    );
    const admin = result.rows[0];
    if (!admin) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Mật khẩu không đúng' });
    }

    const token = jwt.sign(
      { id: admin.admin_id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    await pool.query(
      `INSERT INTO admin_sessions (admin_id, token_hash, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [admin.admin_id, require('crypto').createHash('sha256').update(token).digest('hex'),
       req.ip, req.headers['user-agent']]
    );

    res.json({
      token,
      admin: {
        id: admin.admin_id,
        username: admin.username,
        full_name: admin.full_name,
        role: admin.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', require('../middleware/auth'), async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader.split(' ')[1];
    const hash = require('crypto').createHash('sha256').update(token).digest('hex');
    await pool.query(
      'UPDATE admin_sessions SET revoked_at = NOW() WHERE token_hash = $1',
      [hash]
    );
    res.json({ message: 'Đăng xuất thành công' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', require('../middleware/auth'), async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT admin_id AS id, username, full_name, role, email FROM admins WHERE admin_id = $1',
      [req.admin.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
