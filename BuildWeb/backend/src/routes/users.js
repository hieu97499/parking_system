const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

router.get('/', auth, async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = '';

    if (search) {
      params.push(`%${search}%`);
      where = `WHERE full_name ILIKE $1 OR phone_number ILIKE $1 OR email ILIKE $1`;
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM users ${where}`, params);
    params.push(parseInt(limit), offset);
    const dataRes = await pool.query(`
      SELECT
        u.user_id AS id, u.full_name, u.phone_number AS phone, u.email, u.is_active,
        u.created_at,
        (SELECT COUNT(*) FROM vehicles v WHERE v.user_id = u.user_id AND v.is_active) AS vehicle_count,
        (SELECT COUNT(*) FROM face_embeddings fe WHERE fe.user_id = u.user_id AND fe.is_active) AS face_count,
        w.balance AS wallet_balance
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.user_id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      data: dataRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const uid = req.params.id;
    const [userRes, vehiclesRes, sessionsRes, transRes] = await Promise.all([
      pool.query(`
        SELECT u.*, u.phone_number AS phone, w.balance AS wallet_balance
        FROM users u LEFT JOIN wallets w ON w.user_id = u.user_id
        WHERE u.user_id = $1
      `, [uid]),
      pool.query(`SELECT vehicle_id AS id, license_plate, nickname, plate_image_path, is_active, created_at FROM vehicles WHERE user_id = $1 ORDER BY created_at DESC`, [uid]),
      pool.query(`
        SELECT session_id AS id, entry_time, exit_time, license_plate, status, fee AS fee_charged
        FROM parking_sessions WHERE user_id = $1
        ORDER BY entry_time DESC LIMIT 20
      `, [uid]),
      pool.query(`
        SELECT transaction_id AS id, transaction_type, amount, description, created_at
        FROM wallet_transactions WHERE wallet_id = (SELECT wallet_id FROM wallets WHERE user_id = $1)
        ORDER BY created_at DESC LIMIT 20
      `, [uid]),
    ]);

    if (!userRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    res.json({
      ...userRes.rows[0],
      vehicles: vehiclesRes.rows,
      sessions: sessionsRes.rows,
      transactions: transRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { full_name, phone_number, is_active } = req.body;
    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      params.push(full_name.trim());
      updates.push(`full_name = $${params.length}`);
    }
    if (phone_number !== undefined) {

      const dup = await pool.query(
        'SELECT 1 FROM users WHERE phone_number = $1 AND user_id != $2',
        [phone_number.trim(), req.params.id]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'Số điện thoại đã được sử dụng bởi tài khoản khác' });
      }
      params.push(phone_number.trim());
      updates.push(`phone_number = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Không có thông tin nào để cập nhật' });
    }

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${params.length}
       RETURNING user_id AS id, full_name, phone_number, is_active, created_at`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/face-images', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT image_id, user_id, image_path, status, embedding_id, note, created_at
       FROM user_face_images WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/face-images/:imageId', auth, async (req, res, next) => {
  try {
    const imgRes = await pool.query(
      'SELECT image_id, embedding_id FROM user_face_images WHERE image_id = $1 AND user_id = $2',
      [req.params.imageId, req.params.id]
    );
    if (!imgRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy ảnh' });
    const { embedding_id } = imgRes.rows[0];
    await pool.query('DELETE FROM user_face_images WHERE image_id = $1', [req.params.imageId]);
    if (embedding_id) {
      await pool.query('UPDATE face_embeddings SET is_active = false WHERE embedding_id = $1', [embedding_id]);
    }
    res.json({ message: 'Đã xóa ảnh khuôn mặt' });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/toggle-active', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      UPDATE users SET is_active = NOT is_active WHERE user_id = $1
      RETURNING user_id AS id, full_name, is_active
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Admin: update a user's vehicle
router.put('/:id/vehicles/:vid', auth, async (req, res, next) => {
  try {
    const { license_plate, nickname } = req.body;
    const updates = ['updated_at = NOW()'];
    const params = [];

    if (license_plate !== undefined) {
      const normalized = license_plate.trim().toUpperCase().replace(/\s+/g, '');
      if (!normalized) return res.status(400).json({ error: 'Biển số xe không được để trống' });
      const existing = await pool.query(
        'SELECT vehicle_id FROM vehicles WHERE license_plate = $1 AND vehicle_id != $2',
        [normalized, req.params.vid]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Biển số xe đã được đăng ký trong hệ thống' });
      }
      params.push(normalized);
      updates.push(`license_plate = $${params.length}`);
    }
    if (nickname !== undefined) {
      params.push(nickname || null);
      updates.push(`nickname = $${params.length}`);
    }

    params.push(req.params.vid, req.params.id);
    const result = await pool.query(
      `UPDATE vehicles SET ${updates.join(', ')}
       WHERE vehicle_id = $${params.length - 1} AND user_id = $${params.length}
       RETURNING vehicle_id AS id, license_plate, nickname, is_active`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy xe' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Admin: adjust user wallet balance
router.post('/:id/wallet/adjust', auth, async (req, res, next) => {
  try {
    const { amount, description } = req.body;
    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }

    const walletRes = await pool.query(
      'SELECT wallet_id, balance FROM wallets WHERE user_id = $1',
      [req.params.id]
    );
    if (!walletRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy ví' });

    const wallet = walletRes.rows[0];
    const newBalance = parseFloat(wallet.balance) + amount;
    if (newBalance < 0) return res.status(400).json({ error: 'Số dư ví không đủ để trừ' });

    const txType = amount >= 0 ? 'topup' : 'deduct';
    const absAmount = Math.abs(amount);

    await pool.query(
      'UPDATE wallets SET balance = $1 WHERE wallet_id = $2',
      [newBalance, wallet.wallet_id]
    );
    await pool.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, description)
       VALUES ($1, $2, $3, $4)`,
      [wallet.wallet_id, txType, absAmount, description || (amount >= 0 ? 'Quản trị nạp tiền' : 'Quản trị trừ tiền')]
    );

    res.json({ wallet_balance: newBalance, amount, transaction_type: txType });
  } catch (err) {
    next(err);
  }
});

// Admin: xem các lệnh nạp tiền đang chờ xử lý (pending QR)
router.get('/topups/pending', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT wt.transaction_id, wt.reference_code, wt.amount, wt.created_at,
              u.user_id, u.full_name, u.phone_number, w.balance AS current_balance
       FROM wallet_transactions wt
       JOIN wallets w  ON w.wallet_id  = wt.wallet_id
       JOIN users   u  ON u.user_id    = wt.user_id
       WHERE wt.payment_gateway = 'sepay' AND wt.status = 'pending'
       ORDER BY wt.created_at DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
