const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

router.get('/', auth, async (req, res, next) => {
  try {
    const { status, search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const memberConditions = [];
    const guestConditions  = [];
    const params = [];

    if (status) {
      params.push(status);
      memberConditions.push(`ps.status = $${params.length}`);
      guestConditions.push(`gs.status  = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      memberConditions.push(
        `(ps.license_plate ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length})`
      );
      guestConditions.push(`gs.license_plate ILIKE $${params.length}`);
    }

    const memberWhere = memberConditions.length ? 'WHERE ' + memberConditions.join(' AND ') : '';
    const guestWhere  = guestConditions.length  ? 'WHERE ' + guestConditions.join(' AND ')  : '';

    const countRes = await pool.query(`
      SELECT COUNT(*) FROM (
        SELECT ps.session_id FROM parking_sessions ps
        LEFT JOIN users u ON ps.user_id = u.user_id ${memberWhere}
        UNION ALL
        SELECT gs.session_id FROM guest_sessions gs ${guestWhere}
      ) t
    `, params);

    params.push(parseInt(limit), offset);
    const dataRes = await pool.query(`
      SELECT
        ps.session_id AS id, ps.entry_time, ps.exit_time,
        ps.license_plate AS vehicle_plate,
        ps.status, ps.session_type, ps.fee AS fee_charged,
        ps.entry_composite_image_path AS entry_image_url,
        ps.exit_composite_image_path  AS exit_image_url,
        ps.force_ended_by, ps.force_end_reason,
        u.full_name AS user_name, u.phone_number AS user_phone,
        'member' AS session_kind
      FROM parking_sessions ps
      LEFT JOIN users u ON ps.user_id = u.user_id
      ${memberWhere}

      UNION ALL

      SELECT
        gs.session_id AS id, gs.entry_time, gs.exit_time,
        gs.license_plate AS vehicle_plate,
        gs.status,
        'guest' AS session_type,
        gs.fee AS fee_charged,
        gs.entry_composite_image_path AS entry_image_url,
        gs.exit_composite_image_path  AS exit_image_url,
        NULL AS force_ended_by, NULL AS force_end_reason,
        NULL AS user_name, NULL AS user_phone,
        'guest' AS session_kind
      FROM guest_sessions gs
      ${guestWhere}

      ORDER BY entry_time DESC
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
    const result = await pool.query(`
      SELECT ps.*, u.full_name AS user_name, u.phone_number AS user_phone
      FROM parking_sessions ps
      LEFT JOIN users u ON ps.user_id = u.user_id
      WHERE ps.session_id = $1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy phiên' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/force-end', auth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Bắt buộc nhập lý do kết thúc cưỡng bức' });
    }

    const memberResult = await pool.query(`
      UPDATE parking_sessions
      SET status = 'force_ended',
          exit_time = NOW(),
          duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entry_time))::int / 60),
          force_ended_by = $1,
          force_end_reason = $2,
          updated_at = NOW()
      WHERE session_id = $3 AND status = 'active'
      RETURNING *
    `, [req.admin.id, reason.trim(), req.params.id]);

    if (memberResult.rows[0]) {
      const session = memberResult.rows[0];
      await pool.query(`
        UPDATE parking_lots
        SET current_occupancy = GREATEST(0, current_occupancy - 1), updated_at = NOW()
        WHERE lot_id = $1
      `, [session.lot_id]);
      await pool.query(`
        INSERT INTO event_logs (event_type, session_id, admin_id, description, license_plate)
        VALUES ('session_force_ended', $1, $2, $3, $4)
      `, [req.params.id, req.admin.id, `Kết thúc cưỡng bức: ${reason.trim()}`, session.license_plate]);
      return res.json({ ...session, session_kind: 'member' });
    }

    const guestResult = await pool.query(`
      UPDATE guest_sessions
      SET status = 'abnormal',
          exit_time = NOW(),
          duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entry_time))::int / 60),
          abnormal_reason = $1,
          updated_at = NOW()
      WHERE session_id = $2 AND status = 'active'
      RETURNING *
    `, [reason.trim(), req.params.id]);

    if (guestResult.rows[0]) {
      const gSession = guestResult.rows[0];
      await pool.query(`
        UPDATE parking_lots
        SET current_occupancy = GREATEST(0, current_occupancy - 1), updated_at = NOW()
        WHERE lot_id = $1
      `, [gSession.lot_id]);
      await pool.query(`
        INSERT INTO event_logs (event_type, session_id, admin_id, description, license_plate)
        VALUES ('session_force_ended', $1, $2, $3, $4)
      `, [req.params.id, req.admin.id, `Kết thúc cưỡng bức (vãng lai): ${reason.trim()}`, gSession.license_plate]);
      return res.json({ ...gSession, session_kind: 'guest' });
    }

    return res.status(404).json({ error: 'Không tìm thấy phiên đang hoạt động' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
