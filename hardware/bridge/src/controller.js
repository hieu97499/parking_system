

const serial    = require('./esp8266Handler');
const ai        = require('./aiClient');
const backend   = require('./backendClient');
const ws        = require('./wsServer');
const cfg       = require('./config');

const _lastTrigger = { entry: 0, exit: 0 };
const _processing  = { entry: false, exit: false };
const _barrierOpen = { entry: false, exit: false };

let _lastKnownSlots = null;   // cache số chỗ trống mới nhất để gửi khi entry gate kết nối lại

function _debounced(gate) {
  const now = Date.now();
  if (_processing[gate]) return false;
  if (now - _lastTrigger[gate] < cfg.DEBOUNCE_MS) return false;
  _lastTrigger[gate] = now;
  return true;
}

async function handleEntry() {
  if (!_debounced('entry')) return;
  _processing.entry = true;

  console.log('\n[ENTRY] === Xe vào phát hiện ===');
  ws.broadcast('ENTRY_DETECTED', { gate: 'entry', ts: Date.now() });

  let aiResult = null;
  try {

    console.log('[ENTRY] Gọi AI service...');
    aiResult = await ai.processEntry();
    console.log('[ENTRY] AI kết quả:', {
      plate: aiResult.plate,
      plate_conf: aiResult.plate_confidence,
      face_user: aiResult.face_user_id,
      face_conf:  aiResult.face_confidence,
      time_ms:    aiResult.processing_time_ms,
    });
    ws.broadcast('AI_RESULT', { gate: 'entry', ...aiResult });

    if (aiResult.no_object) {
      console.warn('[ENTRY] Không có đối tượng nhận diện – giữ barrier đóng');
      serial.sendStatus('FAIL', 'KHONG CO XE', 0);
      ws.broadcast('NO_OBJECT', {
        gate: 'entry',
        message: 'Không có đối tượng nhận diện',
      });
      return;
    }

    const backendRes = await backend.reportEntry({
      plate:             aiResult.plate,
      plate_confidence:  aiResult.plate_confidence,
      plate_image_path:  aiResult.plate_image_path,
      face_user_id:      aiResult.face_user_id,
      face_confidence:   aiResult.face_confidence,
      face_image_path:   aiResult.face_image_path,
      device_id:         cfg.ENTRY_DEVICE_ID,
    });

    console.log('[ENTRY] Backend:', backendRes.message, '| allowed:', backendRes.allowed);
    ws.broadcast('SESSION_CREATED', { gate: 'entry', ...backendRes });

    // Cập nhật số chỗ trống lên OLED Entry Gate
    if (backendRes.available_slots != null) {
      _lastKnownSlots = backendRes.available_slots;
      serial.sendSlots(_lastKnownSlots);
    }

    // Backend là nơi duy nhất quyết định allowed – bao gồm:
    // kiểm tra conf ngưỡng, biển số trong DB, khuôn mặt khớp chủ xe, ví đủ tiền, vé tháng.
    if (backendRes.allowed) {
      serial.openBarrier('entry');
      _barrierOpen.entry = true;
      ws.broadcast('BARRIER_OPENED', { gate: 'entry' });
    } else {
      console.warn('[ENTRY] Từ chối vào:', backendRes.message);
      ws.broadcast('ERROR', { gate: 'entry', message: backendRes.message });
    }

  } catch (err) {
    console.error('[ENTRY] Lỗi:', err.message);
    ws.broadcast('ERROR', { gate: 'entry', message: err.message });

    console.warn('[ENTRY] AI/Backend lỗi – giữ barrier đóng, cần can thiệp thủ công');
  } finally {
    _processing.entry = false;
  }
}

async function handleExit() {
  if (!_debounced('exit')) return;
  _processing.exit = true;

  console.log('\n[EXIT] === Xe ra phát hiện ===');
  ws.broadcast('EXIT_DETECTED', { gate: 'exit', ts: Date.now() });

  let aiResult = null;
  try {

    console.log('[EXIT] Gọi AI service...');
    aiResult = await ai.processExit();
    console.log('[EXIT] AI kết quả:', {
      plate: aiResult.plate,
      plate_conf: aiResult.plate_confidence,
      face_user: aiResult.face_user_id,
      face_conf:  aiResult.face_confidence,
      time_ms:    aiResult.processing_time_ms,
    });
    ws.broadcast('AI_RESULT', { gate: 'exit', ...aiResult });

    if (aiResult.no_object) {
      console.warn('[EXIT] Không có đối tượng nhận diện – giữ barrier đóng');
      serial.sendStatus('FAIL', 'KHONG CO XE', 0);
      ws.broadcast('NO_OBJECT', {
        gate: 'exit',
        message: 'Không có đối tượng nhận diện',
      });
      return;
    }

    // Yêu cầu tối thiểu: phải đọc được biển số để Backend tra cứu phiên.
    // (Khách vãng lai cũng cần biển số – mặt khớp/không Backend tự xử lý.)
    const hasPlate = aiResult.plate && aiResult.plate.length >= 2
      && parseFloat(aiResult.plate_confidence || 0) >= parseFloat(process.env.PLATE_CONF_MIN || '0.45');

    if (!hasPlate) {
      console.warn(`[EXIT] Không đọc được biển số – giữ barrier đóng`);
      serial.sendStatus('FAIL', 'KHONG DOC BIEN', 0);
      ws.broadcast('ERROR', {
        gate: 'exit',
        message: 'Không nhận diện được biển số – cần can thiệp thủ công',
      });
      return;
    }

    const backendRes = await backend.reportExit({
      plate:            aiResult.plate,
      plate_confidence: aiResult.plate_confidence,
      plate_image_path: aiResult.plate_image_path,
      face_user_id:     aiResult.face_user_id,
      face_confidence:  aiResult.face_confidence,
      face_image_path:  aiResult.face_image_path,
      device_id:        cfg.EXIT_DEVICE_ID,
    });

    // ─── KHÁCH VÃNG LAI CẦN THANH TOÁN ───
    if (backendRes.payment_required) {
      console.log(`[EXIT] Khách vãng lai cần thanh toán: ${backendRes.fee}đ – mã ${backendRes.session_code}`);
      ws.broadcast('PAYMENT_REQUIRED', {
        gate: 'exit',
        session_code: backendRes.session_code,
        plate:        backendRes.plate,
        fee:          backendRes.fee,
        qr_url:       backendRes.qr_url,
        bank_account: backendRes.bank_account,
        bank_code:    backendRes.bank_code,
        account_name: backendRes.account_name,
      });
      serial.sendStatus('WAIT', `CHO TT ${backendRes.fee}`, backendRes.fee);

      // Poll trạng thái thanh toán mỗi 2s, timeout sau 5 phút
      const sessionCode = backendRes.session_code;
      const startTs = Date.now();
      const TIMEOUT_MS = 5 * 60 * 1000;
      let paid = false;
      while (Date.now() - startTs < TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const s = await backend.fetchGuestPaymentStatus(sessionCode);
          if (s.payment_status === 'paid' || s.status === 'completed') {
            paid = true;
            break;
          }
        } catch (e) { /* network blip – tiếp tục poll */ }
      }

      if (!paid) {
        console.warn(`[EXIT] Hết hạn chờ thanh toán cho ${sessionCode}`);
        ws.broadcast('PAYMENT_TIMEOUT', { gate: 'exit', session_code: sessionCode });
        serial.sendStatus('FAIL', 'HET HAN TT', 0);
        return;
      }

      console.log(`[EXIT] ✅ Thanh toán thành công ${sessionCode}`);
      ws.broadcast('PAYMENT_SUCCESS', {
        gate: 'exit',
        session_code: sessionCode,
        plate: backendRes.plate,
        fee:   backendRes.fee,
      });
      serial.sendStatus('OK', backendRes.plate || '', backendRes.fee || 0);
      serial.openBarrier('exit');
      _barrierOpen.exit = true;
      ws.broadcast('BARRIER_OPENED', { gate: 'exit' });
      // Cập nhật slot count
      try {
        const slots = await backend.fetchSlots();
        if (slots && typeof slots.available_slots === 'number') {
          _lastKnownSlots = slots.available_slots;
          serial.sendSlots(_lastKnownSlots);
        }
      } catch (_) {}
      return;
    }

    console.log('[EXIT] Backend:', backendRes.message,
      '| fee:', backendRes.fee,
      '| monthly_pass:', backendRes.monthly_pass);
    ws.broadcast('SESSION_CLOSED', { gate: 'exit', ...backendRes });

    serial.sendStatus('OK', aiResult.plate || '', backendRes.fee || 0);

    // Hiện QR mời dùng app trên TFT Exit Gate
    serial.sendQR('https://baixethongminh.duckdns.org');

    // Cập nhật số chỗ trống lên OLED Entry Gate
    if (backendRes.available_slots != null) {
      _lastKnownSlots = backendRes.available_slots;
      serial.sendSlots(_lastKnownSlots);
    }

    serial.openBarrier('exit');
    _barrierOpen.exit = true;
    ws.broadcast('BARRIER_OPENED', { gate: 'exit' });

  } catch (err) {
    console.error('[EXIT] Lỗi nhận diện:', err.message);
    serial.sendStatus('FAIL', 'LOI HE THONG', 0);
    ws.broadcast('ERROR', { gate: 'exit', message: `Nhận diện thất bại: ${err.message}` });

    console.warn('[EXIT] Barrier giữ đóng – chờ admin can thiệp thủ công hoặc xe rời đi');
  } finally {
    _processing.exit = false;
  }
}

function init() {
  serial.on('entry:detected', handleEntry);
  serial.on('exit:detected',  handleExit);

  serial.on('entry:clear', () => {
    console.log('[ENTRY] Sensor clear');
    if (_barrierOpen.entry) {
      _barrierOpen.entry = false;
      ws.broadcast('BARRIER_CLOSED', { gate: 'entry' });
    }
  });

  serial.on('exit:clear', () => {
    console.log('[EXIT] Sensor clear');
    if (_barrierOpen.exit) {
      _barrierOpen.exit = false;
      ws.broadcast('BARRIER_CLOSED', { gate: 'exit' });
    }
  });

  serial.on('connected',    gate => {
    console.log(`[Serial] ${gate} gate kết nối`);
    ws.broadcast('DEVICE_CONNECTED', { gate });
    // Gửi số chỗ trống hiện tại ngay khi entry gate kết nối/kết nối lại
    if (gate === 'entry' && _lastKnownSlots !== null) {
      serial.sendSlots(_lastKnownSlots);
    }
  });
  serial.on('disconnected', gate => {
    console.warn(`[Serial] ${gate} gate mất kết nối`);
    ws.broadcast('DEVICE_DISCONNECTED', { gate });
  });

  ws.setController({ simulate });

  // Poll slot count from backend mỗi 5s và gửi xuống entry gate OLED
  const pollSlots = async () => {
    try {
      const s = await backend.fetchSlots();
      if (s && typeof s.available_slots === 'number' && s.available_slots !== _lastKnownSlots) {
        _lastKnownSlots = s.available_slots;
        serial.sendSlots(_lastKnownSlots);
        console.log(`[Slots] ${_lastKnownSlots} chỗ trống (poll backend)`);
      }
    } catch (err) {
      // backend chưa sẵn sàng – im lặng
    }
  };
  setInterval(pollSlots, 5000);
  pollSlots();  // gọi ngay lần đầu
}

function simulate(gate) {
  if (gate === 'exit') {
    handleExit();
  } else {
    handleEntry();
  }
}

module.exports = { init };
