const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const auth = require('../middleware/auth');

// Chỉ superadmin mới được thực hiện các thao tác nhạy cảm
function requireSuperAdmin(req, res, next) {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ error: 'Chỉ Superadmin mới có quyền thực hiện thao tác này' });
  }
  next();
}

// GET /api/admins — danh sách tất cả admin
router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT admin_id AS id, username, full_name, role, email, is_active, created_at
       FROM admins ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/admins — tạo tài khoản admin mới (chỉ superadmin)
router.post('/', auth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { username, password, full_name, email, role } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Thiếu username, password hoặc họ tên' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
    }

    const existing = await pool.query('SELECT 1 FROM admins WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    const hash = await bcrypt.hash(password, 12);
    const assignedRole = role === 'superadmin' ? 'superadmin' : 'admin';

    const { rows } = await pool.query(
      `INSERT INTO admins (username, password_hash, full_name, email, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING admin_id AS id, username, full_name, role, email, is_active, created_at`,
      [username, hash, full_name, email || null, assignedRole]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admins/:id — cập nhật thông tin (superadmin mọi tk, admin chỉ được sửa chính mình)
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const isSelf = String(req.admin.id) === String(targetId);
    const isSuperAdmin = req.admin.role === 'superadmin';

    if (!isSelf && !isSuperAdmin) {
      return res.status(403).json({ error: 'Không có quyền chỉnh sửa tài khoản này' });
    }

    const { full_name, email, is_active } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (full_name !== undefined) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
    if (email !== undefined)     { fields.push(`email = $${idx++}`);     values.push(email || null); }
    // Chỉ superadmin mới được thay đổi is_active
    if (is_active !== undefined && isSuperAdmin) {
      fields.push(`is_active = $${idx++}`); values.push(is_active);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Không có trường nào để cập nhật' });

    values.push(targetId);
    const { rows } = await pool.query(
      `UPDATE admins SET ${fields.join(', ')}, updated_at = NOW()
       WHERE admin_id = $${idx}
       RETURNING admin_id AS id, username, full_name, role, email, is_active`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/admins/:id/change-password — đổi mật khẩu
router.post('/:id/change-password', auth, async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const isSelf = String(req.admin.id) === String(targetId);
    const isSuperAdmin = req.admin.role === 'superadmin';

    if (!isSelf && !isSuperAdmin) {
      return res.status(403).json({ error: 'Không có quyền đổi mật khẩu tài khoản này' });
    }

    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM admins WHERE admin_id = $1', [targetId]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

    // Nếu đổi mật khẩu của chính mình → phải nhập mật khẩu cũ
    // Nếu superadmin đổi của người khác → không cần mật khẩu cũ
    if (isSelf) {
      if (!current_password) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại' });
      const valid = await bcrypt.compare(current_password, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE admin_id = $2',
      [newHash, targetId]
    );

    // Thu hồi tất cả session cũ (bắt đăng nhập lại)
    await pool.query(
      'UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_id = $1 AND revoked_at IS NULL',
      [targetId]
    );

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admins/:id — xóa tài khoản (chỉ superadmin, không được xóa chính mình)
router.delete('/:id', auth, requireSuperAdmin, async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (String(req.admin.id) === String(targetId)) {
      return res.status(400).json({ error: 'Không thể xóa tài khoản đang đăng nhập' });
    }

    const { rows } = await pool.query('SELECT role FROM admins WHERE admin_id = $1', [targetId]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

    // Thu hồi session
    await pool.query('UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_id = $1', [targetId]);
    await pool.query('DELETE FROM admins WHERE admin_id = $1', [targetId]);

    res.json({ message: 'Đã xóa tài khoản' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
