# Health Check Troubleshooting Guide

## Overview
The health check workflow (`db-keepalive.yml`) pings `/api/health/db` to keep the database connection active.

## Changes Made
1. ✅ Changed schedule from `*/2` (every 2 days) to daily (`* * *`) - more reliable
2. ✅ Added timeout (5 minutes) to prevent hanging
3. ✅ Added detailed logging and error messages
4. ✅ Added manual URL override via `workflow_dispatch` input
5. ✅ Better error handling with status codes and response bodies

## Verification Checklist

### 1. Check GitHub Actions Workflow Status
- Go to: https://github.com/Brendin-DP/IMD-accelerator/actions
- Look for "Keep DB Alive" workflow
- Check if it has run recently (should run daily at 6 AM UTC)
- Check if any runs failed and why

### 2. Verify Secret is Set
- Go to: https://github.com/Brendin-DP/IMD-accelerator/settings/secrets/actions
- Verify `VERCEL_APP_URL` secret exists
- Value should be your Vercel app URL (e.g., `https://your-app.vercel.app`)
- **Important**: No trailing slash!

### 3. Test Health Endpoint Manually
Test the endpoint directly:
```bash
# Replace with your actual Vercel URL
curl https://your-app.vercel.app/api/health/db
```

Expected response: `OK` with HTTP 200

### 4. Test Workflow Manually
1. Go to: https://github.com/Brendin-DP/IMD-accelerator/actions/workflows/db-keepalive.yml
2. Click "Run workflow" button
3. Optionally provide `app_url` input to override the secret
4. Click "Run workflow" to trigger
5. Watch the logs to see detailed output

### 5. Common Issues

#### Issue: Workflow not running
- **Cause**: Scheduled workflows only run on the default branch (`main`)
- **Fix**: Ensure workflow file is committed to `main` branch

#### Issue: Secret not found
- **Cause**: `VERCEL_APP_URL` secret not set in repository
- **Fix**: Add secret in Settings → Secrets and variables → Actions

#### Issue: Connection timeout
- **Cause**: Vercel app might be sleeping (free tier)
- **Fix**: Consider upgrading or using a different keepalive service

#### Issue: HTTP 500 error
- **Cause**: Database connection issue or endpoint error
- **Fix**: Check Vercel function logs for errors

## Next Steps
1. Commit and push the updated workflow file
2. Verify the secret is set in GitHub
3. Manually trigger the workflow to test
4. Check the workflow logs for any errors
5. Monitor the Actions tab to ensure it runs daily
