# Punditry System — Deployment Guide

## Architecture

```
Windows Task Scheduler (05:00 UTC daily)
  └── PowerShell → Claude Code CLI (OAuth)
        ├── Reads tournament context from Supabase (MCP)
        ├── Generates 60 snippets (15 per pundit)
        └── Inserts into Supabase (MCP)

Cloud Scheduler (05:30 UTC daily)
  └── Cloud Function (verify-punditry)
        ├── Checks Supabase for today's snippets
        └── Sends Discord notification (success / error)
```

## Part 1: Local Generation (Windows Task Scheduler)

### Install the scheduled task

```powershell
cd "C:\Users\Chris Hadley\Football Prediction Game\scripts\punditry"

# Install (disabled by default)
.\Install-ScheduledTask.ps1

# Install and enable immediately
.\Install-ScheduledTask.ps1 -Enable
```

### Run manually

```powershell
# Via Task Scheduler
Start-ScheduledTask -TaskName 'Punditry-DailyGeneration' -TaskPath '\Football Predictor\'

# Or directly
.\Invoke-PunditryGeneration.ps1
```

### View task status

```powershell
Get-ScheduledTask -TaskPath '\Football Predictor\'
```

## Part 2: GCP Verification (Cloud Scheduler + Cloud Function)

### Prerequisites

```powershell
gcloud services enable cloudfunctions.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com run.googleapis.com cloudbuild.googleapis.com
```

### Store secrets (if not already done)

```powershell
# Supabase credentials
echo -n "https://modjoikyuhqzouxvieua.supabase.co" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "YOUR_SERVICE_ROLE_KEY" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-

# Discord webhook for notifications
echo -n "YOUR_DISCORD_WEBHOOK_URL" | gcloud secrets create DISCORD_WEBHOOK_URL --data-file=-
```

### Deploy the Cloud Function

```powershell
cd "C:\Users\Chris Hadley\Football Prediction Game\gcp\generate-punditry"
npm install
npm run deploy
```

### Create the Cloud Scheduler job (05:30 UTC)

```powershell
$FUNCTION_URL = gcloud functions describe verify-punditry --gen2 --region europe-west2 --format "value(serviceConfig.uri)"

gcloud scheduler jobs create http verify-punditry-daily --location europe-west2 --schedule "30 5 * * *" --uri $FUNCTION_URL --http-method POST --oidc-service-account-email (gcloud iam service-accounts list --format "value(email)" --filter "displayName:Default compute service account") --time-zone "UTC"
```

### Test manually

```powershell
gcloud scheduler jobs run verify-punditry-daily --location europe-west2
gcloud functions logs read verify-punditry --gen2 --region europe-west2 --limit 20
```

## Discord Notifications

**Success (green):**
> Punditry Generation Complete
> 60 snippets generated for World Cup 2026
> Neverill: 15 | Bright: 15 | Meane: 15 | Scaragher: 15

**Error (red):**
> Punditry Generation Issue
> No snippets found for today. Local generation may have failed.
> Action Required: Check local Task Scheduler logs or run generation manually.

## Updating Tournament

When a new tournament starts, update both:

```powershell
# Update GCP function env var
gcloud functions deploy verify-punditry --gen2 --region europe-west2 --update-env-vars TOURNAMENT_SLUG=new-slug

# Update the prompt file: scripts/punditry/generate-punditry.md
# Change the tournament slug in the SQL queries
```
