const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

router.post('/:deviceId/open', auth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Bắt buộc nhập lý do mở barrier thủ công' });
    }

    const devRes = await pool.query(
      "SELECT device_id AS id, * FROM devices WHERE device_id = $1 AND device_type = 'barrier'",
      [req.params.deviceId]
    );
    if (!devRes.rows[0]) {
      return res.status(404).json({ error: 'Không tìm thấy thiết bị barrier' });
    }

    await pool.query(`
      INSERT INTO manual_overrides (device_id, admin_id, action, reason)
      VALUES ($1, $2, 'open_barrier', $3)
    `, [req.params.deviceId, req.admin.id, reason.trim()]);

    await pool.query(`
      INSERT INTO event_logs (event_type, device_id, admin_id, description)
      VALUES ('BARRIER_MANUAL_OPEN', $1, $2, $3)
    `, [req.params.deviceId, req.admin.id, `Mở thủ công: ${reason.trim()}`]);

    res.json({ message: 'Đã ghi lệnh mở barrier', device: devRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/logs', auth, async (req, res, next) => {
  try {
    const { deviceId, limit = 20 } = req.query;
    const params = [parseInt(limit)];
    let where = '';

    if (deviceId) {
      params.push(deviceId);
      where = `WHERE mo.device_id = $2`;
    }

    const result = await pool.query(`
      SELECT mo.*, a.username AS admin_username, d.name AS device_name
      FROM manual_overrides mo
      JOIN admins a ON a.admin_id = mo.admin_id
      JOIN devices d ON d.device_id = mo.device_id
      ${where}
      ORDER BY mo.created_at DESC
      LIMIT $1
    `, params);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
