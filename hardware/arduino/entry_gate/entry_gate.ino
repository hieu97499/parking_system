// ─────────────────────────────────────────────────────────────────────────────
//  ENTRY GATE – Arduino Uno
//  Man TFT 2.4" ILI9341 PORTRAIT 240x320 (rotation=0)
//  Hien thi: dong ho HH:MM:SS + so cho trong trong bai
//  Pin TFT: CS=8, DC=7, RST=A0, MOSI=11, SCK=13
// ─────────────────────────────────────────────────────────────────────────────

#include <SoftwareSerial.h>
#include <Servo.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

// UART voi ESP8266
SoftwareSerial espSerial(2, 3);

// TFT
#define TFT_CS   8
#define TFT_DC   7
#define TFT_RST  A0
Adafruit_ILI9341 tft = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);

// PORTRAIT 240x320
#define SCR_W 240
#define SCR_H 320

// Mau
#define C_BG     ILI9341_BLACK
#define C_NUMBER ILI9341_YELLOW
#define C_NOSLOT ILI9341_RED
#define C_TIME   ILI9341_CYAN
#define C_WHITE  ILI9341_WHITE
#define C_DIM    0x4208u

// Layout (portrait 240x320):
//   Clock area: y=0   -> y=150  (150px - dong ho lon)
//   Slots area: y=150 -> y=320  (170px - so cho trong)

// Pins
const int TRIG_PIN  = 5;
const int ECHO_PIN  = 4;
const int SERVO_PIN = 6;

// Config
const int  BARRIER_OPEN_DEG    = 90;
const int  BARRIER_CLOSE_DEG   = 0;
const int  DETECT_DISTANCE_CM  = 80;
const long MEASURE_INTERVAL_MS = 200;
const long AUTO_CLOSE_DELAY_MS = 2000;

// State
Servo         barrierServo;
bool          isBarrierOpen   = false;
bool          vehicleDetected = false;
unsigned long lastMeasure     = 0;
unsigned long clearAt         = 0;
bool          pendingClose    = false;
String        rxBuf           = "";
String        usbBuf          = "";

int           availableSlots  = -1;
int           lastDrawnSlots  = -2;
bool          clockSynced     = false;
unsigned long clockBaseSec    = 0;
unsigned long clockBaseMs     = 0;
char          lastTimeBuf[9]  = "";

// Helper - ve text can giua theo chieu ngang
void drawCentered(const char* txt, int16_t y, uint8_t sz,
                  uint16_t color, uint16_t bg) {
  tft.setTextSize(sz);
  tft.setTextColor(color, bg);
  int16_t tw = (int16_t)strlen(txt) * 6 * sz;
  tft.setCursor((SCR_W - tw) / 2, y);
  tft.print(txt);
}

// Ve dong ho (y=0..150)
void drawClock() {
  char timeBuf[9];
  if (!clockSynced) {
    strcpy(timeBuf, "--:--:--");
  } else {
    unsigned long elapsed = (millis() - clockBaseMs) / 1000UL;
    unsigned long t       = clockBaseSec + elapsed;
    snprintf(timeBuf, sizeof(timeBuf), "%02lu:%02lu:%02lu",
             (t / 3600) % 24, (t / 60) % 60, t % 60);
  }
  if (strcmp(timeBuf, lastTimeBuf) == 0) return;
  strcpy(lastTimeBuf, timeBuf);

  // Clock area NHO: y=0..70
  // "GIO HIEN TAI" size 1 (8px) o y=8
  // Time size 3 (24px tall, 144px wide) o y=28
  tft.fillRect(0, 0, SCR_W, 70, C_BG);
  drawCentered("GIO HIEN TAI", 8, 1, C_DIM, C_BG);
  drawCentered(timeBuf, 28, 3, C_TIME, C_BG);
}

// Ve so cho trong (y=70..320) - VUNG LON
void drawSlots() {
  if (availableSlots == lastDrawnSlots) return;
  lastDrawnSlots = availableSlots;

  tft.fillRect(0, 70, SCR_W, 250, C_BG);
  // Duong ke phan cach
  tft.drawFastHLine(20, 72, SCR_W - 40, C_DIM);

  // Label "CHO TRONG" size 2 o y=85
  drawCentered("CHO TRONG", 85, 2, C_DIM, C_BG);

  // Vung so: y=115..315 (200px tall)
  if (availableSlots < 0) {
    drawCentered("---", 175, 9, C_DIM, C_BG);
  } else if (availableSlots == 0) {
    drawCentered("HET", 145, 9, C_NOSLOT, C_BG);
    drawCentered("CHO", 245, 6, C_NOSLOT, C_BG);
  } else {
    char buf[5];
    snprintf(buf, sizeof(buf), "%d", availableSlots);
    int len = strlen(buf);
    // 1 chu so -> size 20 (160px tall); 2 -> size 14 (112px); 3 -> size 9 (72px)
    uint8_t sz = (len == 1) ? 20 : (len == 2) ? 14 : 9;
    int16_t th = 8 * sz;
    int16_t tw = 6 * sz * len;
    int16_t y  = 115 + (200 - th) / 2;
    tft.setTextSize(sz);
    tft.setTextColor(C_NUMBER, C_BG);
    tft.setCursor((SCR_W - tw) / 2, y);
    tft.print(buf);
  }
}

// Barrier
void openBarrier()  { barrierServo.write(BARRIER_OPEN_DEG);  isBarrierOpen = true;  pendingClose = false; }
void closeBarrier() { barrierServo.write(BARRIER_CLOSE_DEG); isBarrierOpen = false; pendingClose = false; }

// Ultrasonic
float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseInLong(ECHO_PIN, HIGH, 30000UL);
  return dur ? (dur * 0.034f) / 2.0f : 999.0f;
}

// Handle command
void handleCommand(const String& cmd) {
  if      (cmd == "OPEN")  { openBarrier();  espSerial.println("OK:OPEN"); }
  else if (cmd == "CLOSE") { closeBarrier(); espSerial.println("OK:CLOSE"); }
  else if (cmd == "PING")  { espSerial.println("PONG"); }
  else if (cmd.startsWith("SLOTS:")) {
    int s = cmd.substring(6).toInt();
    if (s != availableSlots) { availableSlots = s; drawSlots(); }
  }
  else if (cmd.startsWith("TIME:") && cmd.length() >= 13) {
    unsigned long hh = cmd.substring(5, 7).toInt();
    unsigned long mm = cmd.substring(8, 10).toInt();
    unsigned long ss = cmd.substring(11, 13).toInt();
    clockBaseSec = hh * 3600UL + mm * 60UL + ss;
    clockBaseMs  = millis();
    clockSynced  = true;
  }
}

// Setup
void setup() {
  Serial.begin(115200);
  espSerial.begin(9600);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  barrierServo.attach(SERVO_PIN);
  closeBarrier();

  pinMode(TFT_RST, OUTPUT);
  digitalWrite(TFT_RST, HIGH); delay(10);
  digitalWrite(TFT_RST, LOW);  delay(20);
  digitalWrite(TFT_RST, HIGH); delay(150);

  tft.begin();
  tft.setRotation(0);   // PORTRAIT 240x320 - neu nguoc thi doi thanh 2
  tft.fillScreen(C_BG);

  drawClock();
  drawSlots();

  delay(500);
  espSerial.println("READY");
  Serial.println("[Entry] TFT PORTRAIT 240x320 ready");
}

// Loop
void loop() {
  // 1) ESP UART
  while (espSerial.available()) {
    char c = (char)espSerial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      rxBuf.trim();
      if (rxBuf.length() > 0) { Serial.print("[RX] "); Serial.println(rxBuf); handleCommand(rxBuf); }
      rxBuf = "";
    } else { if (rxBuf.length() < 100) rxBuf += c; }
  }

  // 2) USB Serial (debug)
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      usbBuf.trim();
      if (usbBuf.length() > 0) handleCommand(usbBuf);
      usbBuf = "";
    } else { if (usbBuf.length() < 100) usbBuf += c; }
  }

  // 3) Cap nhat dong ho moi giay
  drawClock();

  // 4) Cam bien
  unsigned long now = millis();
  if (now - lastMeasure >= MEASURE_INTERVAL_MS) {
    lastMeasure = now;
    bool curr = (measureDistance() < DETECT_DISTANCE_CM);
    if (curr != vehicleDetected) {
      vehicleDetected = curr;
      if (curr) { espSerial.println("SENSOR:DETECTED"); Serial.println("[Sensor] DETECTED"); }
      else {
        espSerial.println("SENSOR:CLEAR"); Serial.println("[Sensor] CLEAR");
        if (isBarrierOpen) { pendingClose = true; clearAt = now; }
      }
    }
  }

  // 5) Tu dong dong barrier
  if (pendingClose && (millis() - clearAt >= AUTO_CLOSE_DELAY_MS)) {
    closeBarrier();
    pendingClose = false;
  }

  delay(10);
}