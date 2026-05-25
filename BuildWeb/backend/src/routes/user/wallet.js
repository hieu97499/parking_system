const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const { pool } = require('../../db');
const userAuth = require('../../middleware/userAuth');

// ── SSE connections cho realtime topup notification ──────────────────────────
// Map: refCode → { res, timers }
const topupStreams = new Map();

function pushTopupSuccess(refCode, payload) {
  const entry = topupStreams.get(refCode);
  if (!entry) return;
  try {
    entry.res.write(`event: topup_success\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch (_) {}
  clearTimeout(entry.closeTimer);
  clearInterval(entry.heartbeat);
  topupStreams.delete(refCode);
  try { entry.res.end(); } catch (_) {}
}

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
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const { year, month, type } = req.query;

    const conds  = ['t.user_id = $1', `NOT (t.transaction_type = 'topup' AND t.status = 'pending')`];
    const params = [req.user.id];

    const y = parseInt(year), m = parseInt(month);
    if (year && month && !isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      params.push(y, m);
      conds.push(`EXTRACT(YEAR  FROM t.created_at) = $${params.length - 1}`);
      conds.push(`EXTRACT(MONTH FROM t.created_at) = $${params.length}`);
    }

    const validTypes = ['topup', 'deduct', 'refund', 'withdraw'];
    if (type && validTypes.includes(type)) {
      params.push(type);
      conds.push(`t.transaction_type = $${params.length}`);
    }

    const where       = conds.join(' AND ');
    const countParams = [...params];
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(
        `SELECT t.transaction_id AS id, t.transaction_type, t.amount,
                t.balance_before, t.balance_after, t.payment_gateway,
                t.status, t.description AS note, t.created_at, t.reference_code,
                ps.entry_time, ps.exit_time, ps.license_plate AS session_plate
         FROM wallet_transactions t
         LEFT JOIN parking_sessions ps ON ps.session_id = t.parking_session_id
         WHERE ${where}
         ORDER BY t.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) FROM wallet_transactions t WHERE ${where}`,
        countParams
      ),
    ]);

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

// ──────────────────────────────────────────────
// SePay integration routes
// ──────────────────────────────────────────────

// POST /api/user/wallet/sepay/create — tạo giao dịch nạp tiền chờ xác nhận
router.post('/sepay/create', userAuth, async (req, res, next) => {
  try {
    const { amount } = req.body;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < 10000) return res.status(400).json({ error: 'Nạp tối thiểu 10,000 VND' });
    if (numAmount > 10000000) return res.status(400).json({ error: 'Nạp tối đa 10,000,000 VND mỗi lần' });

    // Tạo mã tham chiếu duy nhất: NAP + 6 ký tự đầu user_id + 6 chữ số cuối timestamp
    const shortId = req.user.id.replace(/-/g, '').slice(0, 6).toUpperCase();
    const ts = Date.now().toString().slice(-6);
    const refCode = `NAP${shortId}${ts}`;
    console.log(`[SePay Create] user=${req.user.id} amount=${numAmount} refCode=${refCode}`);

    const walletRes = await pool.query('SELECT wallet_id, balance FROM wallets WHERE user_id = $1', [req.user.id]);
    if (!walletRes.rows[0]) return res.status(404).json({ error: 'Không tìm thấy ví' });

    const wallet = walletRes.rows[0];

    await pool.query(
      `INSERT INTO wallet_transactions
         (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, payment_gateway, status, description, reference_code)
       VALUES ($1, $2, 'topup', $3, $4, $4, 'sepay', 'pending', 'Nạp tiền qua SePay – chờ thanh toán', $5)`,
      [wallet.wallet_id, req.user.id, numAmount, parseFloat(wallet.balance), refCode]
    );

    const bankAccount = process.env.SEPAY_BANK_ACCOUNT || '';
    const bankCode    = process.env.SEPAY_BANK_CODE    || '';
    const accountName = process.env.SEPAY_ACCOUNT_NAME || '';

    const qrUrl = `https://img.vietqr.io/image/${bankCode}-${bankAccount}-qr_only.png` +
      `?amount=${numAmount}&addInfo=${encodeURIComponent(refCode)}&accountName=${encodeURIComponent(accountName)}`;

    res.json({ ref_code: refCode, amount: numAmount, bank_account: bankAccount, bank_code: bankCode, account_name: accountName, qr_url: qrUrl });
    console.log(`[SePay Create] OK - refCode=${refCode} inserted and QR returned`);
  } catch (err) {
    console.error(`[SePay Create] ERROR:`, err.message);
    next(err);
  }
});

// GET /api/user/wallet/sepay/status/:refCode — kiểm tra trạng thái giao dịch
// Nếu DB vẫn pending, chủ động query SePay API để xác nhận và xử lý ngay
router.get('/sepay/status/:refCode', userAuth, async (req, res, next) => {
  try {
    const { refCode } = req.params;
    if (!/^NAP[A-Z0-9]{12}$/.test(refCode)) return res.status(400).json({ error: 'Mã không hợp lệ' });

    const result = await pool.query(
      `SELECT transaction_id, wallet_id, status, amount, balance_after
       FROM wallet_transactions
       WHERE reference_code = $1 AND user_id = $2`,
      [refCode, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });

    const tx = result.rows[0];

    // Nếu đã xử lý xong thì trả về luôn
    if (tx.status !== 'pending') {
      return res.json({ status: tx.status, amount: tx.amount, balance_after: tx.balance_after });
    }

    // Còn pending → query SePay API để kiểm tra
    // SEPAY_API_TOKEN: token từ my.sepay.vn/companyapi dùng để query giao dịch
    const apiToken = process.env.SEPAY_API_TOKEN || '';
    const bankAccount = process.env.SEPAY_BANK_ACCOUNT || '';
    let sepayTx = null;
    console.log(`[SePay Status] refCode=${refCode} | apiToken=${apiToken ? '***set***' : 'EMPTY (cần điền SEPAY_API_TOKEN)'} | bankAccount=${bankAccount || 'EMPTY'}`);
    const apiKey = apiToken; // alias để không đổi tên biến bên dưới
    if (apiKey && bankAccount) {
      try {
        // Lọc theo ngày hôm nay + số tiền để giảm số kết quả trả về.
        // KHÔNG dùng reference_number vì đó là mã tham chiếu của ngân hàng,
        // không phải nội dung chuyển khoản (transaction_content).
        const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
        const sepayUrl =
          `https://my.sepay.vn/userapi/transactions/list` +
          `?account_number=${bankAccount}` +
          `&transaction_date_min=${today}` +
          `&amount_in=${tx.amount}` +
          `&limit=50`;
        console.log(`[SePay Status] Gọi API: ${sepayUrl}`);
        const sepayRes = await fetch(sepayUrl, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log(`[SePay Status] HTTP status: ${sepayRes.status}`);
        if (sepayRes.ok) {
          const sepayData = await sepayRes.json();
          const list = (sepayData.transactions || sepayData.data || []);
          console.log(`[SePay Status] Tìm thấy ${list.length} giao dịch, tìm refCode ${refCode} trong transaction_content`);
          list.forEach(t => console.log(`  - content: "${t.transaction_content}" | amount_in: ${t.amount_in}`));
          sepayTx = list.find(t => (t.transaction_content || '').includes(refCode)) || null;
          console.log(`[SePay Status] sepayTx found: ${!!sepayTx}`);
        } else {
          const errText = await sepayRes.text();
          console.log(`[SePay Status] API error: ${errText}`);
        }
      } catch (err) {
        console.log(`[SePay Status] Exception: ${err.message}`);
      }
    } else {
      console.log(`[SePay Status] BỎ QUA gọi API vì thiếu SEPAY_API_TOKEN hoặc SEPAY_BANK_ACCOUNT trong .env`);
    }

    if (!sepayTx) {
      // SePay chưa có giao dịch này
      return res.json({ status: 'pending', amount: tx.amount, balance_after: null });
    }

    // SePay đã nhận tiền → xử lý credit wallet (giống logic webhook)
    const creditAmount = parseFloat(sepayTx.amount_in) || parseFloat(tx.amount);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const recheck = await client.query(
        `SELECT status FROM wallet_transactions WHERE transaction_id = $1 FOR UPDATE`,
        [tx.transaction_id]
      );
      if (recheck.rows[0].status !== 'pending') {
        // Đã xử lý bởi webhook song song
        await client.query('ROLLBACK');
        const fresh = await pool.query(
          `SELECT status, amount, balance_after FROM wallet_transactions WHERE transaction_id = $1`,
          [tx.transaction_id]
        );
        return res.json(fresh.rows[0]);
      }

      const walletRes = await client.query(
        'SELECT balance FROM wallets WHERE wallet_id = $1 FOR UPDATE',
        [tx.wallet_id]
      );
      const currentBalance = parseFloat(walletRes.rows[0].balance);
      const newBalance = currentBalance + creditAmount;

      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
        [newBalance, tx.wallet_id]
      );
      await client.query(
        `UPDATE wallet_transactions
         SET status = 'success', amount = $1, balance_before = $2, balance_after = $3,
             description = 'Nạp tiền qua SePay – thành công', updated_at = NOW()
         WHERE transaction_id = $4`,
        [creditAmount, currentBalance, newBalance, tx.transaction_id]
      );

      await client.query('COMMIT');
      pushTopupSuccess(refCode, { status: 'success', amount: creditAmount, balance_after: newBalance });
      return res.json({ status: 'success', amount: creditAmount, balance_after: newBalance });
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// ─── Helper: credit ví từ refCode khi DB không có pending record ───────────
// Dùng khi backend restart giữa chừng khiến INSERT pending bị mất.
async function creditByRefCode(refCode, creditAmount, client) {
  // refCode = NAP + 6-char userPrefix + 6-char timestamp
  const userPrefix = refCode.slice(3, 9).toLowerCase();
  const userRes = await client.query(
    `SELECT u.user_id, w.wallet_id, w.balance
     FROM users u JOIN wallets w ON w.user_id = u.user_id
     WHERE LOWER(REPLACE(u.user_id::text, '-', '')) LIKE $1
     LIMIT 1`,
    [`${userPrefix}%`]
  );
  if (!userRes.rows[0]) return null;
  const u = userRes.rows[0];
  const balBefore = parseFloat(u.balance);
  const balAfter  = balBefore + creditAmount;
  await client.query(
    'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
    [balAfter, u.wallet_id]
  );
  await client.query(
    `INSERT INTO wallet_transactions
       (wallet_id, user_id, transaction_type, amount, balance_before, balance_after,
        payment_gateway, status, description, reference_code)
     VALUES ($1,$2,'topup',$3,$4,$5,'sepay','success','Nap tien qua SePay – khoi phuc',$6)`,
    [u.wallet_id, u.user_id, creditAmount, balBefore, balAfter, refCode]
  );
  console.log(`[SePay] Khoi phuc refCode ${refCode} → user ${u.user_id} | +${creditAmount} → ${balAfter}`);
  return { user_id: u.user_id, wallet_id: u.wallet_id, balance_after: balAfter };
}

// POST /api/user/wallet/sepay-webhook — nhận webhook từ SePay
router.post('/sepay-webhook', async (req, res, next) => {
  try {
    // Xác thực: SePay gửi webhook_secret qua Authorization header HOẶC body field "code"
    // SEPAY_WEBHOOK_SECRET: lấy tại my.sepay.vn → Tài khoản ngân hàng → Webhook → "Mã xác thực"
    const webhookSecret = process.env.SEPAY_WEBHOOK_SECRET || process.env.SEPAY_API_KEY || '';
    const authHeader    = req.headers['authorization'] || '';
    const bodyCode      = req.body?.code || '';
    const authorized    = !webhookSecret ||
      authHeader === `Apikey ${webhookSecret}` ||
      bodyCode === webhookSecret;
    if (!authorized) {
      console.log('[Webhook] Auth failed — header:', authHeader, '| body.code:', bodyCode, '| expected secret:', webhookSecret ? '***' : 'EMPTY');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { content, transferAmount, transferType } = req.body;
    // Chỉ xử lý tiền vào
    console.log('[Webhook] Received — type:', transferType, '| amount:', transferAmount, '| content:', content);

    if (transferType !== 'in') return res.json({ success: true });

    // Tìm mã tham chiếu trong nội dung chuyển khoản
    const match = (content || '').match(/NAP[A-Z0-9]{12}/);
    if (!match) return res.json({ success: true });
    const refCode = match[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const txRes = await client.query(
        `SELECT transaction_id, wallet_id, user_id, amount
         FROM wallet_transactions
         WHERE reference_code = $1 AND status = 'pending'
         FOR UPDATE`,
        [refCode]
      );

      // Không có pending record → có thể backend đã restart mất INSERT
      // Kiểm tra xem đã xử lý trước đó chưa (status=success)
      if (!txRes.rows[0]) {
        const doneRes = await client.query(
          `SELECT 1 FROM wallet_transactions WHERE reference_code = $1 AND status = 'success'`,
          [refCode]
        );
        if (doneRes.rows[0]) {
          // Đã xử lý rồi (idempotent)
          await client.query('ROLLBACK');
          return res.json({ success: true });
        }
        // Chưa có record gì → khôi phục từ refCode prefix
        const creditAmount = parseFloat(transferAmount);
        if (!creditAmount || creditAmount <= 0) {
          await client.query('ROLLBACK');
          return res.json({ success: true });
        }
        const recovered = await creditByRefCode(refCode, creditAmount, client);
        if (recovered) {
          await client.query('COMMIT');
          pushTopupSuccess(refCode, { status: 'success', amount: creditAmount, balance_after: recovered.balance_after });
        } else {
          await client.query('ROLLBACK');
          console.log(`[Webhook] Khong tim thay user cho refCode ${refCode}`);
        }
        return res.json({ success: true });
      }

      const tx = txRes.rows[0];

      const walletRes = await client.query(
        'SELECT balance FROM wallets WHERE wallet_id = $1 FOR UPDATE',
        [tx.wallet_id]
      );
      const currentBalance = parseFloat(walletRes.rows[0].balance);
      const creditAmount   = parseFloat(transferAmount) || parseFloat(tx.amount);
      const newBalance     = currentBalance + creditAmount;

      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
        [newBalance, tx.wallet_id]
      );

      await client.query(
        `UPDATE wallet_transactions
         SET status = 'success', amount = $1, balance_before = $2, balance_after = $3,
             description = 'Nạp tiền qua SePay – thành công', updated_at = NOW()
         WHERE transaction_id = $4`,
        [creditAmount, currentBalance, newBalance, tx.transaction_id]
      );

      await client.query('COMMIT');
      // Đẩy SSE ngay lập tức cho frontend đang chờ
      pushTopupSuccess(refCode, { status: 'success', amount: creditAmount, balance_after: newBalance });
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// GET /api/user/wallet/topup-stream/:refCode?token=... — SSE stream cho realtime topup
// EventSource không gửi được header nên JWT truyền qua query param
router.get('/topup-stream/:refCode', async (req, res, next) => {
  try {
    const token = req.query.token || '';
    if (!token) return res.status(401).end();
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type !== 'user') return res.status(403).end();
      userId = decoded.id;
    } catch { return res.status(401).end(); }

    const { refCode } = req.params;
    if (!/^NAP[A-Z0-9]{12}$/.test(refCode)) return res.status(400).end();

    // Kiểm tra refCode thuộc user này
    const txRes = await pool.query(
      'SELECT status, amount, balance_after FROM wallet_transactions WHERE reference_code = $1 AND user_id = $2',
      [refCode, userId]
    );
    if (!txRes.rows[0]) return res.status(404).end();

    // Nếu đã success (ví dụ poll xử lý trước), trả về ngay
    if (txRes.rows[0].status === 'success') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`event: topup_success\ndata: ${JSON.stringify({ status: 'success', amount: txRes.rows[0].amount, balance_after: txRes.rows[0].balance_after })}\n\n`);
      return res.end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Heartbeat mỗi 20s để giữ kết nối
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 20000);

    // Tự động đóng sau 6 phút (QR hết hạn)
    const closeTimer = setTimeout(() => {
      clearInterval(heartbeat);
      topupStreams.delete(refCode);
      try { res.write('event: timeout\ndata: {}\n\n'); res.end(); } catch (_) {}
    }, 6 * 60 * 1000);

    topupStreams.set(refCode, { res, heartbeat, closeTimer });

    req.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(closeTimer);
      topupStreams.delete(refCode);
    });
  } catch (err) { next(err); }
});

// ──────────────────────────────────────────────────────────────────────────────
// Background polling: tự động kiểm tra SePay mỗi 8 giây
// Không cần webhook, không cần user click "Kiểm tra"
// ──────────────────────────────────────────────────────────────────────────────
async function pollPendingSePayTransactions() {
  const apiToken    = process.env.SEPAY_API_TOKEN    || '';
  const bankAccount = process.env.SEPAY_BANK_ACCOUNT || '';
  if (!apiToken || !bankAccount) return;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const sepayRes = await fetch(
      `https://my.sepay.vn/userapi/transactions/list?account_number=${bankAccount}&transaction_date_min=${today}&limit=100`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );
    if (!sepayRes.ok) return;
    const sepayData = await sepayRes.json();
    const sepayList = sepayData.transactions || sepayData.data || [];
    if (!sepayList.length) return;

    // ── Pha 1: xử lý các pending record trong DB ─────────────────────────
    const pending = await pool.query(
      `SELECT transaction_id, wallet_id, user_id, amount, reference_code
       FROM wallet_transactions
       WHERE payment_gateway = 'sepay' AND status = 'pending'
         AND created_at < NOW() - INTERVAL '10 seconds'
       ORDER BY created_at ASC LIMIT 20`
    );
    if (!pending.rows.length && !sepayList.length) return;
    if (pending.rows.length) {
      console.log(`[SePay Poller] Tim thay ${pending.rows.length} pending: ${pending.rows.map(r => r.reference_code).join(', ')}`);
    }

    for (const tx of pending.rows) {
      const matched = sepayList.find(t =>
        (t.transaction_content || '').includes(tx.reference_code)
      );
      if (!matched) continue;

      const creditAmount = parseFloat(matched.amount_in) || parseFloat(tx.amount);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const recheck = await client.query(
          'SELECT status FROM wallet_transactions WHERE transaction_id = $1 FOR UPDATE',
          [tx.transaction_id]
        );
        if (recheck.rows[0]?.status !== 'pending') {
          await client.query('ROLLBACK');
          continue;
        }

        const walletRes = await client.query(
          'SELECT balance FROM wallets WHERE wallet_id = $1 FOR UPDATE',
          [tx.wallet_id]
        );
        const currentBalance = parseFloat(walletRes.rows[0].balance);
        const newBalance     = currentBalance + creditAmount;

        await client.query(
          'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2',
          [newBalance, tx.wallet_id]
        );
        await client.query(
          `UPDATE wallet_transactions
           SET status = 'success', amount = $1, balance_before = $2, balance_after = $3,
               description = N'Nạp tiền qua SePay – thành công', updated_at = NOW()
           WHERE transaction_id = $4`,
          [creditAmount, currentBalance, newBalance, tx.transaction_id]
        );
        await client.query('COMMIT');

        console.log(`[SePay Poller] +${creditAmount} cho ${tx.reference_code} → số dư: ${newBalance}`);
        // Đẩy ngay về frontend đang giữ SSE connection
        pushTopupSuccess(tx.reference_code, {
          status: 'success',
          amount: creditAmount,
          balance_after: newBalance
        });
      } catch (pollErr) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[SePay Poller] Loi xu ly ${tx.reference_code}:`, pollErr.message);
      } finally {
        client.release();
      }
    }

    // ── Pha 2: khôi phục các giao dịch SePay NAP* không có record trong DB ──
    // Bắt đúng trường hợp backend restart giữa chừng mất INSERT
    const napTxs = sepayList.filter(t => /NAP[A-Z0-9]{12}/.test(t.transaction_content || ''));
    for (const st of napTxs) {
      const m = (st.transaction_content || '').match(/NAP[A-Z0-9]{12}/);
      if (!m) continue;
      const refCode = m[0];
      const existing = await pool.query(
        `SELECT 1 FROM wallet_transactions WHERE reference_code = $1`,
        [refCode]
      );
      if (existing.rows.length) continue; // đã có record (pending hoặc success)

      const creditAmount = parseFloat(st.amount_in);
      if (!creditAmount || creditAmount <= 0) continue;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Double-check trong transaction
        const recheck = await client.query(
          `SELECT 1 FROM wallet_transactions WHERE reference_code = $1`,
          [refCode]
        );
        if (recheck.rows.length) { await client.query('ROLLBACK'); continue; }

        const recovered = await creditByRefCode(refCode, creditAmount, client);
        if (recovered) {
          await client.query('COMMIT');
          console.log(`[SePay Poller] Orphan khoi phuc: ${refCode} +${creditAmount}`);
          pushTopupSuccess(refCode, { status: 'success', amount: creditAmount, balance_after: recovered.balance_after });
        } else {
          await client.query('ROLLBACK');
        }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
      } finally {
        client.release();
      }
    }
  } catch (_) {
    // Bo qua loi mang tam thoi
  }
}

// Khởi động poller (delay 5s để backend kịp khởi động xong)
setTimeout(() => {
  setInterval(pollPendingSePayTransactions, 8000);
  console.log('[SePay Poller] Da khoi dong – kiem tra moi 8 giay');
}, 5000);

module.exports = router;
