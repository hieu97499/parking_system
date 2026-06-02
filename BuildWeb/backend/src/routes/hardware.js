

const fs      = require('fs');
const path    = require('path');
const router  = require('express').Router();
const { pool }= require('../db');

const CAPTURES_DIR = path.join(__dirname, '..', '..', 'uploads', 'captures');
const FACES_DIR    = path.join(__dirname, '..', '..', 'uploads', 'faces');

function hardwareAuth(req, res, next) {
  const key = req.headers['x-hardware-key'];
  if (!key || key !== process.env.HARDWARE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized hardware request' });
  }
  next();
}

router.post('/entry', hardwareAuth, async (req, res, next) => {
  const {
    plate            = '',
    plate_confidence = 0,
    plate_image_path = null,
    face_user_id     = null,
    face_confidence  = 0,
    face_image_path  = null,
    device_id        = null,
  } = req.body;

  const devUUID = device_id && /^[0-9a-f-]{36}$/i.test(String(device_id)) ? device_id : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const normalizedPlate = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    let lotId = null;
    if (devUUID) {
      const dRes = await client.query(
        `SELECT lot_id FROM devices WHERE device_id = $1`, [devUUID]
      );
      lotId = dRes.rows[0]?.lot_id ?? null;
    }

    if (!lotId) {
      const lRes = await client.query(`SELECT lot_id FROM parking_lots LIMIT 1`);
      lotId = lRes.rows[0]?.lot_id ?? null;
    }

    const PLATE_THRESH = parseFloat(process.env.PLATE_CONF_MIN || '0.5');
    const FACE_THRESH  = parseFloat(process.env.FACE_CONF_MIN  || '0.55');

    const plateDetected = !!(normalizedPlate && parseFloat(plate_confidence) >= PLATE_THRESH);
    const faceDetected  = !!(face_user_id    && parseFloat(face_confidence)  >= FACE_THRESH);

    // Bắt buộc phải đọc được biển số để có thể tra cứu khi xe ra
    if (!plateDetected) {
      await client.query('ROLLBACK');
      console.warn(`[hardware/entry] Từ chối: không đọc được biển số`);
      return res.json({ allowed: false, message: 'Không nhận diện được biển số', session_id: null });
    }

    const vRes = await client.query(
      `SELECT v.vehicle_id, v.user_id, u.full_name, u.phone_number, w.balance
       FROM vehicles v
       JOIN users u  ON u.user_id  = v.user_id
       JOIN wallets w ON w.user_id = v.user_id
       WHERE UPPER(REGEXP_REPLACE(v.license_plate, '[^A-Z0-9]', '', 'g')) = $1 AND v.is_active = true
       LIMIT 1`,
      [normalizedPlate]
    );

    const plateRegistered = !!vRes.rows[0];
    const plateOwner      = plateRegistered ? vRes.rows[0].user_id : null;
    const faceMatchesOwner = plateRegistered && faceDetected && plateOwner === face_user_id;

    // ─── Kiểm tra ỦY QUYỀN: nếu face KHÔNG khớp chủ xe, tra bảng authorizations ───
    let activeAuth = null;
    if (plateRegistered && faceDetected && !faceMatchesOwner) {
      const authRes = await client.query(
        `SELECT a.auth_id, a.auth_type, a.delegate_user_id, a.delegate_name,
                a.valid_from, a.valid_until, a.is_consumed,
                du.full_name AS delegate_full_name, du.phone_number AS delegate_phone
         FROM authorizations a
         LEFT JOIN users du ON du.user_id = a.delegate_user_id
         WHERE a.vehicle_id = $1
           AND a.delegate_user_id = $2
           AND a.is_active = true
           AND (a.valid_from  IS NULL OR a.valid_from  <= NOW())
           AND (a.valid_until IS NULL OR a.valid_until >= NOW())
           AND (a.auth_type <> 'once' OR a.is_consumed = false)
         ORDER BY a.created_at DESC
         LIMIT 1`,
        [vRes.rows[0].vehicle_id, face_user_id]
      );
      if (authRes.rows[0]) activeAuth = authRes.rows[0];
    }

    // Thành viên: biển số đã đăng ký VÀ (khuôn mặt khớp chủ xe HOẶC có ủy quyền hợp lệ)
    // Khách vãng lai: ngược lại (biển lạ, hoặc biển có nhưng không có ủy quyền)
    const isMember = plateRegistered && (faceMatchesOwner || !!activeAuth);

    if (isMember) {
      const vehicleId  = vRes.rows[0].vehicle_id;
      const userId     = plateOwner; // luôn ghi nhận theo CHỦ XE để trừ ví đúng
      const sessionType = activeAuth ? 'authorized' : 'member';
      const authId      = activeAuth ? activeAuth.auth_id : null;
      let userInfo = {
        user_id:      userId,
        full_name:    vRes.rows[0].full_name,
        phone_number: vRes.rows[0].phone_number,
        balance:      vRes.rows[0].balance,
        // Nếu là người được ủy quyền vào → kèm thông tin delegate để OperatorWeb hiển thị
        delegate:     activeAuth ? {
          user_id:   activeAuth.delegate_user_id,
          full_name: activeAuth.delegate_full_name || activeAuth.delegate_name,
          phone:     activeAuth.delegate_phone,
          auth_type: activeAuth.auth_type,
        } : null,
      };
      let monthlyPass = null;

      const activeCheck = await client.query(
        `SELECT session_id FROM parking_sessions
         WHERE license_plate = $1 AND status = 'active' LIMIT 1`,
        [normalizedPlate]
      );
      if (activeCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.json({ allowed: false, message: 'Biển số xe đang trong bãi', session_id: null });
      }

      const mpRes = await client.query(
        `SELECT mp.pass_id, mp.valid_until, mp.status, pl.name AS lot_name
         FROM monthly_passes mp
         JOIN parking_lots pl ON pl.lot_id = mp.lot_id
         WHERE mp.vehicle_id = $1 AND mp.status = 'active' AND mp.valid_until >= NOW()
         LIMIT 1`,
        [vehicleId]
      );
      if (mpRes.rows[0]) monthlyPass = mpRes.rows[0];

      const sRes = await client.query(
        `INSERT INTO parking_sessions
           (user_id, vehicle_id, auth_id, license_plate, lot_id, status, session_type,
            entry_time, entry_composite_image_path, entry_device_id)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), $7, $8)
         RETURNING session_id`,
        [userId, vehicleId, authId, normalizedPlate, lotId, sessionType, plate_image_path, devUUID]
      );
      const sessionId = sRes.rows[0].session_id;

      await client.query(
        `INSERT INTO event_logs (event_type, device_id, description)
         VALUES ('VEHICLE_ENTRY', $1, $2)`,
        [devUUID, activeAuth
          ? `Xe vào: ${normalizedPlate} – ỦY QUYỀN (${activeAuth.auth_type}) cho ${activeAuth.delegate_full_name || activeAuth.delegate_name}`
          : `Xe vào: ${normalizedPlate} – member`]
      );

      await client.query('COMMIT');

      // tiếp tục đếm slot ở dưới (chia sẻ logic) – set biến cho phần dưới
      var _resultPayload = {
        allowed: true,
        session_id: sessionId,
        session_kind: sessionType, // 'member' hoặc 'authorized'
        user_info: userInfo,
        monthly_pass: !!monthlyPass,
        message: activeAuth
          ? `Người được ủy quyền: ${activeAuth.delegate_full_name || activeAuth.delegate_name} – xe của ${userInfo.full_name}`
          : `Chào mừng ${userInfo.full_name}!`,
        plate: normalizedPlate,
      };
      var _emitEvent = 'vehicle:entry';
      var _eventLotId = lotId;
    } else {
      // ─── KHÁCH VÃNG LAI ───
      // Kiểm tra biển số chưa có phiên active nào (cả member lẫn guest)
      const dupCheck = await client.query(
        `SELECT 1 FROM parking_sessions
         WHERE UPPER(REGEXP_REPLACE(license_plate, '[^A-Z0-9]', '', 'g')) = $1 AND status = 'active'
         UNION ALL
         SELECT 1 FROM guest_sessions
         WHERE UPPER(REGEXP_REPLACE(license_plate, '[^A-Z0-9]', '', 'g')) = $1 AND status = 'active'
         LIMIT 1`,
        [normalizedPlate]
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.json({ allowed: false, message: 'Biển số xe đang trong bãi', session_id: null });
      }

      // session_code = BAI + 12 ký tự hex viết hoa (khớp regex /BAI[A-Z0-9]{12}/)
      const sessionCode = 'BAI' + require('crypto').randomBytes(6).toString('hex').toUpperCase();

      const gRes = await client.query(
        `INSERT INTO guest_sessions
           (session_code, license_plate, lot_id, entry_time,
            entry_composite_image_path, entry_device_id, status, payment_status)
         VALUES ($1, $2, $3, NOW(), $4, $5, 'active', 'pending')
         RETURNING session_id`,
        [sessionCode, normalizedPlate, lotId, plate_image_path, devUUID]
      );
      const sessionId = gRes.rows[0].session_id;

      const reason = !plateRegistered
        ? 'biển số chưa đăng ký'
        : !faceDetected
          ? 'không đọc được khuôn mặt'
          : 'mặt không khớp chủ xe và không có ủy quyền';

      await client.query(
        `INSERT INTO event_logs (event_type, device_id, description)
         VALUES ('VEHICLE_ENTRY', $1, $2)`,
        [devUUID, `Xe vào (khách vãng lai – ${reason}): ${normalizedPlate} – mã ${sessionCode}`]
      );

      await client.query('COMMIT');

      var _resultPayload = {
        allowed: true,
        session_id: sessionId,
        session_kind: 'guest',
        session_code: sessionCode,
        user_info: null,
        monthly_pass: false,
        message: `Khách vãng lai – mã phiên ${sessionCode}`,
        plate: normalizedPlate,
      };
      var _emitEvent = 'vehicle:entry';
      var _eventLotId = lotId;
    }

    // Đếm số chỗ trống sau khi xe vào (cả member lẫn guest đều chiếm chỗ)
    let available_slots = null;
    if (_eventLotId) {
      const slotRes = await pool.query(
        `SELECT pl.total_capacity AS capacity,
                ((SELECT COUNT(*) FROM parking_sessions ps2 WHERE ps2.lot_id = pl.lot_id AND ps2.status = 'active') +
                 (SELECT COUNT(*) FROM guest_sessions gs2  WHERE gs2.lot_id = pl.lot_id AND gs2.status = 'active')) AS occupied
         FROM parking_lots pl WHERE pl.lot_id = $1`,
        [_eventLotId]
      );
      if (slotRes.rows[0]) {
        available_slots = Math.max(
          0,
          Number(slotRes.rows[0].capacity) - Number(slotRes.rows[0].occupied)
        );
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.emit(_emitEvent, {
        session_id:   _resultPayload.session_id,
        session_kind: _resultPayload.session_kind,
        plate:        _resultPayload.plate,
        user_info:    _resultPayload.user_info,
        monthly_pass: _resultPayload.monthly_pass,
        ts:           Date.now(),
      });
    }

    res.json({ ..._resultPayload, available_slots });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.post('/exit', hardwareAuth, async (req, res, next) => {
  const {
    plate            = '',
    plate_confidence = 0,
    plate_image_path = null,
    face_image_path  = null,
    face_user_id     = null,
    face_confidence  = 0,
    device_id        = null,
  } = req.body;

  const devUUID = device_id && /^[0-9a-f-]{36}$/i.test(String(device_id)) ? device_id : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const normalizedPlate = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    let session     = null;
    let sessionKind = null;

    if (normalizedPlate) {

      const mRes = await client.query(
        `SELECT ps.session_id, ps.entry_time, ps.user_id, ps.vehicle_id, ps.auth_id,
                ps.license_plate, ps.session_type, ps.lot_id,
                u.full_name, u.phone_number, w.wallet_id, w.balance,
                'member' AS kind
         FROM parking_sessions ps
         JOIN users u  ON u.user_id  = ps.user_id
         JOIN wallets w ON w.user_id = ps.user_id
         WHERE UPPER(REGEXP_REPLACE(ps.license_plate, '[^A-Z0-9]', '', 'g')) = $1 AND ps.status = 'active'
         LIMIT 1`,
        [normalizedPlate]
      );

      if (mRes.rows[0]) {
        session     = mRes.rows[0];
        sessionKind = 'member';
      } else {

        const gRes = await client.query(
          `SELECT session_id, session_code, entry_time, license_plate, lot_id,
                  fee, payment_status,
                  NULL::uuid AS user_id, 'guest' AS kind
           FROM guest_sessions
           WHERE UPPER(REGEXP_REPLACE(license_plate, '[^A-Z0-9]', '', 'g')) = $1 AND status = 'active'
           LIMIT 1`,
          [normalizedPlate]
        );
        if (gRes.rows[0]) {
          session     = gRes.rows[0];
          sessionKind = 'guest';
        }
      }
    }

    if (!session && face_user_id && face_confidence >= parseFloat(process.env.FACE_CONF_MIN || '0.55')) {
      const fRes = await client.query(
        `SELECT ps.session_id, ps.entry_time, ps.user_id, ps.vehicle_id, ps.auth_id,
                ps.license_plate, ps.session_type, ps.lot_id,
                u.full_name, u.phone_number, w.wallet_id, w.balance,
                'member' AS kind
         FROM parking_sessions ps
         JOIN users u  ON u.user_id  = ps.user_id
         JOIN wallets w ON w.user_id = ps.user_id
         WHERE ps.user_id = $1 AND ps.status = 'active'
         ORDER BY ps.entry_time DESC
         LIMIT 1`,
        [face_user_id]
      );
      if (fRes.rows[0]) {
        session     = fRes.rows[0];
        sessionKind = 'member';
      }
    }

    if (!session) {
      await client.query('ROLLBACK');
      console.warn(`[hardware/exit] Không tìm thấy phiên cho biển số: ${normalizedPlate}`);
      return res.json({
        allowed:    true,
        session_id: null,
        fee:        0,
        message:    `Không tìm thấy phiên cho biển số ${normalizedPlate || 'không rõ'}`,
      });
    }

    let hasMonthlyPassExit = false;
    if (sessionKind === 'member' && session.vehicle_id) {
      const mpExitRes = await client.query(
        `SELECT pass_id FROM monthly_passes
         WHERE vehicle_id = $1 AND status = 'active' AND valid_until >= NOW()
         LIMIT 1`,
        [session.vehicle_id]
      );
      hasMonthlyPassExit = !!mpExitRes.rows[0];
    }

    // ─── Tính phí: 5000đ vào cổng + 5000đ cho mỗi 6 giờ tiếp theo ───
    let fee = 0;
    if (!hasMonthlyPassExit) {
      const entryTime = new Date(session.entry_time);
      const exitTime  = new Date();
      const durationHours = Math.max((exitTime - entryTime) / (1000 * 60 * 60), 0);
      fee = 5000 + 5000 * Math.floor(durationHours / 6);
    }

    // ─── Nếu là khách vãng lai và chưa thanh toán → trả về QR, GIỮ phiên active ───
    if (sessionKind === 'guest' && session.payment_status !== 'paid') {
      // Cập nhật fee mới nhất vào DB (mỗi lần exit recompute do thời gian trôi)
      await client.query(
        `UPDATE guest_sessions
         SET fee = $1, exit_composite_image_path = COALESCE($2, exit_composite_image_path),
             exit_device_id = COALESCE($3, exit_device_id), updated_at = NOW()
         WHERE session_id = $4`,
        [fee, plate_image_path, devUUID, session.session_id]
      );
      await client.query('COMMIT');

      const bankAccount = process.env.SEPAY_BANK_ACCOUNT || '';
      const bankCode    = process.env.SEPAY_BANK_CODE    || '';
      const accountName = process.env.SEPAY_ACCOUNT_NAME || '';
      const qrUrl = `https://img.vietqr.io/image/${bankCode}-${bankAccount}-qr_only.png` +
        `?amount=${fee}&addInfo=${encodeURIComponent(session.session_code)}&accountName=${encodeURIComponent(accountName)}`;

      return res.json({
        allowed:          false,
        payment_required: true,
        session_id:       session.session_id,
        session_kind:     'guest',
        session_code:     session.session_code,
        plate:            normalizedPlate,
        fee,
        qr_url:           qrUrl,
        bank_account:     bankAccount,
        bank_code:        bankCode,
        account_name:     accountName,
        message:          `Khách vãng lai – cần thanh toán ${fee.toLocaleString('vi-VN')}đ qua QR`,
      });
    }

    if (sessionKind === 'member' && fee > 0) {
      // Cho phép số dư âm để tránh trường hợp xe ra miễn phí khi ví không đủ
      // (ghi nợ – user có thể nạp tiền bù sau)
      const walletRes = await client.query(
        `UPDATE wallets SET balance = balance - $1, updated_at = NOW()
         WHERE wallet_id = $2
         RETURNING balance`,
        [fee, session.wallet_id]
      );

      if (!walletRes.rows[0]) {
        console.warn(`[hardware/exit] Không cập nhật được ví – wallet_id không tồn tại`);
      } else {

        await client.query(
          `INSERT INTO wallet_transactions
             (wallet_id, user_id, transaction_type, amount,
              balance_before, balance_after, status, description, parking_session_id)
           VALUES ($1, $2, 'deduct', $3,
                   $4, $5, 'success', 'Phí đỗ xe tự động', $6)`,
          [
            session.wallet_id, session.user_id, fee,
            parseFloat(session.balance),
            parseFloat(walletRes.rows[0].balance),
            session.session_id,
          ]
        );
      }
    }

    if (sessionKind === 'member') {
      await client.query(
        `UPDATE parking_sessions
         SET status = 'completed', exit_time = NOW(), fee = $1,
             exit_composite_image_path = $2, exit_device_id = $3
         WHERE session_id = $4`,
        [fee, plate_image_path, devUUID, session.session_id]
      );

      // Nếu phiên này dùng ủy quyền loại 'once' → đánh dấu đã tiêu thụ
      if (session.auth_id) {
        await client.query(
          `UPDATE authorizations
           SET is_consumed = true, consumed_at = NOW()
           WHERE auth_id = $1 AND auth_type = 'once' AND is_consumed = false`,
          [session.auth_id]
        );
      }
    } else {
      // Khách đã thanh toán (payment_status='paid') → đóng phiên
      await client.query(
        `UPDATE guest_sessions
         SET status = 'completed', exit_time = NOW(),
             exit_composite_image_path = COALESCE($1, exit_composite_image_path),
             exit_device_id = COALESCE($2, exit_device_id)
         WHERE session_id = $3`,
        [plate_image_path, devUUID, session.session_id]
      );
    }

    await client.query(
      `INSERT INTO event_logs (event_type, device_id, description)
       VALUES ('VEHICLE_EXIT', $1, $2)`,
      [devUUID, `Xe ra: ${normalizedPlate} – phí: ${fee}đ`]
    );

    await client.query('COMMIT');

    // Đếm số chỗ trống sau khi xe ra (cả member lẫn guest đều chiếm chỗ)
    let available_slots_exit = null;
    const exitLotId = session.lot_id ?? null;
    if (exitLotId) {
      const slotRes2 = await pool.query(
        `SELECT pl.total_capacity AS capacity,
                ((SELECT COUNT(*) FROM parking_sessions ps2 WHERE ps2.lot_id = pl.lot_id AND ps2.status = 'active') +
                 (SELECT COUNT(*) FROM guest_sessions gs2  WHERE gs2.lot_id = pl.lot_id AND gs2.status = 'active')) AS occupied
         FROM parking_lots pl WHERE pl.lot_id = $1`,
        [exitLotId]
      );
      if (slotRes2.rows[0]) {
        available_slots_exit = Math.max(
          0,
          Number(slotRes2.rows[0].capacity) - Number(slotRes2.rows[0].occupied)
        );
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('vehicle:exit', {
        session_id:   session.session_id,
        session_kind: sessionKind,
        plate:        normalizedPlate,
        fee,
        ts:           Date.now(),
      });
    }

    res.json({
      allowed:         true,
      session_id:      session.session_id,
      session_kind:    sessionKind,
      fee,
      monthly_pass:    hasMonthlyPassExit,
      available_slots: available_slots_exit,
      message:         hasMonthlyPassExit
        ? 'Vé tháng – miễn phí'
        : fee > 0
          ? `Phí: ${fee.toLocaleString('vi-VN')}đ`
          : 'Ra xe – phí 0đ',
      user_info:    sessionKind === 'member'
        ? { full_name: session.full_name, phone_number: session.phone_number }
        : null,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ─── Bridge polls trạng thái thanh toán của khách vãng lai ───
router.get('/guest-payment-status/:sessionCode', hardwareAuth, async (req, res, next) => {
  try {
    const code = String(req.params.sessionCode || '').toUpperCase();
    if (!/^BAI[A-Z0-9]{12}$/.test(code)) {
      return res.status(400).json({ error: 'Mã phiên không hợp lệ' });
    }
    const { rows } = await pool.query(
      `SELECT session_id, session_code, license_plate, fee, payment_status, paid_at, status, lot_id
       FROM guest_sessions WHERE session_code = $1`,
      [code]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy phiên' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/registered-plates', hardwareAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.license_plate, v.vehicle_id, u.full_name, u.user_id
       FROM vehicles v
       JOIN users u ON u.user_id = v.user_id
       WHERE v.is_active = true
       ORDER BY v.license_plate`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/registered-vehicles', hardwareAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         v.license_plate,
         v.vehicle_id,
         u.user_id,
         u.full_name,
         u.phone_number,
         EXISTS (
           SELECT 1 FROM user_face_images ufi
           WHERE ufi.user_id = u.user_id
         ) AS has_face
       FROM vehicles v
       JOIN users u ON u.user_id = v.user_id
       WHERE v.is_active = true
       ORDER BY u.full_name, v.license_plate`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/hardware/upload-image
 * Nhận ảnh base64 từ AI service (máy local), lưu vào uploads/captures/ trên server.
 * Trả về đường dẫn tương đối để lưu vào DB.
 */
router.post('/upload-image', hardwareAuth, (req, res, next) => {
  try {
    const { image_b64, prefix = 'capture' } = req.body;
    if (!image_b64 || typeof image_b64 !== 'string') {
      return res.status(400).json({ error: 'Thiếu image_b64' });
    }

    const b64Data = image_b64.includes(',') ? image_b64.split(',')[1] : image_b64;
    const buffer  = Buffer.from(b64Data, 'base64');

    const ts       = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15);
    const uid      = Math.random().toString(36).slice(2, 8);
    const safePfx  = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const filename = `${safePfx}_${ts}_${uid}.jpg`;
    const filepath = path.join(CAPTURES_DIR, filename);

    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
    fs.writeFileSync(filepath, buffer);

    res.json({ path: `captures/${filename}` });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/hardware/faces/embeddings
 * AI Service tải embeddings đã tính sẵn từ DB (nhanh hơn tải ảnh).
 * Trả về: { embeddings: [{ user_id, angle, embedding: number[] }] }
 */
router.get('/faces/embeddings', hardwareAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ufi.user_id, ufi.angle, fe.embedding
       FROM user_face_images ufi
       JOIN face_embeddings fe ON fe.embedding_id = ufi.embedding_id
       WHERE fe.is_active = true AND ufi.angle IS NOT NULL
       ORDER BY ufi.user_id`
    );
    res.json({ embeddings: result.rows });
  } catch (err) { next(err); }
});

/**
 * PUT /api/hardware/faces/embeddings
 * AI Service upload embeddings vừa tính được lên DB để cache.
 * Body: { embeddings: [{ user_id, angle, embedding: number[] }] }
 */
router.put('/faces/embeddings', hardwareAuth, async (req, res, next) => {
  const { embeddings } = req.body;
  if (!Array.isArray(embeddings) || embeddings.length === 0) {
    return res.status(400).json({ error: 'embeddings array required' });
  }
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let saved = 0;
      for (const { user_id, angle, embedding } of embeddings) {
        if (!user_id || !angle || !Array.isArray(embedding)) continue;

        // Tìm hoặc tạo row trong face_embeddings, sau đó gắn embedding_id vào user_face_images theo (user_id, angle)
        const ufiRes = await client.query(
          'SELECT image_id, embedding_id FROM user_face_images WHERE user_id = $1 AND angle = $2',
          [user_id, angle]
        );
        if (ufiRes.rows.length === 0) continue;  // chưa có ảnh góc này
        const { image_id, embedding_id } = ufiRes.rows[0];

        if (embedding_id) {
          await client.query(
            `UPDATE face_embeddings SET embedding = $1::REAL[], updated_at = NOW()
             WHERE embedding_id = $2`,
            [embedding, embedding_id]
          );
        } else {
          const newEmb = await client.query(
            `INSERT INTO face_embeddings (user_id, embedding, is_active)
             VALUES ($1, $2::REAL[], true) RETURNING embedding_id`,
            [user_id, embedding]
          );
          await client.query(
            `UPDATE user_face_images SET embedding_id = $1, status = 'processed', updated_at = NOW()
             WHERE image_id = $2`,
            [newEmb.rows[0].embedding_id, image_id]
          );
        }
        saved++;
      }
      await client.query('COMMIT');
      res.json({ saved });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/**
 * GET /api/hardware/faces/download
 * AI Service (máy local) gọi để tải toàn bộ ảnh khuôn mặt đã đăng ký.
 * Trả về: { users: [{ user_id, images: [{ filename, image_b64 }] }] }
 */
router.get('/faces/download', hardwareAuth, (req, res, next) => {
  try {
    if (!fs.existsSync(FACES_DIR)) {
      return res.json({ users: [] });
    }
    const users = [];
    for (const userId of fs.readdirSync(FACES_DIR)) {
      const userDir = path.join(FACES_DIR, userId);
      if (!fs.statSync(userDir).isDirectory()) continue;
      const images = [];
      for (const file of fs.readdirSync(userDir)) {
        if (!/\.(jpg|jpeg|png)$/i.test(file)) continue;
        const buf = fs.readFileSync(path.join(userDir, file));
        images.push({ filename: file, image_b64: buf.toString('base64') });
      }
      if (images.length > 0) users.push({ user_id: userId, images });
    }
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// POST /api/hardware/manual-event – Operator Web ghi nhận thao tác thủ công
router.post('/manual-event', hardwareAuth, async (req, res, next) => {
  const {
    event_type  = 'BARRIER_MANUAL_OPEN',
    gate        = null,
    description = '',
    device_id   = null,
  } = req.body;

  const devUUID = device_id && /^[0-9a-f-]{36}$/i.test(String(device_id)) ? device_id : null;
  const desc = description || `Thao tác thủ công: ${event_type} – cổng ${gate === 'entry' ? 'vào' : gate === 'exit' ? 'ra' : 'không rõ'}`;

  try {
    await pool.query(
      `INSERT INTO event_logs (event_type, device_id, description)
       VALUES ($1, $2, $3)`,
      [event_type.toUpperCase(), devUUID, desc]
    );

    const io = req.app.get('io');
    if (io) io.emit('hardware:manual_event', { event_type, gate, description: desc, ts: Date.now() });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/slots', hardwareAuth, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT pl.lot_id, pl.total_capacity AS capacity,
              (SELECT COUNT(*) FROM parking_sessions ps
               WHERE ps.lot_id = pl.lot_id AND ps.status = 'active') AS occupied
       FROM parking_lots pl ORDER BY pl.lot_id LIMIT 1`
    );
    if (!r.rows[0]) return res.json({ available_slots: 0, capacity: 0, occupied: 0 });
    const capacity = Number(r.rows[0].capacity);
    const occupied = Number(r.rows[0].occupied);
    res.json({
      available_slots: Math.max(0, capacity - occupied),
      capacity,
      occupied,
    });
  } catch (err) { next(err); }
});

module.exports = router;
