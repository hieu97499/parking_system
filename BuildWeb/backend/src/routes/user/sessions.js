const router = require('express').Router();
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let whereExtra = '';
    const params = [req.user.id, limit, offset];
    if (status && ['active', 'completed', 'abnormal'].includes(status)) {
      whereExtra = ` AND ps.status = $4`;
      params.push(status);
    }

    const result = await pool.query(
      `SELECT ps.session_id AS id, ps.license_plate, ps.status, ps.session_type,
              ps.entry_time, ps.exit_time, ps.duration_minutes, ps.fee,
              ps.entry_composite_image_path, ps.exit_composite_image_path,
              pl.name AS lot_name, v.nickname AS vehicle_nickname
       FROM parking_sessions ps
       LEFT JOIN vehicles v ON v.vehicle_id = ps.vehicle_id
       LEFT JOIN parking_lots pl ON pl.lot_id = ps.lot_id
       WHERE ps.user_id = $1${whereExtra}
       ORDER BY ps.entry_time DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM parking_sessions WHERE user_id = $1${status && ['active','completed','abnormal'].includes(status) ? ` AND status = '${status}'` : ''}`,
      [req.user.id]
    );

    res.json({
      sessions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (err) { next(err); }
});

router.get('/active', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ps.session_id AS id, ps.license_plate, ps.entry_time, ps.status,
              pl.name AS lot_name, pl.address AS lot_address,
              v.nickname AS vehicle_nickname
       FROM parking_sessions ps
       LEFT JOIN vehicles v ON v.vehicle_id = ps.vehicle_id
       LEFT JOIN parking_lots pl ON pl.lot_id = ps.lot_id
       WHERE ps.user_id = $1 AND ps.status = 'active'
       ORDER BY ps.entry_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ps.*, pl.name AS lot_name, pl.address AS lot_address,
              v.nickname AS vehicle_nickname
       FROM parking_sessions ps
       LEFT JOIN vehicles v ON v.vehicle_id = ps.vehicle_id
       LEFT JOIN parking_lots pl ON pl.lot_id = ps.lot_id
       WHERE ps.session_id = $1 AND ps.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy phiên gửi xe' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
