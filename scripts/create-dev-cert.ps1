# Creates a self-signed code signing certificate for local dev/testing builds.
# NOTE: Self-signed certs will NOT satisfy Windows SmartScreen or AV vendors.
# For production, replace dev-cert.pfx with a cert from DigiCert / Sectigo,
# or use Azure Trusted Signing (~$10/month — recommended for indie devs).

$certPassword = "claudebox-dev"
$outputPath   = "$PSScriptRoot\dev-cert.pfx"

Write-Host "Creating self-signed code signing certificate..." -ForegroundColor Cyan

$cert = New-SelfSignedCertificate `
  -Type CodeSigning `
  -Subject "CN=ZavTech, O=ZavTech, C=GB" `
  -KeyUsage DigitalSignature `
  -FriendlyName "ZavTech ClaudeBox (Dev)" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(3)

$password = ConvertTo-SecureString -String $certPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $outputPath -Password $password | Out-Null

Write-Host "Certificate created: $outputPath" -ForegroundColor Green
Write-Host "Run 'npm run build:signed' to build with this certificate." -ForegroundColor Green
