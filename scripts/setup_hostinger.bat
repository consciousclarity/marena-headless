@echo off
REM setup_hostinger.bat
REM Run this once you have your Hostinger API token from hPanel -> API.
REM It creates a .env.local with the token, then lists your existing
REM websites so you can confirm which one to point the new Web Apps at.

setlocal
if "%HOSTINGER_API_TOKEN%"=="" (
  echo.
  echo  HOSTINGER_API_TOKEN is not set.
  echo.
  echo  1. Open hPanel: https://hpanel.hostinger.com
  echo  2. Go to API (top-right user menu)
  echo  3. Create a new token with read+write on hosting
  echo  4. Copy the token, then run:
  echo       set HOSTINGER_API_TOKEN=your-token-here
  echo       setup_hostinger.bat
  echo.
  exit /b 1
)

echo [1/2] Saving token to .env.local ...
(
  echo HOSTINGER_API_TOKEN=%HOSTINGER_API_TOKEN%
  echo MARENABALI_TARGET_DOMAIN=alp-see.at
  echo STRAPI_DB_NAME=marena_cms
  echo STRAPI_DB_USER=marena_cms
) > .env.local

echo [2/2] Listing your Hostinger websites ...
curl -s -A "Mozilla/5.0" -H "Authorization: Bearer %HOSTINGER_API_TOKEN%" ^
  "https://developers.hostinger.com/api/hosting/v1/websites" ^
  | python -m json.tool 2>nul || ^
  curl -s -A "Mozilla/5.0" -H "Authorization: Bearer %HOSTINGER_API_TOKEN%" ^
  "https://developers.hostinger.com/api/hosting/v1/websites"

echo.
echo Done. Next: review the runbook in MIGRATION.md sections 1-2.
endlocal
