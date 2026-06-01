# Builds the installer signed with the dev cert (or real cert if configured).
# To use a real cert: set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD as env vars
# before running this script, or update the paths below.

$certPath = "$PSScriptRoot\dev-cert.pfx"

if (-not (Test-Path $certPath)) {
  Write-Host "Dev cert not found. Run scripts\create-dev-cert.ps1 first." -ForegroundColor Red
  Write-Host "Or set WIN_CSC_LINK to your real certificate path." -ForegroundColor Yellow
  exit 1
}

$env:WIN_CSC_LINK         = $certPath
$env:WIN_CSC_KEY_PASSWORD = "claudebox-dev"

Write-Host "Building signed installer..." -ForegroundColor Cyan
npm run build

Remove-Item Env:\WIN_CSC_LINK         -ErrorAction SilentlyContinue
Remove-Item Env:\WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
