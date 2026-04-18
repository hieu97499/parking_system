

const { SerialPort }         = require('serialport');
const EventEmitter           = require('events');
const cfg                    = require('./config');
const { resolvePort }        = require('./comAutoDetect');

class SerialHandler extends EventEmitter {
  constructor() {
    super();
    this._entryPort = null;
    this._exitPort  = null;
    this._entryReady = false;
    this._exitReady  = false;
  }

  connect() {
    const entryPort = resolvePort('entry', cfg.ENTRY_SERIAL_NUMBER, cfg.ENTRY_SERIAL_PORT);
    const exitPort  = resolvePort('exit',  cfg.EXIT_SERIAL_NUMBER,  cfg.EXIT_SERIAL_PORT);
    this._openPort('entry', entryPort);
    this._openPort('exit',  exitPort);
  }

  _openPort(gate, path) {
    const port = new SerialPort({
      path,
      baudRate: cfg.SERIAL_BAUD,
      autoOpen: false,
      rtscts:   false,
      xon:      false,
      xoff:     false,
      hupcl:    false,
    });

    let _lineBuf = '';
    const self = this;
    port.on('data', (chunk) => {
      _lineBuf += chunk.toString('utf8');
      let idx;
      while ((idx = _lineBuf.indexOf('\n')) !== -1) {
        const line = _lineBuf.slice(0, idx).replace(/\r$/, '').trim();
        _lineBuf = _lineBuf.slice(idx + 1);
        if (line) self._handleLine(gate, line);
      }
    });

    port.open(err => {
      if (err) {
        console.error(`[Serial:${gate}] Không mở được ${path}:`, err.message);
        const serialNum = gate === 'entry' ? cfg.ENTRY_SERIAL_NUMBER : cfg.EXIT_SERIAL_NUMBER;
        const fallback  = gate === 'entry' ? cfg.ENTRY_SERIAL_PORT   : cfg.EXIT_SERIAL_PORT;
        setTimeout(() => {

          const retryPath = resolvePort(gate, serialNum, fallback);
          this._openPort(gate, retryPath);
        }, 5000);
        return;
      }
      console.log(`[Serial:${gate}] Kết nối ${path} thành công`);

      port.set({ dtr: false, rts: false }, () => {
        setTimeout(() => {
          port.set({ dtr: true, rts: true }, (e) => {
            if (e) console.warn(`[Serial:${gate}] set DTR high:`, e.message);
          });
        }, 150);
      });

      const _doPing = () => {
        if (!port.isOpen) return;
        port.write('PING\n');
        console.log(`[Serial:${gate}] >>> PING`);
      };
      setTimeout(_doPing, 2500);

      const _pingInterval = setInterval(() => {
        if (!port.isOpen) { clearInterval(_pingInterval); return; }
        const ready = gate === 'entry' ? this._entryReady : this._exitReady;
        if (!ready) {
          console.log(`[Serial:${gate}] Chưa thấy READY – thử PING lại...`);
          _doPing();
        } else {
          clearInterval(_pingInterval);
        }
      }, 10000);

      port.once('close', () => clearInterval(_pingInterval));
    });

    port.on('close', () => {
      console.warn(`[Serial:${gate}] Mất kết nối – thử lại sau 5s`);
      if (gate === 'entry') this._entryReady = false;
      else                  this._exitReady  = false;
      this.emit('disconnected', gate);
      setTimeout(() => this._openPort(gate, path), 5000);
    });

    port.on('error', err => {
      console.error(`[Serial:${gate}] Lỗi:`, err.message);
    });

    if (gate === 'entry') this._entryPort = port;
    else                  this._exitPort  = port;
  }

  _handleLine(gate, line) {
    if (!line) return;
    console.log(`[Serial:${gate}] <<< ${line}`);

    if (line === `READY:${gate.toUpperCase()}_GATE`) {
      if (gate === 'entry') this._entryReady = true;
      else                  this._exitReady  = true;
      this.emit('connected', gate);
      return;
    }

    if (line === 'SENSOR:DETECTED') {
      this.emit(`${gate}:detected`);
      return;
    }

    if (line === 'SENSOR:CLEAR') {
      this.emit(`${gate}:clear`);
      return;
    }

    if (line === 'PONG') {
      console.log(`[Serial:${gate}] Arduino ALIVE – PING OK`);

      if (gate === 'entry' && !this._entryReady) {
        this._entryReady = true;
        this.emit('connected', gate);
      } else if (gate === 'exit' && !this._exitReady) {
        this._exitReady = true;
        this.emit('connected', gate);
      }
      return;
    }

  }

  _send(gate, cmd) {
    const port = gate === 'entry' ? this._entryPort : this._exitPort;
    if (!port || !port.isOpen) {
      console.error(`[Serial:${gate}] Port chưa mở – không gửi được lệnh "${cmd}"`);
      return;
    }
    console.log(`[Serial:${gate}] >>> ${cmd}`);
    port.write(cmd + '\n');
  }

  openBarrier(gate)  { this._send(gate, 'OPEN');  }
  closeBarrier(gate) { this._send(gate, 'CLOSE'); }
  ping(gate)         { this._send(gate, 'PING');  }

  get entryReady() { return this._entryReady; }
  get exitReady()  { return this._exitReady;  }
}

module.exports = new SerialHandler();
