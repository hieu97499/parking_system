const router = require('express').Router();
const auth = require('../middleware/auth');
const { pool } = require('../db');

router.get('/pricing', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT config_id AS id, time_slot_name AS label, start_hour, end_hour, price_per_hour, minimum_fee, is_active FROM pricing_configs ORDER BY start_hour'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.put('/pricing/:id', auth, async (req, res, next) => {
  try {
    const { price_per_hour, start_hour, end_hour, label } = req.body;
    const result = await pool.query(`
      UPDATE pricing_configs
      SET price_per_hour = $1, start_hour = $2, end_hour = $3, time_slot_name = $4, updated_at = NOW()
      WHERE config_id = $5
      RETURNING config_id AS id, time_slot_name AS label, start_hour, end_hour, price_per_hour
    `, [price_per_hour, start_hour, end_hour, label, req.params.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/pricing', auth, async (req, res, next) => {
  try {
    const { price_per_hour, start_hour, end_hour, label } = req.body;
    const result = await pool.query(`
      INSERT INTO pricing_configs (lot_id, price_per_hour, start_hour, end_hour, time_slot_name)
      SELECT lot_id, $1, $2, $3, $4 FROM parking_lots LIMIT 1
      RETURNING config_id AS id, time_slot_name AS label, start_hour, end_hour, price_per_hour
    `, [price_per_hour, start_hour, end_hour, label]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/pricing/:id', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pricing_configs WHERE config_id = $1', [req.params.id]);
    res.json({ message: 'Đã xóa bảng giá' });
  } catch (err) {
    next(err);
  }
});

router.get('/system', auth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT config_key AS key, config_value AS value, description FROM system_configs ORDER BY config_key');
    const config = {};
    result.rows.forEach(r => { config[r.key] = { value: r.value, description: r.description }; });
    res.json(config);
  } catch (err) {
    next(err);
  }
});

router.put('/system', auth, async (req, res, next) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(`
        UPDATE system_configs SET config_value = $1, updated_at = NOW() WHERE config_key = $2
      `, [String(value), key]);
    }
    res.json({ message: 'Đã cập nhật cấu hình hệ thống' });
  } catch (err) {
    next(err);
  }
});

router.get('/lot', auth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT lot_id AS id, * FROM parking_lots LIMIT 1');
    res.json(result.rows[0] || {});
  } catch (err) {
    next(err);
  }
});

router.put('/lot', auth, async (req, res, next) => {
  try {
    const { name, address, total_capacity, phone, email } = req.body;
    const result = await pool.query(`
      UPDATE parking_lots
      SET name = $1, address = $2, total_capacity = $3, phone = $4, email = $5, updated_at = NOW()
      WHERE lot_id = (SELECT lot_id FROM parking_lots LIMIT 1)
      RETURNING lot_id AS id, *
    `, [name, address, total_capacity, phone, email]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
