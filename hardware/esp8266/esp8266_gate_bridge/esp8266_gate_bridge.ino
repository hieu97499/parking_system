/**
 * esp8266_gate_bridge.ino
 *
 * ESP8266 NodeMCU / D1 Mini
 *
 * Vai trò:
 *   - I2C MASTER: giao tiếp với 2 Arduino UNO (entry 0x08, exit 0x09)
 *   - WiFi TCP CLIENT: kết nối đến Bridge server (port 4003)
 *   - Relay 2 chiều:
 *       Arduino sensor → Bridge:  "ENTRY:SENSOR:DETECTED\n", "EXIT:SENSOR:CLEAR\n" …
 *       Bridge → Arduino barrier: "ENTRY:OPEN\n", "EXIT:CLOSE\n" …
 *
 * Sơ đồ I2C:
 *   ESP8266 D2 (GPIO4 SDA) ─── Arduino A4 (SDA)
 *   ESP8266 D1 (GPIO5 SCL) ─── Arduino A5 (SCL)
 *   GND ──────────────────────── GND  (chung mass)
 *
 * Cài board trong Arduino IDE:
 *   URL: http://arduino.esp8266.com/stable/package_esp8266com_index.json
 *   Board: "NodeMCU 1.0 (ESP-12E Module)" hoặc "LOLIN(WEMOS) D1 mini"
 *
 * Thư viện cần:
 *   - ESP8266WiFi (có sẵn khi cài board ESP8266)
 *   - Wire (có sẵn)
 */

#include <Arduino.h>
#include <Wire.h>
#include <ESP8266WiFi.h>

// ═══════════════════════════════════════════════════════════════════
//  CẤU HÌNH – chỉnh sửa trước khi nạp firmware
// ═══════════════════════════════════════════════════════════════════
const char* WIFI_SSID      = "Tép Đến Đây";        // <-- điền tên WiFi
const char* WIFI_PASSWORD  = "0987654321";   // <-- điền mật khẩu WiFi
const char* BRIDGE_HOST    = "172.20.10.5";    // <-- IP máy tính chạy bridge
const int   BRIDGE_PORT    = 4003;

// I2C addresses của 2 Arduino (phải khớp với #define I2C_ADDRESS trong .ino)
const uint8_t ENTRY_I2C_ADDR = 0x08;
const uint8_t EXIT_I2C_ADDR  = 0x09;

// I2C pins (NodeMCU: D2=GPIO4=SDA, D1=GPIO5=SCL)
#define SDA_PIN 4
#define SCL_PIN 5

// ═══════════════════════════════════════════════════════════════════
//  Không cần chỉnh phía dưới
// ═══════════════════════════════════════════════════════════════════

// Lệnh gửi đến Arduino qua I2C
#define CMD_PING  0x00
#define CMD_OPEN  0x01
#define CMD_CLOSE 0x02

// Trạng thái bit trong byte status nhận từ Arduino
#define BIT_SENSOR 0x01
#define BIT_BARRIER 0x02
#define BIT_READY   0x04

WiFiClient  tcp;
String      rxBuf;

// Trạng thái trước đó của mỗi cổng (để phát hiện thay đổi)
uint8_t lastEntryStatus = 0x00;
uint8_t lastExitStatus  = 0x00;

// Thời gian
uint32_t lastPoll        = 0;
uint32_t lastReconnect   = 0;
uint32_t lastPing        = 0;

const uint32_t POLL_INTERVAL_MS    =   50;   // 20 Hz polling I2C
const uint32_t RECONNECT_DELAY_MS  = 5000;
const uint32_t PING_INTERVAL_MS    = 30000;

// ─── Gửi chuỗi về Bridge ──────────────────────────────────────────
void sendToBridge(const char* msg) {
  if (tcp.connected()) {
    tcp.println(msg);
    Serial.print("[TX] "); Serial.println(msg);
  }
}

// ─── Đọc 1 byte status từ Arduino I2C ─────────────────────────────
uint8_t readArduino(uint8_t addr) {
  Wire.requestFrom(addr, (uint8_t)1);
  uint32_t t = millis();
  while (!Wire.available()) {
    if (millis() - t > 20) {
      Serial.printf("[I2C] TIMEOUT read 0x%02X\n", addr);
      return 0xFF;
    }
  }
  return Wire.read();
}

// ─── Ghi 1 byte lệnh đến Arduino I2C ──────────────────────────────
void writeArduino(uint8_t addr, uint8_t cmd) {
  Wire.beginTransmission(addr);
  Wire.write(cmd);
  uint8_t err = Wire.endTransmission();
  if (err != 0) {
    // 1=data too long, 2=NACK addr, 3=NACK data, 4=other, 5=timeout
    Serial.printf("[I2C] ERROR write 0x%02X cmd=0x%02X err=%d\n", addr, cmd, err);
  } else {
    Serial.printf("[I2C] OK write 0x%02X cmd=0x%02X\n", addr, cmd);
  }
}

// ─── Scan I2C bus (dùng lúc startup để debug) ──────────────────────
void i2cScan() {
  Serial.println("[I2C] Scanning bus...");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[I2C] Found device at 0x%02X\n", addr);
      found++;
    }
    delay(1);
  }
  if (found == 0) Serial.println("[I2C] No devices found! Check wiring.");
  else Serial.printf("[I2C] Scan done, %d device(s) found\n", found);
}

// ─── Kết nối WiFi ─────────────────────────────────────────────────
void connectWifi() {
  Serial.print("[WiFi] Đang kết nối ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t > 15000) {
      Serial.println("[WiFi] Timeout – restart");
      ESP.restart();
    }
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("[WiFi] IP: "); Serial.println(WiFi.localIP());
}

// ─── Kết nối TCP đến Bridge ────────────────────────────────────────
void connectBridge() {
  Serial.print("[TCP] Kết nối đến "); Serial.print(BRIDGE_HOST);
  Serial.print(":"); Serial.println(BRIDGE_PORT);
  if (tcp.connect(BRIDGE_HOST, BRIDGE_PORT)) {
    Serial.println("[TCP] Kết nối thành công");
    // Gửi READY cho cả 2 cổng
    sendToBridge("ENTRY:READY");
    sendToBridge("EXIT:READY");
    // Reset trạng thái để re-detect
    lastEntryStatus = 0x00;
    lastExitStatus  = 0x00;
  } else {
    Serial.println("[TCP] Kết nối thất bại");
  }
}

// ─── Xử lý lệnh nhận từ Bridge ────────────────────────────────────
void handleBridgeMessage(const String& msg) {
  Serial.print("[RX] "); Serial.println(msg);
  if      (msg == "ENTRY:OPEN")  writeArduino(ENTRY_I2C_ADDR, CMD_OPEN);
  else if (msg == "ENTRY:CLOSE") writeArduino(ENTRY_I2C_ADDR, CMD_CLOSE);
  else if (msg == "EXIT:OPEN")   writeArduino(EXIT_I2C_ADDR,  CMD_OPEN);
  else if (msg == "EXIT:CLOSE")  writeArduino(EXIT_I2C_ADDR,  CMD_CLOSE);
  else if (msg == "ENTRY:PING")  { writeArduino(ENTRY_I2C_ADDR, CMD_PING); sendToBridge("ENTRY:PONG"); }
  else if (msg == "EXIT:PING")   { writeArduino(EXIT_I2C_ADDR,  CMD_PING); sendToBridge("EXIT:PONG");  }
}

// ─── Kiểm tra thay đổi trạng thái một cổng và báo về Bridge ───────
void checkGate(const char* gate, uint8_t addr, uint8_t& lastStatus) {
  uint8_t st = readArduino(addr);
  if (st == 0xFF) return;  // Arduino không phản hồi

  bool prevDetected = (lastStatus & BIT_SENSOR)  != 0;
  bool currDetected = (st          & BIT_SENSOR)  != 0;

  if (currDetected != prevDetected) {
    char buf[32];
    snprintf(buf, sizeof(buf), "%s:SENSOR:%s",
             gate, currDetected ? "DETECTED" : "CLEAR");
    sendToBridge(buf);
  }
  lastStatus = st;
}

// ═══════════════════════════════════════════════════════════════════
//  Setup
// ═══════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[ESP8266] Gate Bridge khởi động");

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);  // 100kHz I2C (safe cho UNO qua cable dài)
  delay(200);
  i2cScan();  // In ra danh sách thiết bị I2C tìm thấy

  connectWifi();
  connectBridge();
}

// ═══════════════════════════════════════════════════════════════════
//  Loop
// ═══════════════════════════════════════════════════════════════════
void loop() {
  // 1) Kiểm tra WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Mất kết nối – reconnect...");
    connectWifi();
    return;
  }

  // 2) Kiểm tra TCP – reconnect nếu mất
  if (!tcp.connected()) {
    if (millis() - lastReconnect >= RECONNECT_DELAY_MS) {
      lastReconnect = millis();
      connectBridge();
    }
    return;
  }

  // 3) Đọc lệnh từ Bridge (non-blocking)
  while (tcp.available()) {
    char c = (char)tcp.read();
    if (c == '\n') {
      rxBuf.trim();
      if (rxBuf.length() > 0) handleBridgeMessage(rxBuf);
      rxBuf = "";
    } else if (c != '\r') {
      rxBuf += c;
    }
  }

  // 4) Poll trạng thái Arduino theo chu kỳ
  if (millis() - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = millis();
    checkGate("ENTRY", ENTRY_I2C_ADDR, lastEntryStatus);
    checkGate("EXIT",  EXIT_I2C_ADDR,  lastExitStatus);
  }

  // 5) Periodic ping
  if (millis() - lastPing >= PING_INTERVAL_MS) {
    lastPing = millis();
    sendToBridge("ENTRY:PING");
    sendToBridge("EXIT:PING");
  }
}
