# Valorant dashboard - register daily data update task (Windows Task Scheduler)
#
# Usage (PowerShell, admin not required for current-user task):
#   powershell -ExecutionPolicy Bypass -File scripts\schedule.ps1
# Optional -Time parameter (default 08:30):
#   powershell -ExecutionPolicy Bypass -File scripts\schedule.ps1 -Time "09:00"
#
# Query / run now / remove:
#   schtasks /Query  /TN ValorantDashboardDailyUpdate
#   schtasks /Run    /TN ValorantDashboardDailyUpdate
#   schtasks /Delete /TN ValorantDashboardDailyUpdate /F
param([string]$Time = "08:30")

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $PSScriptRoot          # valorant-dashboard directory
$node = (Get-Command node -ErrorAction Stop).Source
$updateScript = Join-Path $dir "scripts\update.mjs"

if (-not (Test-Path $updateScript)) { throw "Update script not found: $updateScript" }

# Use the native ScheduledTasks module (handles spaces and unicode paths reliably)
$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + $updateScript + '"') -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
Register-ScheduledTask -TaskName "ValorantDashboardDailyUpdate" -Action $action -Trigger $trigger -Force | Out-Null

Write-Host ""
Write-Host "Registered task ValorantDashboardDailyUpdate (daily at $Time)" -ForegroundColor Green
Get-ScheduledTaskInfo -TaskName "ValorantDashboardDailyUpdate" | Format-List TaskName, LastRunTime, NextRunTime, LastTaskResult
