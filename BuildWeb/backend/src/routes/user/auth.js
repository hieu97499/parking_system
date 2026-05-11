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

/**
 * POST /api/user/auth/setup
 * Hoàn tất thiết lập tài khoản sau đăng ký:
 *   - Upload 5 ảnh khuôn mặt theo góc
 *   - Đăng ký xe + ảnh biển số
 *   - Gọi AI service reload faces
 */
const path = require('path');
const fs   = require('fs');
const axios = require('axios');

const UPLOADS_ROOT_AUTH = path.join(__dirname, '..', '..', '..', 'uploads');
const VALID_ANGLES_AUTH  = ['front', 'left', 'right', 'up', 'down'];
const ANGLE_LABELS_AUTH  = {
  front: 'Chính diện', left: 'Nghiêng trái', right: 'Nghiêng phải',
  up: 'Ngước lên', down: 'Cúi xuống',
};

router.post('/setup', userAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      face_images,       // { front: 'data:image/...', left: '...', ... }
      license_plate,     // '29B1-12345'
      plate_image_data,  // 'data:image/jpeg;base64,...' (tuỳ chọn)
      vehicle_nickname,  // 'Xe đi làm' (tuỳ chọn)
    } = req.body;

    const userId = req.user.id;
    const errors = [];

    await client.query('BEGIN');

    // ── 1. Lưu ảnh khuôn mặt theo từng góc ──
    if (face_images && typeof face_images === 'object') {
      const faceDir = path.join(UPLOADS_ROOT_AUTH, 'faces', userId);
      fs.mkdirSync(faceDir, { recursive: true });

      for (const angle of VALID_ANGLES_AUTH) {
        const imageData = face_images[angle];
        if (!imageData) continue;

        const matches = imageData.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
        if (!matches) {
          errors.push(`Ảnh góc ${angle}: định dạng không hợp lệ`);
          continue;
        }

        const ext    = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');

        if (buffer.length > 5 * 1024 * 1024) {
          errors.push(`Ảnh góc ${angle}: quá lớn (tối đa 5MB)`);
          continue;
        }

        const filename     = `${angle}.${ext}`;
        const fullPath     = path.join(faceDir, filename);
        const relativePath = `faces/${userId}/${filename}`;
        fs.writeFileSync(fullPath, buffer);

        // Upsert vào DB
        await client.query(
          `INSERT INTO user_face_images (user_id, image_path, angle, status)
           VALUES ($1, $2, $3, 'pending')
           ON CONFLICT (user_id, angle)
           DO UPDATE SET image_path = $2, status = 'pending',
                         embedding_id = NULL, updated_at = NOW()`,
          [userId, relativePath, angle]
        );
      }
    }

    // ── 2. Đăng ký xe ──
    let vehicleResult = null;
    if (license_plate) {
      const normalized = license_plate.trim().toUpperCase().replace(/\s+/g, '');

      // Kiểm tra biển số trùng
      const dupCheck = await client.query(
        'SELECT vehicle_id FROM vehicles WHERE license_plate = $1',
        [normalized]
      );
      if (dupCheck.rows.length > 0) {
        errors.push(`Biển số ${normalized} đã được đăng ký trong hệ thống`);
      } else {
        const vRes = await client.query(
          `INSERT INTO vehicles (user_id, license_plate, nickname)
           VALUES ($1, $2, $3)
           RETURNING vehicle_id AS id, license_plate, nickname, is_active`,
          [userId, normalized, vehicle_nickname || null]
        );
        vehicleResult = vRes.rows[0];

        // Upload ảnh biển số nếu có
        if (plate_image_data && vehicleResult) {
          const pm = plate_image_data.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
          if (pm) {
            const ext    = pm[1] === 'jpeg' ? 'jpg' : pm[1];
            const buffer = Buffer.from(pm[2], 'base64');
            const plateDir     = path.join(UPLOADS_ROOT_AUTH, 'plates', userId);
            fs.mkdirSync(plateDir, { recursive: true });
            const filename     = `${vehicleResult.id}-${Date.now()}.${ext}`;
            const fullPath     = path.join(plateDir, filename);
            const relativePath = `plates/${userId}/${filename}`;
            fs.writeFileSync(fullPath, buffer);

            await client.query(
              `UPDATE vehicles SET plate_image_path = $1, updated_at = NOW()
               WHERE vehicle_id = $2`,
              [relativePath, vehicleResult.id]
            );
            vehicleResult.plate_image_path = relativePath;
          }
        }
      }
    }

    await client.query('COMMIT');

    // ── 3. Gọi AI service reload faces (async, không block response) ──
    const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';
    axios.post(`${AI_URL}/faces/reload`).catch(err =>
      console.warn('[Setup] AI reload failed (non-critical):', err.message)
    );

    // ── 4. Kiểm tra số góc đã upload ──
    const faceCount = await pool.query(
      'SELECT COUNT(*) FROM user_face_images WHERE user_id = $1',
      [userId]
    );
    const faceUploaded = parseInt(faceCount.rows[0].count);

    res.json({
      message: 'Thiết lập tài khoản thành công',
      face_images_uploaded: faceUploaded,
      face_complete: faceUploaded >= 5,
      vehicle: vehicleResult,
      warnings: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
