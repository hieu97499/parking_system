/**
 * ENTRY GATE CONTROLLER – I2C Slave v2
 * Hardware: Arduino Uno
 *   - HYSRF05 ultrasonic sensor (Trig: D9, Echo: D10)
 *   - Servo motor barrier (Signal: D6)
 *   - I2C SDA = A4, SCL = A5  (cắm vào ESP8266 D2/D1)
 *
 * I2C address: 0x08
 *
 * Giao thức I2C:
 *   READ  – ESP8266 yêu cầu 1 byte trạng thái:
 *     bit0 = sensor đang phát hiện xe
 *     bit1 = barrier đang mở
 *     bit2 = firmware sẵn sàng (luôn = 1)
 *   WRITE – ESP8266 gửi 1 byte lệnh:
 *     0x01 = OPEN barrier
 *     0x02 = CLOSE barrier
 *     0x00 = PING
 */

#include <Wire.h>
#include <Servo.h>

// ─── Pin definitions ───────────────────────────────────────────────────────
const int TRIG_PIN  = 9;
const int ECHO_PIN  = 10;
const int SERVO_PIN = 6;

// ─── Config ────────────────────────────────────────────────────────────────
#define I2C_ADDRESS         0x08
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

// Lệnh từ I2C (được set trong ISR, xử lý trong loop)
volatile uint8_t pendingCmd = 0xFF;  // 0xFF = không có lệnh

// ─── I2C callbacks (chạy trong ISR – chỉ đọc/ghi biến volatile) ────────────
void onRequest() {
  uint8_t status = 0x04;  // bit2 = always ready
  if (vehicleDetected) status |= 0x01;
  if (isBarrierOpen)   status |= 0x02;
  Wire.write(status);
}

void onReceive(int /*numBytes*/) {
  if (Wire.available()) {
    pendingCmd = Wire.read();
  }
  while (Wire.available()) Wire.read();  // flush
}

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

// ─── Ultrasonic measurement ─────────────────────────────────────────────────
float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  // pulseInLong() cho phép interrupt I2C chạy trong khi đo (khác pulseIn)
  long dur = pulseInLong(ECHO_PIN, HIGH, 30000UL);
  if (dur == 0) return 999.0f;
  return (dur * 0.034f) / 2.0f;
}

// ─── Setup ──────────────────────────────────────────────────────────────────
void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  barrierServo.attach(SERVO_PIN);
  closeBarrier();

  Wire.begin(I2C_ADDRESS);
  Wire.onRequest(onRequest);
  Wire.onReceive(onReceive);
}

// ─── Loop ───────────────────────────────────────────────────────────────────
void loop() {
  // 1) Xử lý lệnh từ I2C
  uint8_t cmd = pendingCmd;
  if (cmd != 0xFF) {
    pendingCmd = 0xFF;
    if      (cmd == 0x01) openBarrier();
    else if (cmd == 0x02) closeBarrier();
    // 0x00 = PING – không làm gì
  }

  // 2) Đo khoảng cách
  unsigned long now = millis();
  if (now - lastMeasure >= MEASURE_INTERVAL_MS) {
    lastMeasure = now;
    float dist  = measureDistance();
    bool  curr  = (dist < DETECT_DISTANCE_CM);

    if (curr != vehicleDetected) {
      vehicleDetected = curr;
      if (!curr && isBarrierOpen) {
        pendingClose = true;
        clearAt      = now;
      }
    }
  }

  // 3) Tự động đóng barrier sau khi xe ra
  if (pendingClose && (millis() - clearAt >= AUTO_CLOSE_DELAY_MS)) {
    closeBarrier();
  }

  delay(10);
}
