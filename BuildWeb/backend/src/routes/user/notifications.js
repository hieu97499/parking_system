const router = require('express').Router();
const userAuth = require('../../middleware/userAuth');
const { pool } = require('../../db');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [countRes, dataRes, unreadRes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1', [req.user.id]),
      pool.query(
        `SELECT notification_id AS id, type, title, body, data, is_read, created_at
         FROM notifications WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, parseInt(limit), offset]
      ),
      pool.query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
        [req.user.id]
      ),
    ]);

    res.json({
      total: parseInt(countRes.rows[0].count),
      unread_count: parseInt(unreadRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      data: dataRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET is_read = true
       WHERE notification_id = $1 AND user_id = $2
       RETURNING notification_id AS id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy thông báo' });
    res.json({ message: 'Đã đánh dấu đã đọc' });
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', userAuth, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ message: 'Đã đánh dấu tất cả là đã đọc' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
