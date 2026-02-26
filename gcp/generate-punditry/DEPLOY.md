# Deploy Generate Punditry — GCP Cloud Function + Scheduler

## Prerequisites

1. Google Cloud CLI (`gcloud`) installed and authenticated
2. A GCP project with billing enabled
3. APIs enabled: Cloud Functions, Cloud Scheduler, Secret Manager

```powershell
gcloud services enable cloudfunctions.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com run.googleapis.com cloudbuild.googleapis.com
```

## 1. Store Secrets in Secret Manager

```powershell
echo -n "https://modjoikyuhqzouxvieua.supabase.co" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "YOUR_SERVICE_ROLE_KEY" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
echo -n "YOUR_ANTHROPIC_API_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
```

## 2. Deploy the Cloud Function

```powershell
cd gcp/generate-punditry
npm install
npm run deploy
```

This deploys a Gen 2 Cloud Function to `europe-west2` with:
- 300s timeout (4 API calls × ~30s each + overhead)
- 256MB memory
- Secrets injected from Secret Manager
- `TOURNAMENT_SLUG=world-cup-2026` as env var
- HTTP trigger (no public access — only Cloud Scheduler)

## 3. Create the Cloud Scheduler Job (05:30 UTC daily)

```powershell
# Get the function URL
$FUNCTION_URL = gcloud functions describe generate-punditry --gen2 --region europe-west2 --format "value(serviceConfig.uri)"

# Create scheduler job
gcloud scheduler jobs create http generate-punditry-daily --location europe-west2 --schedule "30 5 * * *" --uri $FUNCTION_URL --http-method POST --oidc-service-account-email (gcloud iam service-accounts list --format "value(email)" --filter "displayName:Default compute service account") --time-zone "UTC"
```

The cron expression `30 5 * * *` runs at **05:30 UTC every day**.

## 4. Test It

```powershell
# Trigger manually
gcloud scheduler jobs run generate-punditry-daily --location europe-west2

# Check logs
gcloud functions logs read generate-punditry --gen2 --region europe-west2 --limit 50
```

## Architecture

```
Cloud Scheduler (05:30 UTC daily)
  └── Cloud Function (generate-punditry)
        ├── Reads tournament context from Supabase
        ├── Calls Claude API (4 pundits × 15 snippets)
        └── Inserts 60 snippets into Supabase
              └── Vercel app reads snippets (no API key needed)
```

## Updating Tournament Slug

When a new tournament starts:

```powershell
gcloud functions deploy generate-punditry --gen2 --region europe-west2 --update-env-vars TOURNAMENT_SLUG=new-tournament-slug
```
