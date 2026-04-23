
#include <Wire.h>
#include <Servo.h>

// ─── Pin definitions ────────────────────────────────────────────────────────
const int TRIG_PIN  = 9;
const int ECHO_PIN  = 10;
const int SERVO_PIN = 6;

// ─── Config ─────────────────────────────────────────────────────────────────
#define I2C_ADDRESS         0x09
const int  BARRIER_OPEN_DEG    = 90;
const int  BARRIER_CLOSE_DEG   = 0;
const int  DETECT_DISTANCE_CM  = 80;
const long MEASURE_INTERVAL_MS = 200;
const long AUTO_CLOSE_DELAY_MS = 2000;
const long MAX_OPEN_MS         = 6000;
const int  DEBOUNCE_COUNT      = 3;

// ─── State ──────────────────────────────────────────────────────────────────
Servo barrierServo;
bool      isBarrierOpen    = false;
bool      vehicleDetected  = false;
unsigned long lastMeasure  = 0;
unsigned long clearAt      = 0;
unsigned long openedAt     = 0;
bool      pendingClose     = false;
int       debounceCount    = 0;

// Lệnh từ I2C (set trong ISR, xử lý trong loop)
volatile uint8_t pendingCmd = 0xFF;

// ─── I2C callbacks (ISR – chỉ đọc/ghi biến volatile) ────────────────────────
void onRequest() {
  uint8_t status = 0x04;  // bit2 = always ready
  if (vehicleDetected) status |= 0x01;
  if (isBarrierOpen)   status |= 0x02;
  Wire.write(status);
}

void onReceive(int /*numBytes*/) {
  if (Wire.available()) pendingCmd = Wire.read();
  while (Wire.available()) Wire.read();
}

// ─── Functions ───────────────────────────────────────────────────────────────
float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  // pulseInLong() cho phép interrupt I2C chạy trong khi đo
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

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  barrierServo.attach(SERVO_PIN);
  closeBarrier();

  Wire.begin(I2C_ADDRESS);
  Wire.onRequest(onRequest);
  Wire.onReceive(onReceive);
}

void loop() {
  // 1) Xử lý lệnh từ I2C
  uint8_t cmd = pendingCmd;
  if (cmd != 0xFF) {
    pendingCmd = 0xFF;
    if      (cmd == 0x01) openBarrier();
    else if (cmd == 0x02) closeBarrier();
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
      if (debounceCount < DEBOUNCE_COUNT) goto autoClose;
      debounceCount   = 0;
      vehicleDetected = raw;
      if (!raw && isBarrierOpen) {
        pendingClose = true;
        clearAt      = now;
      }
    }
  }

  autoClose:
  // 3) Tự động đóng sau khi xe qua
  if (pendingClose && (millis() - clearAt >= AUTO_CLOSE_DELAY_MS)) {
    closeBarrier();
    return;
  }

  // 4) Đóng cứng sau MAX_OPEN_MS
  if (isBarrierOpen && (millis() - openedAt >= MAX_OPEN_MS)) {
    closeBarrier();
  }

  delay(10);
}
