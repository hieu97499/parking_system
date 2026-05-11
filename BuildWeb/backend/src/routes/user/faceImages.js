const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

// Các góc hợp lệ
const VALID_ANGLES = ['front', 'left', 'right', 'up', 'down'];

const ANGLE_LABELS = {
  front: 'Chính diện',
  left:  'Nghiêng trái',
  right: 'Nghiêng phải',
  up:    'Ngước lên',
  down:  'Cúi xuống',
};

// GET /api/user/face-images — danh sách ảnh kèm trạng thái từng góc
router.get('/', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT image_id, image_path, angle, status, embedding_id, note, created_at
       FROM user_face_images WHERE user_id = $1 ORDER BY
         CASE angle
           WHEN 'front' THEN 1 WHEN 'left' THEN 2 WHEN 'right' THEN 3
           WHEN 'up' THEN 4 WHEN 'down' THEN 5 ELSE 6
         END, created_at DESC`,
      [req.user.id]
    );

    // Trả về danh sách ảnh + tóm tắt trạng thái 5 góc
    const images = result.rows;
    const angleStatus = {};
    for (const angle of VALID_ANGLES) {
      const found = images.find(img => img.angle === angle);
      angleStatus[angle] = {
        label:    ANGLE_LABELS[angle],
        uploaded: !!found,
        status:   found?.status ?? null,
        image_id: found?.image_id ?? null,
        image_path: found?.image_path ?? null,
      };
    }

    res.json({ images, angle_status: angleStatus });
  } catch (err) {
    next(err);
  }
});

// POST /api/user/face-images — upload ảnh theo góc
router.post('/', userAuth, async (req, res, next) => {
  try {
    const { image_data, angle } = req.body;

    if (!image_data) {
      return res.status(400).json({ error: 'Thiếu dữ liệu ảnh (image_data)' });
    }

    // Validate angle
    if (!angle || !VALID_ANGLES.includes(angle)) {
      return res.status(400).json({
        error: `Thiếu hoặc sai góc chụp. Các góc hợp lệ: ${VALID_ANGLES.join(', ')}`,
      });
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

    // Kiểm tra ảnh góc này đã tồn tại chưa
    const existingRes = await pool.query(
      'SELECT image_id, image_path FROM user_face_images WHERE user_id = $1 AND angle = $2',
      [req.user.id, angle]
    );
    const existing = existingRes.rows[0];

    // Xóa file cũ nếu có
    if (existing?.image_path) {
      const oldFull = path.join(UPLOADS_ROOT, existing.image_path);
      try { if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull); } catch (_) {}
    }

    // Lưu file mới với tên = angle (để AI nhận biết góc)
    const userDir      = path.join(UPLOADS_ROOT, 'faces', req.user.id);
    fs.mkdirSync(userDir, { recursive: true });

    const filename     = `${angle}.${ext}`;
    const fullPath     = path.join(userDir, filename);
    const relativePath = `faces/${req.user.id}/${filename}`;
    fs.writeFileSync(fullPath, buffer);

    let result;
    if (existing) {
      // Cập nhật record cũ
      result = await pool.query(
        `UPDATE user_face_images
         SET image_path = $1, status = 'pending', embedding_id = NULL,
             note = NULL, updated_at = NOW()
         WHERE image_id = $2
         RETURNING image_id, image_path, angle, status, created_at`,
        [relativePath, existing.image_id]
      );
    } else {
      // Tạo record mới
      result = await pool.query(
        `INSERT INTO user_face_images (user_id, image_path, angle, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING image_id, image_path, angle, status, created_at`,
        [req.user.id, relativePath, angle]
      );
    }

    res.status(existing ? 200 : 201).json({
      ...result.rows[0],
      message: `Đã tải lên ảnh góc "${ANGLE_LABELS[angle]}" thành công`,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/user/face-images/:id — xóa ảnh theo ID
router.delete('/:id', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_face_images WHERE image_id = $1 AND user_id = $2 RETURNING image_path, angle',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Không tìm thấy ảnh hoặc không có quyền xóa' });
    }

    const { image_path, angle } = result.rows[0];
    const fullPath = path.join(UPLOADS_ROOT, image_path);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (_) {}

    res.json({
      message: `Đã xóa ảnh khuôn mặt góc "${ANGLE_LABELS[angle] || angle}"`,
      deleted_angle: angle,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/user/face-images/setup-status — kiểm tra đủ 5 góc chưa
router.get('/setup-status', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT angle, status FROM user_face_images WHERE user_id = $1`,
      [req.user.id]
    );

    const uploaded = result.rows.map(r => r.angle).filter(Boolean);
    const missing  = VALID_ANGLES.filter(a => !uploaded.includes(a));
    const allDone  = missing.length === 0;

    res.json({
      uploaded_angles: uploaded,
      missing_angles:  missing,
      all_angles_done: allDone,
      progress: `${uploaded.length}/5`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
