

const { execSync } = require('child_process');

function listSerialDevices() {
  try {
    const ps = `
      Get-WmiObject -Class Win32_PnPEntity |
      Where-Object { $_.Name -match 'COM\\d+' } |
      Select-Object Name, DeviceID |
      ConvertTo-Json -Compress
    `;
    const out = execSync(`powershell -NoProfile -Command "${ps}"`, {
      timeout: 5000, encoding: 'utf8',
    }).trim();

    if (!out || out === 'null') return [];
    const raw = JSON.parse(out);
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(d => {
      const comMatch = (d.Name || '').match(/COM(\d+)/);
      const com      = comMatch ? `COM${comMatch[1]}` : null;

      const parts    = (d.DeviceID || '').split('\\');
      const serialNum = parts.length >= 3 ? parts[parts.length - 1] : '';
      return { com, serialNum: serialNum.toUpperCase(), name: d.Name || '' };
    }).filter(d => d.com);
  } catch (e) {
    console.warn('[ComAutoDetect] WMI query failed:', e.message);
    return [];
  }
}

function findComBySerial(serialNumber) {
  if (!serialNumber) return null;
  const devices = listSerialDevices();
  const found = devices.find(d => d.serialNum === serialNumber.toUpperCase());
  return found ? found.com : null;
}

function resolvePort(gate, serialNumber, fallbackPort) {
  if (serialNumber) {
    const found = findComBySerial(serialNumber);
    if (found) {
      if (found !== fallbackPort) {
        console.log(`[ComAutoDetect:${gate}] Serial ${serialNumber} → ${found} (đã đổi từ ${fallbackPort})`);
      } else {
        console.log(`[ComAutoDetect:${gate}] Serial ${serialNumber} → ${found}`);
      }
      return found;
    }
    console.warn(`[ComAutoDetect:${gate}] Không tìm thấy serial ${serialNumber} – dùng fallback ${fallbackPort}`);
  }
  return fallbackPort;
}

module.exports = { listSerialDevices, findComBySerial, resolvePort };
