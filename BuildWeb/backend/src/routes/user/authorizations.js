const router = require('express').Router();
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.auth_id AS id, a.delegate_name, a.auth_type,
              a.valid_from, a.valid_until, a.is_active, a.is_consumed, a.created_at,
              a.delegate_user_id,
              du.full_name AS delegate_full_name, du.phone_number AS delegate_phone,
              v.license_plate, v.nickname AS vehicle_nickname
       FROM authorizations a
       JOIN vehicles v ON v.vehicle_id = a.vehicle_id
       LEFT JOIN users du ON du.user_id = a.delegate_user_id
       WHERE a.owner_user_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, v.license_plate, v.nickname AS vehicle_nickname
       FROM authorizations a
       JOIN vehicles v ON v.vehicle_id = a.vehicle_id
       WHERE a.auth_id = $1 AND a.owner_user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy ủy quyền' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE authorizations SET is_active = false
       WHERE auth_id = $1 AND owner_user_id = $2 AND is_active = true
       RETURNING auth_id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy ủy quyền hoặc đã thu hồi' });
    res.json({ message: 'Đã thu hồi ủy quyền' });
  } catch (err) { next(err); }
});

// Create user-to-user authorization via delegate phone number
router.post('/', userAuth, async (req, res, next) => {
  try {
    const { phone_number, vehicle_id, auth_type, valid_until } = req.body;

    if (!phone_number || !vehicle_id || !auth_type) {
      return res.status(400).json({ error: 'Thiếu thông tin: số điện thoại, xe, hoặc loại ủy quyền' });
    }
    if (!['once', 'daily', 'permanent'].includes(auth_type)) {
      return res.status(400).json({ error: 'Loại ủy quyền không hợp lệ (once/daily/permanent)' });
    }

    // Find delegate user by phone number
    const delegateRes = await pool.query(
      'SELECT user_id, full_name, phone_number FROM users WHERE phone_number = $1 AND is_active = true',
      [phone_number.trim()]
    );
    if (!delegateRes.rows[0]) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản với số điện thoại này' });
    }
    const delegate = delegateRes.rows[0];

    // Prevent self-authorization
    if (delegate.user_id === req.user.id) {
      return res.status(400).json({ error: 'Không thể ủy quyền cho chính mình' });
    }

    // Check the vehicle belongs to the current user
    const vehicleRes = await pool.query(
      'SELECT vehicle_id, license_plate, nickname FROM vehicles WHERE vehicle_id = $1 AND user_id = $2 AND is_active = true',
      [vehicle_id, req.user.id]
    );
    if (!vehicleRes.rows[0]) {
      return res.status(404).json({ error: 'Không tìm thấy xe' });
    }
    const vehicle = vehicleRes.rows[0];

    // Check for duplicate active authorization
    const dupRes = await pool.query(
      `SELECT auth_id FROM authorizations
       WHERE owner_user_id = $1 AND vehicle_id = $2 AND delegate_user_id = $3
         AND is_active = true`,
      [req.user.id, vehicle_id, delegate.user_id]
    );
    if (dupRes.rows.length > 0) {
      return res.status(409).json({ error: 'Đã tồn tại ủy quyền đang hoạt động cho người dùng này với xe này' });
    }

    const result = await pool.query(
      `INSERT INTO authorizations
         (vehicle_id, owner_user_id, delegate_user_id, delegate_name, auth_type, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING auth_id AS id, delegate_name, auth_type, valid_from, valid_until, is_active, is_consumed, created_at`,
      [vehicle_id, req.user.id, delegate.user_id, delegate.full_name, auth_type, valid_until || null]
    );

    res.status(201).json({
      ...result.rows[0],
      delegate_user_id: delegate.user_id,
      delegate_full_name: delegate.full_name,
      delegate_phone: delegate.phone_number,
      license_plate: vehicle.license_plate,
      vehicle_nickname: vehicle.nickname,
    });
  } catch (err) { next(err); }
});

module.exports = router;
