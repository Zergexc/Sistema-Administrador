# Instalador del agente TI Diagnostic.
# Copia ti-agent.exe, genera config.json y registra una tarea programada
# para que el agente arranque solo con Windows.
#
# Uso (PowerShell como Administrador, junto a ti-agent.exe):
#   .\install-agent.ps1 -ServerUrl "http://192.168.1.50:8000"
#
# Parámetros opcionales:
#   -InstallDir "C:\TIAgent"   carpeta de instalación
#   -IntervalSeconds 120       intervalo de reporte
#   -Token ""                  API key si el backend la exige

param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,
    [string]$InstallDir = "C:\TIAgent",
    [int]$IntervalSeconds = 120,
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

# Requiere admin (para escribir en C:\ y registrar la tarea como SYSTEM).
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Ejecuta este script en una consola PowerShell como Administrador."
}

# Busca el exe junto al script (o en dist\ si se corre desde el repo).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeSource = Join-Path $scriptDir "ti-agent.exe"
if (-not (Test-Path $exeSource)) {
    $exeSource = Join-Path $scriptDir "dist\ti-agent.exe"
}
if (-not (Test-Path $exeSource)) {
    Write-Error "No se encontró ti-agent.exe junto al script ni en dist\. Compílalo primero o copia el exe aquí."
}

Write-Host "Instalando agente en $InstallDir ..." -ForegroundColor Cyan

# Si la tarea ya existe (reinstalación), detenla primero para poder sobrescribir el exe.
$taskName = "TI Diagnostic Agent"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Stop-Process -Name "ti-agent" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $exeSource (Join-Path $InstallDir "ti-agent.exe") -Force

# config.json apuntando al servidor.
$config = [ordered]@{
    server_url              = $ServerUrl.TrimEnd("/")
    report_interval_seconds = $IntervalSeconds
    hostname_override       = ""
    token                   = $Token
    full_scan_every         = 15
}
$config | ConvertTo-Json | Out-File -Encoding ascii (Join-Path $InstallDir "config.json")

# Tarea programada: arranca con Windows, corre como SYSTEM, se reinicia si falla.
$action = New-ScheduledTaskAction -Execute (Join-Path $InstallDir "ti-agent.exe") -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

# Arranca ahora mismo sin esperar al reinicio.
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Agente instalado y en ejecución." -ForegroundColor Green
Write-Host "  Carpeta:  $InstallDir"
Write-Host "  Servidor: $($config.server_url)"
Write-Host "  Tarea:    '$taskName' (inicia con Windows, corre como SYSTEM)"
Write-Host ""
Write-Host "El equipo aparecerá en el panel tras el primer reporte (~1 min)."
Write-Host "Para desinstalar: Unregister-ScheduledTask -TaskName '$taskName'; Remove-Item -Recurse '$InstallDir'"
