

#include <Arduino.h>
#include <SoftwareSerial.h>
#include <ESP8266WiFi.h>

// ═══════════════════════════════════════════════════════════════════
//  CẤU HÌNH – chỉnh sửa trước khi nạp firmware
// ═══════════════════════════════════════════════════════════════════
const char* WIFI_SSID      = "Khaidepzai";
const char* WIFI_PASSWORD  = "hieuhieuhoangkhai";
const char* BRIDGE_HOST    = "192.168.1.181";
const int   BRIDGE_PORT    = 4003;

// UART tới Arduino Entry: RX=D5(GPIO14), TX=D6(GPIO12)
SoftwareSerial entrySerial(14, 12);

// UART tới Arduino Exit:  RX=D1(GPIO5),  TX=D2(GPIO4)
SoftwareSerial exitSerial(5, 4);

// ═══════════════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════════════
WiFiClient  tcp;
String      tcpBuf;
String      entryBuf;
String      exitBuf;

uint32_t lastReconnect = 0;
uint32_t lastPing      = 0;

const uint32_t RECONNECT_DELAY_MS = 5000;
const uint32_t PING_INTERVAL_MS   = 30000;

// ─── Gửi về Bridge ────────────────────────────────────────────────
void sendToBridge(const char* msg) {
  if (tcp.connected()) {
    tcp.println(msg);
    Serial.print("[TX->Bridge] "); Serial.println(msg);
  }
}

// ─── Gửi tới Arduino ──────────────────────────────────────────────
void sendToEntry(const char* cmd) {
  entrySerial.println(cmd);
  Serial.print("[TX->Entry] "); Serial.println(cmd);
}

void sendToExit(const char* cmd) {
  exitSerial.println(cmd);
  Serial.print("[TX->Exit] "); Serial.println(cmd);
}

// ─── Xử lý lệnh từ Bridge ─────────────────────────────────────────
void handleBridgeMessage(const String& msg) {
  Serial.print("[RX<-Bridge] "); Serial.println(msg);
  if      (msg == "ENTRY:OPEN")  sendToEntry("OPEN");
  else if (msg == "ENTRY:CLOSE") sendToEntry("CLOSE");
  else if (msg == "EXIT:OPEN")   sendToExit("OPEN");
  else if (msg == "EXIT:CLOSE")  sendToExit("CLOSE");
  else if (msg == "ENTRY:PING")  { sendToEntry("PING"); sendToBridge("ENTRY:PONG"); }
  else if (msg == "EXIT:PING")   { sendToExit("PING");  sendToBridge("EXIT:PONG");  }
}

// ─── Xử lý tin từ Arduino ─────────────────────────────────────────
void handleArduinoMessage(const String& msg, const char* gate) {
  Serial.printf("[RX<-%s] %s\n", gate, msg.c_str());
  char buf[40];
  if      (msg == "SENSOR:DETECTED") { snprintf(buf, sizeof(buf), "%s:SENSOR:DETECTED", gate); sendToBridge(buf); }
  else if (msg == "SENSOR:CLEAR")    { snprintf(buf, sizeof(buf), "%s:SENSOR:CLEAR",    gate); sendToBridge(buf); }
  else if (msg == "READY")           { snprintf(buf, sizeof(buf), "%s:READY",           gate); sendToBridge(buf); }
  else if (msg == "PONG")            { snprintf(buf, sizeof(buf), "%s:PONG",            gate); sendToBridge(buf); }
}

// ─── Đọc UART từ Arduino (non-blocking) ───────────────────────────
void readArduinoSerial(SoftwareSerial& ser, String& buf, const char* gate) {
  while (ser.available()) {
    char c = (char)ser.read();
    if (c == '\r') continue;
    if (c == '\n') {
      buf.trim();
      if (buf.length() > 0) handleArduinoMessage(buf, gate);
      buf = "";
    } else {
      buf += c;
    }
  }
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
    sendToBridge("ENTRY:READY");
    sendToBridge("EXIT:READY");
  } else {
    Serial.println("[TCP] Kết nối thất bại");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Setup
// ═══════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[ESP8266] Gate Bridge khởi động (UART mode)");

  entrySerial.begin(9600);
  exitSerial.begin(9600);
  Serial.println("[UART] Entry: RX=D5(GPIO14) TX=D6(GPIO12)  |  Exit: RX=D1(GPIO5) TX=D2(GPIO4)");

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
      tcpBuf.trim();
      if (tcpBuf.length() > 0) handleBridgeMessage(tcpBuf);
      tcpBuf = "";
    } else if (c != '\r') {
      tcpBuf += c;
    }
  }

  // 4) Đọc UART từ 2 Arduino (listen() để switch giữa 2 SoftwareSerial)
  entrySerial.listen();
  readArduinoSerial(entrySerial, entryBuf, "ENTRY");
  exitSerial.listen();
  readArduinoSerial(exitSerial,  exitBuf,  "EXIT");

  // 5) Ping định kỳ
  if (millis() - lastPing >= PING_INTERVAL_MS) {
    lastPing = millis();
    sendToEntry("PING");
    sendToExit("PING");
  }
}
