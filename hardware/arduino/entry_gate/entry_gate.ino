
#include <SoftwareSerial.h>
#include <Servo.h>

// UART với ESP8266: RX=pin2 ← ESP TX(D6/GPIO12)
//                  TX=pin3 → ESP RX(D5/GPIO14)
SoftwareSerial espSerial(2, 3);

// ─── Pin definitions ───────────────────────────────────────────────────────
const int TRIG_PIN  = 9;
const int ECHO_PIN  = 10;
const int SERVO_PIN = 6;

// ─── Config ────────────────────────────────────────────────────────────────
const int  BARRIER_OPEN_DEG    = 90;
const int  BARRIER_CLOSE_DEG   = 0;
const int  DETECT_DISTANCE_CM  = 80;
const long MEASURE_INTERVAL_MS = 200;
const long AUTO_CLOSE_DELAY_MS = 2000;

// ─── State ─────────────────────────────────────────────────────────────────
Servo barrierServo;
bool  isBarrierOpen   = false;
bool  vehicleDetected = false;
unsigned long lastMeasure = 0;
unsigned long clearAt     = 0;
bool  pendingClose    = false;
String rxBuf          = "";

// ─── Barrier control ────────────────────────────────────────────────────────
void openBarrier() {
  barrierServo.write(BARRIER_OPEN_DEG);
  isBarrierOpen = true;
  pendingClose  = false;
}

void closeBarrier() {
  barrierServo.write(BARRIER_CLOSE_DEG);
  isBarrierOpen = false;
  pendingClose  = false;
}

// ─── Ultrasonic ─────────────────────────────────────────────────────────────
float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  // pulseInLong cho phép interrupt SoftwareSerial chạy trong khi đo
  long dur = pulseInLong(ECHO_PIN, HIGH, 30000UL);
  if (dur == 0) return 999.0f;
  return (dur * 0.034f) / 2.0f;
}

// ─── Handle command from ESP ─────────────────────────────────────────────────
void handleCommand(const String& cmd) {
  if      (cmd == "OPEN")  { openBarrier();  espSerial.println("OK:OPEN"); }
  else if (cmd == "CLOSE") { closeBarrier(); espSerial.println("OK:CLOSE"); }
  else if (cmd == "PING")  { espSerial.println("PONG"); }
}

// ─── Setup ──────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  espSerial.begin(9600);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  barrierServo.attach(SERVO_PIN);
  closeBarrier();

  delay(500);
  espSerial.println("READY");
  Serial.println("[Entry] UART mode ready");
}

// ─── Loop ───────────────────────────────────────────────────────────────────
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

  // 2) Đo khoảng cách
  unsigned long now = millis();
  if (now - lastMeasure >= MEASURE_INTERVAL_MS) {
    lastMeasure = now;
    float dist  = measureDistance();
    bool  curr  = (dist < DETECT_DISTANCE_CM);

    if (curr != vehicleDetected) {
      vehicleDetected = curr;
      if (curr) {
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

  // 3) Tự động đóng barrier sau khi xe ra
  if (pendingClose && (millis() - clearAt >= AUTO_CLOSE_DELAY_MS)) {
    closeBarrier();
    pendingClose = false;
  }

  delay(10);
}
