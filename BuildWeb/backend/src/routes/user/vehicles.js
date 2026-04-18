const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT vehicle_id AS id, license_plate, nickname, plate_image_path, is_active, created_at
       FROM vehicles WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', userAuth, async (req, res, next) => {
  try {
    const { license_plate, nickname } = req.body;
    if (!license_plate) return res.status(400).json({ error: 'Thiếu biển số xe' });

    const normalized = license_plate.trim().toUpperCase().replace(/\s+/g, '');

    const existing = await pool.query(
      'SELECT vehicle_id FROM vehicles WHERE license_plate = $1',
      [normalized]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Biển số xe đã được đăng ký trong hệ thống' });
    }

    const result = await pool.query(
      `INSERT INTO vehicles (user_id, license_plate, nickname)
       VALUES ($1, $2, $3)
       RETURNING vehicle_id AS id, license_plate, nickname, is_active, created_at`,
      [req.user.id, normalized, nickname || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', userAuth, async (req, res, next) => {
  try {
    const { nickname } = req.body;
    const result = await pool.query(
      `UPDATE vehicles SET nickname = $1, updated_at = NOW()
       WHERE vehicle_id = $2 AND user_id = $3
       RETURNING vehicle_id AS id, license_plate, nickname, is_active`,
      [nickname || null, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy xe' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', userAuth, async (req, res, next) => {
  try {

    const active = await pool.query(
      `SELECT session_id FROM parking_sessions
       WHERE vehicle_id = $1 AND status = 'active' LIMIT 1`,
      [req.params.id]
    );
    if (active.rows.length > 0) {
      return res.status(400).json({ error: 'Xe đang trong bãi, không thể xóa' });
    }

    const result = await pool.query(
      `UPDATE vehicles SET is_active = false, updated_at = NOW()
       WHERE vehicle_id = $1 AND user_id = $2
       RETURNING vehicle_id AS id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy xe' });
    res.json({ message: 'Đã xóa xe' });
  } catch (err) { next(err); }
});

router.post('/:id/plate-image', userAuth, async (req, res, next) => {
  try {
    const { image_data } = req.body;
    if (!image_data) return res.status(400).json({ error: 'Thiếu dữ liệu ảnh (image_data)' });

    const matches = image_data.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Định dạng ảnh không hợp lệ. Cần base64 JPEG/PNG/WEBP' });

    const ext    = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Ảnh quá lớn. Tối đa 5MB' });

    const vRes = await pool.query(
      'SELECT vehicle_id, plate_image_path FROM vehicles WHERE vehicle_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!vRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy xe' });

    const oldPath = vRes.rows[0].plate_image_path;
    if (oldPath) {
      const oldFull = path.join(UPLOADS_ROOT, oldPath);
      try { if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull); } catch (_) {}
    }

    const plateDir     = path.join(UPLOADS_ROOT, 'plates', req.user.id);
    fs.mkdirSync(plateDir, { recursive: true });
    const filename     = `${req.params.id}-${Date.now()}.${ext}`;
    const fullPath     = path.join(plateDir, filename);
    const relativePath = `plates/${req.user.id}/${filename}`;
    fs.writeFileSync(fullPath, buffer);

    const result = await pool.query(
      `UPDATE vehicles SET plate_image_path = $1, updated_at = NOW()
       WHERE vehicle_id = $2 AND user_id = $3
       RETURNING vehicle_id AS id, license_plate, nickname, plate_image_path, is_active`,
      [relativePath, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id/plate-image', userAuth, async (req, res, next) => {
  try {
    const vRes = await pool.query(
      'SELECT plate_image_path FROM vehicles WHERE vehicle_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!vRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy xe' });

    const oldPath = vRes.rows[0].plate_image_path;
    if (oldPath) {
      const fullPath = path.join(UPLOADS_ROOT, oldPath);
      try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch (_) {}
    }

    const result = await pool.query(
      `UPDATE vehicles SET plate_image_path = NULL, updated_at = NOW()
       WHERE vehicle_id = $1 AND user_id = $2
       RETURNING vehicle_id AS id, license_plate, nickname, plate_image_path, is_active`,
      [req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
