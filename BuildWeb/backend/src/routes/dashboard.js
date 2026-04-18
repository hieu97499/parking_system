const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

router.get('/stats', auth, async (req, res, next) => {
  try {
    const [lotRes, activeRes, todayRes, deviceRes, alertRes] = await Promise.all([
      pool.query('SELECT total_capacity, name, address FROM parking_lots LIMIT 1'),
      pool.query(`
        SELECT (
          (SELECT COUNT(*) FROM parking_sessions WHERE status = 'active') +
          (SELECT COUNT(*) FROM guest_sessions WHERE status = 'active')
        ) AS count
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(fee), 0) AS revenue,
          COUNT(*) AS total_sessions
        FROM parking_sessions
        WHERE DATE(entry_time) = CURRENT_DATE AND status IN ('completed', 'force_ended')
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'online') AS online,
          COUNT(*) FILTER (WHERE status != 'online') AS offline
        FROM devices
      `),
      pool.query(`SELECT COUNT(*) AS count FROM system_alerts WHERE status = 'unresolved'`),
    ]);

    const lot = lotRes.rows[0] || { total_capacity: 0, name: '', address: '' };
    const occupied = parseInt(activeRes.rows[0].count);
    res.json({
      lotName: lot.name || '',
      lotAddress: lot.address || '',
      capacity: parseInt(lot.total_capacity),
      occupied,
      available: parseInt(lot.total_capacity) - occupied,
      activeSessions: parseInt(activeRes.rows[0].count),
      todayRevenue: parseFloat(todayRes.rows[0].revenue),
      todaySessions: parseInt(todayRes.rows[0].total_sessions),
      devicesOnline: parseInt(deviceRes.rows[0].online),
      devicesOffline: parseInt(deviceRes.rows[0].offline),
      unresolvedAlerts: parseInt(alertRes.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/hourly-traffic', auth, async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM entry_time)::int AS hour,
        COUNT(*) AS entries
      FROM parking_sessions
      WHERE DATE(entry_time) = $1
      GROUP BY hour
      ORDER BY hour
    `, [date]);

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, entries: 0 }));
    result.rows.forEach(r => { hours[r.hour].entries = parseInt(r.entries); });
    res.json(hours);
  } catch (err) {
    next(err);
  }
});

router.get('/active-sessions', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        ps.session_id, ps.entry_time,
        ps.license_plate,
        ps.entry_composite_image_path AS entry_image_url,
        ps.session_type,
        NULL AS session_code,
        u.full_name AS user_name,
        u.phone_number AS user_phone,
        'member' AS session_kind
      FROM parking_sessions ps
      LEFT JOIN users u ON ps.user_id = u.user_id
      WHERE ps.status = 'active'

      UNION ALL

      SELECT
        gs.session_id, gs.entry_time,
        gs.license_plate,
        gs.entry_composite_image_path AS entry_image_url,
        'guest' AS session_type,
        gs.session_code,
        NULL AS user_name,
        NULL AS user_phone,
        'guest' AS session_kind
      FROM guest_sessions gs
      WHERE gs.status = 'active'

      ORDER BY entry_time DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
