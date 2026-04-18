$ROOT   = "c:\DoAn"
$VENVPY = "C:\Users\mynam\AppData\Local\Programs\Python\Python311\venv_paddle\Scripts\python.exe"
$LOGS   = "$ROOT\logs"
New-Item -ItemType Directory -Path $LOGS -Force | Out-Null

function Wait-Port {
    param($Port, $Label, $TimeoutSec = 35)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $t = New-Object System.Net.Sockets.TcpClient
            $t.Connect("localhost",$Port)
            $t.Close()
            Write-Host "  [OK] $Label (port $Port)" -ForegroundColor Green
            return $true
        } catch {}
        Start-Sleep -Milliseconds 600
    }
    Write-Host "  [TIMEOUT] $Label (port $Port)" -ForegroundColor Red
    return $false
}

Write-Host "=== Dung tien trinh cu ===" -ForegroundColor DarkCyan
Get-NetTCPConnection -LocalPort 4000,4002,5001,3000,5174,5175 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# ── Backend ────────────────────────────────────────────────────────────────
Write-Host "=== Backend (port 4000) ===" -ForegroundColor Cyan
Start-Process "cmd.exe" -ArgumentList "/c node src/index.js > $LOGS\backend.log 2>&1" -WorkingDirectory "$ROOT\BuildWeb\backend" -WindowStyle Minimized
Wait-Port -Port 4000 -Label "Backend" | Out-Null

# ── AI Service ─────────────────────────────────────────────────────────────
Write-Host "=== AI Service (port 5001) ===" -ForegroundColor Cyan
Start-Process "cmd.exe" -ArgumentList "/c $VENVPY -m uvicorn main:app --host 0.0.0.0 --port 5001 > $LOGS\ai_service.log 2>&1" -WorkingDirectory "$ROOT\hardware\ai_service" -WindowStyle Minimized
Wait-Port -Port 5001 -Label "AI Service" -TimeoutSec 60 | Out-Null

# ── Bridge ─────────────────────────────────────────────────────────────────
Write-Host "=== Bridge (port 4002) ===" -ForegroundColor Cyan
Start-Process "cmd.exe" -ArgumentList "/c node index.js > $LOGS\bridge.log 2>&1" -WorkingDirectory "$ROOT\hardware\bridge" -WindowStyle Minimized
Wait-Port -Port 4002 -Label "Bridge WS" | Out-Null

# ── Admin Web (port 3000) ──────────────────────────────────────────────────
Write-Host "=== Admin Web (port 3000) ===" -ForegroundColor Cyan
Start-Process "cmd.exe" -ArgumentList "/c npm run dev > $LOGS\admin_web.log 2>&1" -WorkingDirectory "$ROOT\BuildWeb\admin-web" -WindowStyle Minimized
Wait-Port -Port 3000 -Label "Admin Web" -TimeoutSec 30 | Out-Null

# ── WebThietBi (port 5174) ─────────────────────────────────────────────────
Write-Host "=== WebThietBi (port 5174) ===" -ForegroundColor Cyan
Start-Process "cmd.exe" -ArgumentList "/c npm run dev > $LOGS\web_thietbi.log 2>&1" -WorkingDirectory "$ROOT\WebThietBi" -WindowStyle Minimized
Wait-Port -Port 5174 -Label "WebThietBi" -TimeoutSec 30 | Out-Null

# ── WebApp (port 5175) ────────────────────────────────────────────────────
Write-Host "=== WebApp (port 5175) ===" -ForegroundColor Cyan
Start-Process "cmd.exe" -ArgumentList "/c npm run dev > $LOGS\webapp.log 2>&1" -WorkingDirectory "$ROOT\WebApp" -WindowStyle Minimized
Wait-Port -Port 5175 -Label "WebApp" -TimeoutSec 30 | Out-Null

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ParkingOS da khoi dong xong!" -ForegroundColor White
Write-Host "  Backend     : http://localhost:4000"
Write-Host "  AI Service  : http://localhost:5001"
Write-Host "  Bridge WS   : ws://localhost:4002"
Write-Host "  Admin Web   : http://localhost:3000"
Write-Host "  WebThietBi  : http://localhost:5174"
Write-Host "  WebApp      : http://localhost:5175"
Write-Host "  Logs        : $LOGS"
Write-Host "============================================" -ForegroundColor Green
