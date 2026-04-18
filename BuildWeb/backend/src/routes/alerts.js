const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

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
