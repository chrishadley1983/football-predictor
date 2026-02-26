<#
.SYNOPSIS
    Installs a Windows Task Scheduler task for daily punditry generation.

.DESCRIPTION
    Creates a scheduled task that runs at 05:00 UTC daily to generate
    AI punditry snippets via Claude Code. The task is disabled by default
    and must be manually enabled after verification.

.PARAMETER Enable
    If specified, enables the task immediately after creation.

.EXAMPLE
    .\Install-ScheduledTask.ps1

.EXAMPLE
    .\Install-ScheduledTask.ps1 -Enable

.NOTES
    Requires: Administrator privileges for Task Scheduler access
    Companion: GCP Cloud Function verifies at 05:30 UTC and sends Discord notification
#>

[CmdletBinding()]
param(
    [Parameter()]
    [switch]$Enable
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Verify script exists
$GenerationScript = Join-Path $ScriptDir "Invoke-PunditryGeneration.ps1"
if (-not (Test-Path $GenerationScript)) {
    Write-Error "Generation script not found: $GenerationScript"
    exit 1
}

$TaskName = "Punditry-DailyGeneration"
$TaskPath = "\Football Predictor\"

Write-Host "Creating punditry generation scheduled task..."

# 05:00 UTC daily
# Note: Windows Task Scheduler uses local time, so we set UTC explicitly
$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$GenerationScript`""

$Trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At "05:00"

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false -ErrorAction SilentlyContinue

# Create the task
$Task = @{
    TaskName = $TaskName
    TaskPath = $TaskPath
    Action = $Action
    Trigger = $Trigger
    Settings = $Settings
    Description = "Generates 60 AI punditry snippets daily (15 per pundit) via Claude Code and inserts into Supabase. Runs at 05:00 UTC, verified by GCP at 05:30 UTC."
}

Register-ScheduledTask @Task

if (-not $Enable) {
    Disable-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
}

Write-Host ""
Write-Host "=== Installation Complete ==="
Write-Host ""
Write-Host "Task: $TaskPath$TaskName"
Write-Host "Schedule: Daily at 05:00 UTC"
Write-Host ""

if (-not $Enable) {
    Write-Host "Task is DISABLED. Enable when ready:"
    Write-Host ""
    Write-Host "  Enable-ScheduledTask -TaskName '$TaskName' -TaskPath '$TaskPath'"
    Write-Host ""
} else {
    Write-Host "Task is ENABLED and will run at the next scheduled time."
}

Write-Host "To run manually:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName' -TaskPath '$TaskPath'"
Write-Host ""
Write-Host "To view task:"
Write-Host "  Get-ScheduledTask -TaskPath '$TaskPath'"
