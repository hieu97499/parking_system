

const net          = require('net');
const EventEmitter = require('events');
const cfg          = require('./config');

class Esp8266Handler extends EventEmitter {
  constructor() {
    super();
    this._server     = null;
    this._client     = null;
    this._rxBuf      = '';
    this._entryReady = false;
    this._exitReady  = false;
  }

  connect() {
    this._server = net.createServer(socket => {
      console.log(`[ESP8266] ESP8266 kết nối từ ${socket.remoteAddress}`);

      if (this._client && !this._client.destroyed) {
        console.warn('[ESP8266] Đã có kết nối – đóng kết nối cũ');
        this._client.destroy();
      }
      this._client = socket;
      this._rxBuf  = '';

      socket.setEncoding('utf8');
      socket.setKeepAlive(true, 10000);

      socket.on('data', data => {
        this._rxBuf += data;
        let idx;
        while ((idx = this._rxBuf.indexOf('\n')) !== -1) {
          const line = this._rxBuf.slice(0, idx).replace(/\r$/, '').trim();
          this._rxBuf = this._rxBuf.slice(idx + 1);
          if (line) this._handleLine(line);
        }
      });

      socket.on('close', () => {
        console.warn('[ESP8266] Mất kết nối');
        this._client     = null;
        this._entryReady = false;
        this._exitReady  = false;
        this.emit('disconnected', 'entry');
        this.emit('disconnected', 'exit');
      });

      socket.on('error', err => {
        console.error('[ESP8266] Socket error:', err.message);
      });
    });

    this._server.on('error', err => {
      console.error(`[ESP8266] Server error: ${err.message}`);
    });

    this._server.listen(cfg.ESP8266_TCP_PORT, '0.0.0.0', () => {
      console.log(`[ESP8266] TCP server lắng nghe port ${cfg.ESP8266_TCP_PORT} – chờ ESP8266 kết nối...`);
    });
  }

  _handleLine(line) {
    console.log(`[ESP8266] <<< ${line}`);

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;

    const gatePart = line.slice(0, colonIdx).toLowerCase();
    const msgPart  = line.slice(colonIdx + 1);

    if (gatePart !== 'entry' && gatePart !== 'exit') return;

    if (msgPart === 'READY') {
      if (gatePart === 'entry') this._entryReady = true;
      else                      this._exitReady  = true;
      this.emit('connected', gatePart);
      return;
    }

    if (msgPart === 'SENSOR:DETECTED') {
      this.emit(`${gatePart}:detected`);
      return;
    }

    if (msgPart === 'SENSOR:CLEAR') {
      this.emit(`${gatePart}:clear`);
      return;
    }

    if (msgPart === 'PONG') {
      console.log(`[ESP8266] ${gatePart} Arduino ALIVE`);
      if (gatePart === 'entry' && !this._entryReady) {
        this._entryReady = true;
        this.emit('connected', 'entry');
      } else if (gatePart === 'exit' && !this._exitReady) {
        this._exitReady = true;
        this.emit('connected', 'exit');
      }
      return;
    }
  }

  _send(msg) {
    if (this._client && !this._client.destroyed) {
      console.log(`[ESP8266] >>> ${msg}`);
      this._client.write(msg + '\n');
    } else {
      console.warn(`[ESP8266] Chưa có ESP8266 kết nối – không gửi được: "${msg}"`);
    }
  }

  openBarrier(gate)  { this._send(`${gate.toUpperCase()}:OPEN`);  }
  closeBarrier(gate) { this._send(`${gate.toUpperCase()}:CLOSE`); }
  ping(gate)         { this._send(`${gate.toUpperCase()}:PING`);  }

  get entryReady() { return this._entryReady; }
  get exitReady()  { return this._exitReady;  }
}

module.exports = new Esp8266Handler();
