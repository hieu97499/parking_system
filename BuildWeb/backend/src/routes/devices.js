const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

router.get('/', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        d.*,
        dsl.logged_at AS last_status_change
      FROM devices d
      LEFT JOIN LATERAL (
        SELECT logged_at FROM device_status_logs
        WHERE device_id = d.device_id ORDER BY logged_at DESC LIMIT 1
      ) dsl ON true
      ORDER BY d.device_type, d.device_name
    `);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const [devRes, logsRes] = await Promise.all([
      pool.query('SELECT device_id AS id, * FROM devices WHERE device_id = $1', [req.params.id]),
      pool.query(`
        SELECT * FROM device_status_logs WHERE device_id = $1
        ORDER BY created_at DESC LIMIT 20
      `, [req.params.id]),
    ]);
    if (!devRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy thiết bị' });
    res.json({ ...devRes.rows[0], status_logs: logsRes.rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', auth, async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const allowed = ['online', 'offline', 'error', 'maintenance'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status phải là: ${allowed.join(', ')}` });
    }

    const result = await pool.query(`
      UPDATE devices SET status = $1, last_heartbeat = NOW() WHERE device_id = $2
      RETURNING device_id AS id, *
    `, [status, req.params.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy thiết bị' });

    await pool.query(`
      INSERT INTO event_logs (event_type, device_id, admin_id, description)
      VALUES ('DEVICE_STATUS_CHANGED', $1, $2, $3)
    `, [req.params.id, req.admin.id, note || `Trạng thái đổi thành ${status}`]);

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
