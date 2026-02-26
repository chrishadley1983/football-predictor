<#
.SYNOPSIS
    Generates daily AI punditry snippets using Claude Code.

.DESCRIPTION
    This script runs the punditry generation prompt through Claude Code.
    Claude Code reads tournament context from Supabase, generates 60
    in-character snippets (15 per pundit), and inserts them directly
    into the pundit_snippets table via Supabase MCP.

    Designed to run at 05:00 UTC daily via Windows Task Scheduler.
    A GCP Cloud Function at 05:30 UTC verifies snippets exist and
    sends a Discord notification.

.PARAMETER ProjectDir
    Path to the Football Prediction Game project. Defaults to
    C:\Users\Chris Hadley\Football Prediction Game.

.EXAMPLE
    .\Invoke-PunditryGeneration.ps1

.NOTES
    Requires: Claude Code CLI (authenticated via OAuth)
    Schedule: Task Scheduler - Daily at 05:00 UTC
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$ProjectDir = "C:\Users\Chris Hadley\Football Prediction Game"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Load the prompt
$PromptPath = Join-Path $ScriptDir "generate-punditry.md"
if (-not (Test-Path $PromptPath)) {
    Write-Error "Prompt file not found: $PromptPath"
    exit 1
}

$Prompt = Get-Content $PromptPath -Raw

# Execute Claude Code
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting punditry generation..."
$StartTime = Get-Date

try {
    # Run Claude Code with the prompt - it will use Supabase MCP to read context and insert snippets
    $RawOutput = claude --output-format json --project-dir $ProjectDir --prompt $Prompt 2>&1

    $ElapsedMs = ((Get-Date) - $StartTime).TotalMilliseconds
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Claude Code completed in $([math]::Round($ElapsedMs / 1000, 1)) seconds"

    # Parse the output to extract the JSON result
    $OutputStr = $RawOutput | Out-String

    # Look for our result JSON in the output
    if ($OutputStr -match '\{[^{}]*"success"\s*:\s*(true|false)[^{}]*\}') {
        $ResultJson = $Matches[0]
        $Result = $ResultJson | ConvertFrom-Json

        if ($Result.success) {
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Generation successful!"
            Write-Host "  Tournament: $($Result.tournament)"
            Write-Host "  Date: $($Result.date)"
            Write-Host "  Total inserted: $($Result.totalInserted)"
            if ($Result.generated) {
                Write-Host "  Neverill: $($Result.generated.neverill)"
                Write-Host "  Bright: $($Result.generated.bright)"
                Write-Host "  Meane: $($Result.generated.meane)"
                Write-Host "  Scaragher: $($Result.generated.scaragher)"
            }
        } else {
            Write-Warning "Generation reported failure: $($Result.error)"
            exit 1
        }
    } else {
        # Claude Code may have completed successfully but output format varies
        # Check if output contains signs of success
        if ($OutputStr -match "totalInserted|pundit_snippets|INSERT") {
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Generation appears to have completed (non-JSON output)"
            Write-Host $OutputStr.Substring(0, [Math]::Min(500, $OutputStr.Length))
        } else {
            Write-Warning "Could not parse Claude Code output"
            Write-Host $OutputStr.Substring(0, [Math]::Min(1000, $OutputStr.Length))
            exit 1
        }
    }

} catch {
    Write-Error "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Punditry generation failed: $_"
    exit 1
}
