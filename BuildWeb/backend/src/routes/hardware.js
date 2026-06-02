

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

    if (!plateDetected || !faceDetected) {
      await client.query('ROLLBACK');
      const message = !plateDetected && !faceDetected
        ? 'Không nhận diện được biển số và khuôn mặt'
        : !plateDetected
          ? 'Không nhận diện được biển số'
          : 'Không nhận diện được khuôn mặt';
      console.warn(`[hardware/entry] Từ chối: ${message}`);
      return res.json({ allowed: false, message, session_id: null });
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
    if (!vRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.json({ allowed: false, message: 'Biển số chưa đăng ký trong hệ thống', session_id: null });
    }
    const vehicleId   = vRes.rows[0].vehicle_id;
    const plateOwner  = vRes.rows[0].user_id;

    if (plateOwner !== face_user_id) {
      await client.query('ROLLBACK');
      console.warn(`[hardware/entry] Mặt không khớp chủ xe: face=${face_user_id} plate_owner=${plateOwner}`);
      return res.json({ allowed: false, message: 'Khuôn mặt không khớp với chủ xe', session_id: null });
    }

    const userId = plateOwner;
    let userInfo = {
      user_id:      userId,
      full_name:    vRes.rows[0].full_name,
      phone_number: vRes.rows[0].phone_number,
      balance:      vRes.rows[0].balance,
    };
    let sessionKind = 'member';
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

    let sessionId;
    const compositeImagePath = plate_image_path;
    const sessionPlate = normalizedPlate;

    const sRes = await client.query(
      `INSERT INTO parking_sessions
         (user_id, vehicle_id, license_plate, lot_id, status, session_type,
          entry_time, entry_composite_image_path, entry_device_id)
       VALUES ($1, $2, $3, $4, 'active', $5, NOW(), $6, $7)
       RETURNING session_id`,
      [
        userId, vehicleId, sessionPlate, lotId,
        sessionKind,
        compositeImagePath, devUUID,
      ]
    );
    sessionId = sRes.rows[0].session_id;

    await client.query(
      `INSERT INTO event_logs (event_type, device_id, description)
       VALUES ('VEHICLE_ENTRY', $1, $2)`,
      [devUUID, `Xe vào: ${normalizedPlate || 'không rõ biển số'} – ${sessionKind}`]
    );

    await client.query('COMMIT');

    // Đếm số chỗ trống sau khi xe vào
    let available_slots = null;
    if (lotId) {
      const slotRes = await pool.query(
        `SELECT pl.total_capacity AS capacity,
                (SELECT COUNT(*) FROM parking_sessions ps2
                 WHERE ps2.lot_id = pl.lot_id AND ps2.status = 'active') AS occupied
         FROM parking_lots pl WHERE pl.lot_id = $1`,
        [lotId]
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
      io.emit('vehicle:entry', {
        session_id:   sessionId,
        session_kind: sessionKind,
        plate:        normalizedPlate,
        user_info:    userInfo,
        monthly_pass: monthlyPass,
        ts:           Date.now(),
      });
    }

    res.json({
      allowed:         true,
      session_id:      sessionId,
      session_kind:    sessionKind,
      user_info:       userInfo,
      monthly_pass:    !!monthlyPass,
      available_slots,
      message:         userId
        ? `Chào mừng ${userInfo.full_name}!`
        : 'Khách vãng lai – phiên tạo thành công',
    });

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
        `SELECT ps.session_id, ps.entry_time, ps.user_id, ps.vehicle_id,
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
          `SELECT session_id, entry_time, license_plate,
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
        `SELECT ps.session_id, ps.entry_time, ps.user_id, ps.vehicle_id,
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

    let fee = 0;

    if (hasMonthlyPassExit) {
      fee = 0;
    } else {
      const entryTime = new Date(session.entry_time);
      const exitTime  = new Date();
      const durationHours = Math.max(
        (exitTime - entryTime) / (1000 * 60 * 60),
        0
      );
      const exitHour = exitTime.getHours();

      const priceRes = await client.query(
        `SELECT price_per_hour, minimum_fee
         FROM pricing_configs
         WHERE is_active = true
           AND start_hour <= $1 AND end_hour > $1
         LIMIT 1`,
        [exitHour]
      );

      if (priceRes.rows[0]) {
        const { price_per_hour, minimum_fee } = priceRes.rows[0];
        fee = Math.max(
          Math.ceil(durationHours * price_per_hour),
          minimum_fee || 0
        );
      } else {
        fee = Math.ceil(durationHours * 5000);
      }
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
    } else {
      await client.query(
        `UPDATE guest_sessions
         SET status = 'completed', exit_time = NOW(), fee = $1,
             exit_composite_image_path = $2, exit_device_id = $3
         WHERE session_id = $4`,
        [fee, plate_image_path, devUUID, session.session_id]
      );
    }

    await client.query(
      `INSERT INTO event_logs (event_type, device_id, description)
       VALUES ('VEHICLE_EXIT', $1, $2)`,
      [devUUID, `Xe ra: ${normalizedPlate} – phí: ${fee}đ`]
    );

    await client.query('COMMIT');

    // Đếm số chỗ trống sau khi xe ra
    let available_slots_exit = null;
    const exitLotId = session.lot_id ?? null;
    if (exitLotId) {
      const slotRes2 = await pool.query(
        `SELECT pl.total_capacity AS capacity,
                (SELECT COUNT(*) FROM parking_sessions ps2
                 WHERE ps2.lot_id = pl.lot_id AND ps2.status = 'active') AS occupied
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
