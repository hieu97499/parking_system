const router = require('express').Router();
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT wallet_id AS id, balance, low_balance_threshold, updated_at FROM wallets WHERE user_id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy ví' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.get('/transactions', userAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT t.transaction_id AS id, t.transaction_type, t.amount,
              t.balance_before, t.balance_after, t.payment_gateway,
              t.status, t.description AS note, t.created_at,
              ps.entry_time, ps.exit_time, ps.license_plate AS session_plate
       FROM wallet_transactions t
       LEFT JOIN parking_sessions ps ON ps.session_id = t.parking_session_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM wallet_transactions WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (err) { next(err); }
});

router.post('/topup', userAuth, async (req, res, next) => {
  try {
    const { amount, payment_gateway } = req.body;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    if (numAmount < 10000) return res.status(400).json({ error: 'Nạp tối thiểu 10,000 VND' });
    if (numAmount > 10000000) return res.status(400).json({ error: 'Nạp tối đa 10,000,000 VND mỗi lần' });

    const validGateways = ['vnpay', 'momo', 'zalopay', 'bank_transfer'];
    if (!payment_gateway || !validGateways.includes(payment_gateway)) {
      return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const walletResult = await client.query(
        'SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE',
        [req.user.id]
      );
      if (!walletResult.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy ví' });
      }
      const wallet = walletResult.rows[0];
      const newBalance = parseFloat(wallet.balance) + numAmount;

      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
        [newBalance, wallet.wallet_id]
      );

      const txResult = await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, payment_gateway, status, description)
         VALUES ($1, $2, 'topup', $3, $4, $5, $6, 'success', 'Nạp tiền vào ví')
         RETURNING transaction_id AS id, amount, balance_after, created_at`,
        [wallet.wallet_id, req.user.id, numAmount, wallet.balance, newBalance, payment_gateway]
      );

      await client.query('COMMIT');
      res.json({
        message: 'Nạp tiền thành công',
        transaction: txResult.rows[0],
        new_balance: newBalance,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.post('/withdraw', userAuth, async (req, res, next) => {
  try {
    const { amount, bank_name, bank_account, account_name } = req.body;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < 10000) {
      return res.status(400).json({ error: 'Số tiền rút tối thiểu 10,000 VND' });
    }
    if (numAmount > 50000000) {
      return res.status(400).json({ error: 'Số tiền rút tối đa 50,000,000 VND mỗi lần' });
    }
    if (!bank_name?.trim() || !bank_account?.trim() || !account_name?.trim()) {
      return res.status(400).json({ error: 'Thiếu thông tin ngân hàng (tên ngân hàng, số tài khoản, tên chủ tài khoản)' });
    }

    const pendingRes = await pool.query(
      `SELECT 1 FROM withdraw_requests WHERE user_id = $1 AND status IN ('pending', 'processing')`,
      [req.user.id]
    );
    if (pendingRes.rows.length > 0) {
      return res.status(409).json({ error: 'Bạn đang có yêu cầu rút tiền chưa được xử lý' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const walletRes = await client.query(
        'SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE',
        [req.user.id]
      );
      if (!walletRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy ví' });
      }
      const wallet = walletRes.rows[0];
      const balanceBefore = parseFloat(wallet.balance);
      if (balanceBefore < numAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Số dư không đủ. Hiện có ${balanceBefore.toLocaleString('vi-VN')}đ`
        });
      }
      const newBalance = balanceBefore - numAmount;

      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
        [newBalance, wallet.wallet_id]
      );

      const txRes = await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, payment_gateway, status, description)
         VALUES ($1, $2, 'withdraw', $3, $4, $5, 'bank_transfer', 'pending', 'Yêu cầu rút tiền – đang xử lý')
         RETURNING transaction_id`,
        [wallet.wallet_id, req.user.id, numAmount, balanceBefore, newBalance]
      );

      const reqRes = await client.query(
        `INSERT INTO withdraw_requests
           (user_id, amount, bank_name, bank_account, account_name, wallet_tx_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING request_id, amount, bank_name, bank_account, account_name, status, created_at`,
        [req.user.id, numAmount, bank_name.trim(), bank_account.trim(), account_name.trim(),
          txRes.rows[0].transaction_id]
      );

      await client.query('COMMIT');
      res.status(201).json({
        message: 'Yêu cầu rút tiền đã được ghi nhận. Admin sẽ xử lý trong 1–3 ngày làm việc.',
        request: reqRes.rows[0],
        new_balance: newBalance,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.get('/withdrawals', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT request_id, amount, bank_name, bank_account, account_name,
              status, admin_note, created_at, processed_at
       FROM withdraw_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

module.exports = router;
