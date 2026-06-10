<#
.SYNOPSIS
    Levanta backend, frontend y (opcionalmente) el agente en ventanas separadas.

.DESCRIPTION
    - Crea el venv del backend e instala dependencias si falta.
    - Aplica migraciones Alembic y arranca uvicorn.
    - Instala dependencias del frontend si falta node_modules y arranca Vite.
    - Con -WithAgent, también arranca el agente local.

.EXAMPLE
    ./run-local.ps1
    ./run-local.ps1 -WithAgent
#>
param(
    [switch]$WithAgent
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$agent = Join-Path $root "agent"

function Find-Python {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "No se encontró Python. Instálalo desde https://www.python.org/downloads/"
}

Write-Host "==> Preparando backend..." -ForegroundColor Cyan
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    $py = Find-Python
    Write-Host "    Creando entorno virtual con $py"
    & $py -m venv (Join-Path $backend ".venv")
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -r (Join-Path $backend "requirements.txt")
}
if (-not (Test-Path (Join-Path $backend ".env"))) {
    Copy-Item (Join-Path $backend ".env.example") (Join-Path $backend ".env")
    Write-Host "    .env creado desde .env.example"
}

Write-Host "==> Aplicando migraciones (alembic upgrade head)..." -ForegroundColor Cyan
Push-Location $backend
& $venvPy -m alembic upgrade head
Pop-Location

Write-Host "==> Lanzando backend en http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$backend'; & '.venv\Scripts\python.exe' -m uvicorn app.main:app --reload"
)

Write-Host "==> Preparando frontend..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Push-Location $frontend
    npm install
    Pop-Location
}
if (-not (Test-Path (Join-Path $frontend ".env"))) {
    Copy-Item (Join-Path $frontend ".env.example") (Join-Path $frontend ".env")
}
Write-Host "==> Lanzando frontend en http://127.0.0.1:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$frontend'; npm run dev"
)

if ($WithAgent) {
    Write-Host "==> Lanzando agente..." -ForegroundColor Green
    if (-not (Test-Path (Join-Path $agent "config.json"))) {
        Copy-Item (Join-Path $agent "config.example.json") (Join-Path $agent "config.json")
    }
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "Set-Location '$agent'; & '$venvPy' agent.py"
    )
}

Write-Host ""
Write-Host "Listo. Backend: http://127.0.0.1:8000  |  Frontend: http://127.0.0.1:5173" -ForegroundColor Yellow
Write-Host "Usuario por defecto: admin / admin123" -ForegroundColor Yellow
