// ─────────────────────────────────────────────────────────────────────────────
//  EXIT GATE - Arduino Uno (khong co man hinh)
//  Chuc nang: cam bien sieu am + servo barrier + UART toi ESP8266
// ─────────────────────────────────────────────────────────────────────────────
#define SS_MAX_RX_BUFF 160

#include <SoftwareSerial.h>
#include <Servo.h>

// UART voi ESP8266
// RX=2 <- ESP TX(D2/GPIO4) | TX=3 -> ESP RX(D1/GPIO5)
SoftwareSerial espSerial(2, 3);

// Pins
const int TRIG_PIN  = 9;
const int ECHO_PIN  = 10;
const int SERVO_PIN = 6;

// Config
const int  BARRIER_OPEN_DEG    = 90;
const int  BARRIER_CLOSE_DEG   = 0;
const int  DETECT_DISTANCE_CM  = 80;
const long MEASURE_INTERVAL_MS = 200;
const long AUTO_CLOSE_DELAY_MS = 2000;
const long MAX_OPEN_MS         = 6000;
const int  DEBOUNCE_COUNT      = 3;

// State
Servo         barrierServo;
bool          isBarrierOpen   = false;
bool          vehicleDetected = false;
unsigned long lastMeasure     = 0;
unsigned long clearAt         = 0;
unsigned long openedAt        = 0;
bool          pendingClose    = false;
int           debounceCount   = 0;
unsigned long lastDistLog     = 0;
String        rxBuf           = "";

// Barrier
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

// Ultrasonic
float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseInLong(ECHO_PIN, HIGH, 30000UL);
  return dur ? (dur * 0.034f) / 2.0f : 999.0f;
}

// Handle command tu ESP8266
void handleCommand(const String& cmd) {
  if      (cmd == "OPEN")  { openBarrier();  espSerial.println("OK:OPEN"); }
  else if (cmd == "CLOSE") { closeBarrier(); espSerial.println("OK:CLOSE"); }
  else if (cmd == "PING")  { espSerial.println("PONG"); }
}

// Setup
void setup() {
  Serial.begin(115200);
  espSerial.begin(9600);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  barrierServo.attach(SERVO_PIN);
  closeBarrier();

  delay(500);
  espSerial.println("READY");
  Serial.println("[Exit] READY - TRIG=9 ECHO=10 SERVO=6");
}

// Loop
void loop() {
  unsigned long now = millis();

  // 1) Doc lenh tu ESP8266
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
      if (rxBuf.length() < 150) rxBuf += c;
    }
  }

  // 2) Do cam bien sieu am voi debounce
  if (now - lastMeasure >= MEASURE_INTERVAL_MS) {
    lastMeasure = now;
    float dist = measureDistance();
    bool  raw  = (dist < DETECT_DISTANCE_CM);

    if (now - lastDistLog >= 2000) {
      lastDistLog = now;
      Serial.print("[Sensor] dist="); Serial.print(dist);
      Serial.print("cm | "); Serial.println(raw ? "YES" : "NO");
    }

    if (raw == vehicleDetected) {
      debounceCount = 0;
    } else {
      if (++debounceCount >= DEBOUNCE_COUNT) {
        debounceCount   = 0;
        vehicleDetected = raw;
        if (raw) {
          espSerial.println("SENSOR:DETECTED");
          Serial.println("[Sensor] DETECTED");
        } else {
          espSerial.println("SENSOR:CLEAR");
          Serial.println("[Sensor] CLEAR");
          if (isBarrierOpen) { pendingClose = true; clearAt = now; }
        }
      }
    }
  }

  // 3) Tu dong dong barrier sau khi xe qua
  if (pendingClose && (now - clearAt >= AUTO_CLOSE_DELAY_MS)) {
    closeBarrier();
    pendingClose = false;
    return;
  }

  // 4) Dong cung sau MAX_OPEN_MS
  if (isBarrierOpen && (now - openedAt >= MAX_OPEN_MS)) {
    closeBarrier();
  }

  delay(10);
}