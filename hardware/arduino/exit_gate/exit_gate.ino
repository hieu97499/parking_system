
#include <SoftwareSerial.h>
#include <Servo.h>

// UART với ESP8266: RX=pin2 ← ESP TX(D2/GPIO4)
//                  TX=pin3 → ESP RX(D1/GPIO5)
SoftwareSerial espSerial(2, 3);

// ─── Pin definitions ────────────────────────────────────────────────────────
const int TRIG_PIN  = 9;
const int ECHO_PIN  = 10;
const int SERVO_PIN = 6;

// ─── Config ─────────────────────────────────────────────────────────────────
const int  BARRIER_OPEN_DEG    = 90;
const int  BARRIER_CLOSE_DEG   = 0;
const int  DETECT_DISTANCE_CM  = 80;
const long MEASURE_INTERVAL_MS = 200;
const long AUTO_CLOSE_DELAY_MS = 2000;
const long MAX_OPEN_MS         = 6000;
const int  DEBOUNCE_COUNT      = 3;

// ─── State ──────────────────────────────────────────────────────────────────
Servo barrierServo;
bool      isBarrierOpen   = false;
bool      vehicleDetected = false;
unsigned long lastMeasure = 0;
unsigned long clearAt     = 0;
unsigned long openedAt    = 0;
bool      pendingClose    = false;
int       debounceCount   = 0;
String    rxBuf           = "";

// ─── Functions ───────────────────────────────────────────────────────────────
float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  // pulseInLong cho phép interrupt SoftwareSerial chạy trong khi đo
  long duration = pulseInLong(ECHO_PIN, HIGH, 30000UL);
  if (duration == 0) return 999.0f;
  return (duration * 0.034f) / 2.0f;
}

void openBarrier() {
  barrierServo.write(BARRIER_OPEN_DEG);
  isBarrierOpen = true;
  pendingClose  = false;
  openedAt      = millis();
}

void closeBarrier() {
  barrierServo.write(BARRIER_CLOSE_DEG);
  isBarrierOpen = false;
  pendingClose  = false;
}

// ─── Handle command from ESP ─────────────────────────────────────────────────
void handleCommand(const String& cmd) {
  if      (cmd == "OPEN")  { openBarrier();  espSerial.println("OK:OPEN"); }
  else if (cmd == "CLOSE") { closeBarrier(); espSerial.println("OK:CLOSE"); }
  else if (cmd == "PING")  { espSerial.println("PONG"); }
}

void setup() {
  Serial.begin(115200);
  espSerial.begin(9600);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  barrierServo.attach(SERVO_PIN);
  closeBarrier();

  delay(500);
  espSerial.println("READY");
  Serial.println("[Exit] UART mode ready");
}

void loop() {
  // 1) Đọc lệnh từ ESP
  while (espSerial.available()) {
    char c = (char)espSerial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      rxBuf.trim();
      if (rxBuf.length() > 0) {
        Serial.print("[RX] "); Serial.println(rxBuf);
        handleCommand(rxBuf);
      }
      rxBuf = "";
    } else {
      rxBuf += c;
    }
  }

  // 2) Đo khoảng cách với debounce
  unsigned long now = millis();
  if (now - lastMeasure >= MEASURE_INTERVAL_MS) {
    lastMeasure = now;
    float dist = measureDistance();
    bool  raw  = (dist < DETECT_DISTANCE_CM);

    if (raw == vehicleDetected) {
      debounceCount = 0;
    } else {
      debounceCount++;
      if (debounceCount >= DEBOUNCE_COUNT) {
        debounceCount   = 0;
        vehicleDetected = raw;
        if (raw) {
          espSerial.println("SENSOR:DETECTED");
          Serial.println("[Sensor] DETECTED");
        } else {
          espSerial.println("SENSOR:CLEAR");
          Serial.println("[Sensor] CLEAR");
          if (isBarrierOpen) {
            pendingClose = true;
            clearAt = now;
          }
        }
      }
    }
  }

  // 3) Tự động đóng sau khi xe qua
  if (pendingClose && (millis() - clearAt >= AUTO_CLOSE_DELAY_MS)) {
    closeBarrier();
    pendingClose = false;
    return;
  }

  // 4) Đóng cứng sau MAX_OPEN_MS
  if (isBarrierOpen && (millis() - openedAt >= MAX_OPEN_MS)) {
    closeBarrier();
  }

  delay(10);
}
