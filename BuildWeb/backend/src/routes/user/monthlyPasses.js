const router = require('express').Router();
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

router.get('/', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT mp.pass_id, mp.vehicle_id, mp.lot_id, mp.license_plate,
              mp.valid_from, mp.valid_until, mp.fee_paid, mp.status, mp.created_at,
              v.nickname AS vehicle_nickname,
              pl.name AS lot_name
       FROM monthly_passes mp
       JOIN vehicles v  ON v.vehicle_id = mp.vehicle_id
       JOIN parking_lots pl ON pl.lot_id = mp.lot_id
       WHERE mp.user_id = $1
       ORDER BY mp.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/price', userAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT config_value FROM system_configs WHERE config_key = 'monthly_pass_price'`
    );
    const price = result.rows[0] ? parseInt(result.rows[0].config_value) : 200000;
    res.json({ price });
  } catch (err) { next(err); }
});

router.post('/', userAuth, async (req, res, next) => {
  try {
    const { vehicle_id, lot_id, months = 1 } = req.body;
    if (!vehicle_id || !lot_id) {
      return res.status(400).json({ error: 'Thiếu thông tin xe hoặc bãi đỗ' });
    }
    const numMonths = parseInt(months);
    if (!numMonths || numMonths < 1 || numMonths > 12) {
      return res.status(400).json({ error: 'Số tháng không hợp lệ (1–12)' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const vehicleRes = await client.query(
        'SELECT vehicle_id, license_plate FROM vehicles WHERE vehicle_id = $1 AND user_id = $2 AND is_active',
        [vehicle_id, req.user.id]
      );
      if (!vehicleRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy xe hoặc xe đã bị vô hiệu' });
      }
      const vehicle = vehicleRes.rows[0];

      const lotRes = await client.query(
        'SELECT lot_id, name FROM parking_lots WHERE lot_id = $1 AND is_active',
        [lot_id]
      );
      if (!lotRes.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy bãi đỗ xe' });
      }

      const activePass = await client.query(
        `SELECT 1 FROM monthly_passes
         WHERE vehicle_id = $1 AND lot_id = $2 AND status = 'active' AND valid_until >= CURRENT_DATE`,
        [vehicle_id, lot_id]
      );
      if (activePass.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Xe này đã có vé tháng còn hiệu lực tại bãi đỗ đã chọn' });
      }

      const priceRes = await client.query(
        `SELECT config_value FROM system_configs WHERE config_key = 'monthly_pass_price'`
      );
      const pricePerMonth = priceRes.rows[0] ? parseInt(priceRes.rows[0].config_value) : 200000;
      const totalFee = pricePerMonth * numMonths;

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
      if (balanceBefore < totalFee) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Số dư không đủ. Cần ${totalFee.toLocaleString('vi-VN')}đ, hiện có ${balanceBefore.toLocaleString('vi-VN')}đ`
        });
      }
      const newBalance = balanceBefore - totalFee;

      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
        [newBalance, wallet.wallet_id]
      );

      const txRes = await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, payment_gateway, status, description)
         VALUES ($1, $2, 'deduct', $3, $4, $5, 'system', 'success', $6)
         RETURNING transaction_id`,
        [wallet.wallet_id, req.user.id, totalFee, balanceBefore, newBalance,
          `Mua vé tháng ${numMonths} tháng – ${vehicle.license_plate}`]
      );
      const txId = txRes.rows[0].transaction_id;

      const validFrom = new Date();
      const validUntil = new Date(validFrom);
      validUntil.setMonth(validUntil.getMonth() + numMonths);
      validUntil.setDate(validUntil.getDate() - 1);

      const passRes = await client.query(
        `INSERT INTO monthly_passes
           (user_id, vehicle_id, lot_id, license_plate, valid_from, valid_until, fee_paid, wallet_tx_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING *`,
        [req.user.id, vehicle_id, lot_id, vehicle.license_plate,
          validFrom.toISOString().split('T')[0],
          validUntil.toISOString().split('T')[0],
          totalFee, txId]
      );

      await client.query('COMMIT');
      res.status(201).json({
        message: `Mua vé tháng thành công`,
        pass: passRes.rows[0],
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

router.delete('/:id', userAuth, async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const passRes = await client.query(
        `SELECT * FROM monthly_passes WHERE pass_id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
      );
      const pass = passRes.rows[0];
      if (!pass) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy vé tháng' });
      }
      if (pass.status !== 'active') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Chỉ có thể huỷ vé đang hoạt động' });
      }

      const today = new Date();
      const validUntil = new Date(pass.valid_until);
      const validFrom = new Date(pass.valid_from);
      const totalDays = Math.max(1, Math.ceil((validUntil - validFrom) / 86400000) + 1);
      const remainingDays = Math.max(0, Math.ceil((validUntil - today) / 86400000));
      const refundAmount = Math.floor((remainingDays / totalDays) * parseFloat(pass.fee_paid));

      await client.query(
        `UPDATE monthly_passes SET status = 'cancelled', note = 'Người dùng huỷ', updated_at = NOW()
         WHERE pass_id = $1`,
        [req.params.id]
      );

      if (refundAmount > 0) {
        const walletRes = await client.query(
          'SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE',
          [req.user.id]
        );
        const wallet = walletRes.rows[0];
        const newBalance = parseFloat(wallet.balance) + refundAmount;
        await client.query(
          'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
          [newBalance, wallet.wallet_id]
        );
        await client.query(
          `INSERT INTO wallet_transactions
             (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, payment_gateway, status, description)
           VALUES ($1, $2, 'refund', $3, $4, $5, 'system', 'success', $6)`,
          [wallet.wallet_id, req.user.id, refundAmount, wallet.balance, newBalance,
            `Hoàn tiền huỷ vé tháng – ${pass.license_plate} (${remainingDays}/${totalDays} ngày còn lại)`]
        );
      }

      await client.query('COMMIT');
      res.json({
        message: refundAmount > 0 ? `Đã huỷ vé và hoàn ${refundAmount.toLocaleString('vi-VN')}đ vào ví` : 'Đã huỷ vé tháng',
        refund_amount: refundAmount,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
