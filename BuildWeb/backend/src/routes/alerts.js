const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

// Trigger thủ công quét thiết bị offline — Admin gọi từ trang Cảnh báo
router.post('/scan-devices', auth, async (req, res, next) => {
  try {
    const TIMEOUT_MIN = 5;

    // Tìm thiết bị không online hoặc heartbeat quá cũ
    const { rows: offlineDevices } = await pool.query(`
      SELECT device_id, device_name, device_type, status, last_heartbeat, lot_id
      FROM devices
      WHERE status != 'online'
         OR (
           last_heartbeat IS NOT NULL
           AND last_heartbeat < NOW() - INTERVAL '${TIMEOUT_MIN} minutes'
         )
    `);

    let created = 0;
    for (const device of offlineDevices) {
      const { rows: existing } = await pool.query(`
        SELECT alert_id FROM system_alerts
        WHERE related_device_id = $1
          AND alert_type IN ('device_offline', 'arduino_disconnected')
          AND status = 'unresolved'
        LIMIT 1
      `, [device.device_id]);

      if (existing.length > 0) continue;

      const isHeartbeatTimeout = device.status === 'online' && device.last_heartbeat;
      const alertType = device.device_type === 'arduino' ? 'arduino_disconnected' : 'device_offline';
      const title     = `${device.device_name} mất kết nối`;
      const desc      = isHeartbeatTimeout
        ? `Thiết bị không gửi tín hiệu trong hơn ${TIMEOUT_MIN} phút. Lần cuối hoạt động: ${new Date(device.last_heartbeat).toLocaleString('vi-VN')}`
        : `Trạng thái hiện tại: ${device.status}. Vui lòng kiểm tra kết nối thiết bị.`;

      await pool.query(`
        INSERT INTO system_alerts (lot_id, alert_type, severity, title, description, related_device_id)
        VALUES ($1, $2, 'critical', $3, $4, $5)
      `, [device.lot_id, alertType, title, desc, device.device_id]);
      created++;
    }

    // Tự resolve alert của thiết bị đã về online
    const { rowCount: resolved } = await pool.query(`
      UPDATE system_alerts sa
      SET status = 'resolved',
          resolved_at = NOW(),
          resolution_note = 'Thiết bị đã kết nối trở lại (tự động)'
      FROM devices d
      WHERE sa.related_device_id = d.device_id
        AND sa.alert_type IN ('device_offline', 'arduino_disconnected')
        AND sa.status = 'unresolved'
        AND d.status = 'online'
        AND (d.last_heartbeat IS NULL OR d.last_heartbeat >= NOW() - INTERVAL '${TIMEOUT_MIN} minutes')
    `);

    res.json({
      scanned: offlineDevices.length,
      created,
      resolved,
      message: `Đã quét ${offlineDevices.length} thiết bị, tạo ${created} cảnh báo mới, resolve ${resolved} cảnh báo cũ.`,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const { status, severity, page = 1, limit = 50 } = req.query;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (severity) {
      params.push(severity);
      conditions.push(`severity = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const countRes = await pool.query(`SELECT COUNT(*) FROM system_alerts ${where}`, params);

    params.push(parseInt(limit), offset);
    const dataRes = await pool.query(`
      SELECT sa.alert_id AS id, sa.*, a.username AS resolved_by_username
      FROM system_alerts sa
      LEFT JOIN admins a ON a.admin_id = sa.resolved_by
      ${where}
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        sa.created_at DESC
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

router.patch('/:id/resolve', auth, async (req, res, next) => {
  try {
    const { note } = req.body;
    const result = await pool.query(`
      UPDATE system_alerts
      SET status = 'resolved',
          resolved_by = $1,
          resolved_at = NOW(),
          resolution_note = $2
      WHERE alert_id = $3 AND status = 'unresolved'
      RETURNING alert_id AS id, *
    `, [req.admin.id, note || null, req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Không tìm thấy cảnh báo hoặc đã được xử lý' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
