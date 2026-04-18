const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

const TYPE_GROUPS = {
  vehicle:  ['vehicle_entry','vehicle_exit','vehicle_entry_guest','vehicle_exit_guest'],
  auth:     ['auth_success_owner','auth_success_delegate','auth_failed_face','auth_failed_plate','auth_failed_mismatch','auth_fallback_guest'],
  barrier:  ['barrier_opened','barrier_closed','barrier_manual_open'],
  payment:  ['payment_deducted','payment_failed_balance','payment_guest_paid'],
  device:   ['device_offline','device_online','arduino_disconnected','camera_error'],
  alert:    ['low_balance_alert','session_abnormal','lot_full','system_offline_mode'],
};

router.get('/', auth, async (req, res, next) => {
  try {
    const { type, typeGroup, search = '', page = 1, limit = 50, from, to } = req.query;
    const params = [];
    const conditions = [];

    if (typeGroup && TYPE_GROUPS[typeGroup]) {

      params.push(TYPE_GROUPS[typeGroup]);
      conditions.push(`el.event_type = ANY($${params.length})`);
    } else if (type) {
      params.push(type);
      conditions.push(`el.event_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`el.created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`el.created_at <= $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(el.description ILIKE $${params.length} OR el.license_plate ILIKE $${params.length})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countRes = await pool.query(`SELECT COUNT(*) FROM event_logs el ${where}`, params);
    params.push(parseInt(limit), offset);

    const dataRes = await pool.query(`
      SELECT
        el.*,
        a.username AS admin_username
      FROM event_logs el
      LEFT JOIN admins a ON a.admin_id = el.admin_id
      ${where}
      ORDER BY el.created_at DESC
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

module.exports = router;
