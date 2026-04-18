const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT image_id, image_path, status, embedding_id, note, created_at
       FROM user_face_images WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', userAuth, async (req, res, next) => {
  try {
    const { image_data } = req.body;
    if (!image_data) {
      return res.status(400).json({ error: 'Thiếu dữ liệu ảnh (image_data)' });
    }

    const matches = image_data.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Định dạng ảnh không hợp lệ. Cần base64 JPEG/PNG/WEBP' });
    }

    const ext    = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ảnh quá lớn. Tối đa 5MB' });
    }

    const countRes = await pool.query(
      'SELECT COUNT(*) FROM user_face_images WHERE user_id = $1',
      [req.user.id]
    );
    if (parseInt(countRes.rows[0].count) >= 5) {
      return res.status(400).json({ error: 'Đã đạt tối đa 5 ảnh khuôn mặt. Xóa bớt trước khi thêm mới' });
    }

    const userDir  = path.join(UPLOADS_ROOT, 'faces', req.user.id);
    fs.mkdirSync(userDir, { recursive: true });

    const filename     = `${Date.now()}.${ext}`;
    const fullPath     = path.join(userDir, filename);
    const relativePath = `faces/${req.user.id}/${filename}`;

    fs.writeFileSync(fullPath, buffer);

    const result = await pool.query(
      `INSERT INTO user_face_images (user_id, image_path, status)
       VALUES ($1, $2, 'pending')
       RETURNING image_id, image_path, status, created_at`,
      [req.user.id, relativePath]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_face_images WHERE image_id = $1 AND user_id = $2 RETURNING image_path',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh hoặc không có quyền xóa' });
    }

    const fullPath = path.join(UPLOADS_ROOT, result.rows[0].image_path);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (_) {  }

    res.json({ message: 'Đã xóa ảnh khuôn mặt' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
