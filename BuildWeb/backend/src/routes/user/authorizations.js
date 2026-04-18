const router = require('express').Router();
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.auth_id AS id, a.delegate_name, a.auth_type,
              a.valid_from, a.valid_until, a.is_active, a.is_consumed, a.created_at,
              v.license_plate, v.nickname AS vehicle_nickname
       FROM authorizations a
       JOIN vehicles v ON v.vehicle_id = a.vehicle_id
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

module.exports = router;
