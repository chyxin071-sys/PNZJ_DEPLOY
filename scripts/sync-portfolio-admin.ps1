param(
  [string]$Source = 'E:\XIN Lab\PNZJ\portfolio\admin-web'
)

$ErrorActionPreference = 'Stop'
$Target = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\studio-admin'))
$ResolvedSource = (Resolve-Path -LiteralPath $Source).Path

New-Item -ItemType Directory -Force -Path $Target | Out-Null

& robocopy $ResolvedSource $Target /MIR /R:1 /W:1 `
  /XD `
    "$ResolvedSource\.git" `
    "$ResolvedSource\node_modules" `
    "$ResolvedSource\.next" `
    "$ResolvedSource\.openai" `
    "$ResolvedSource\.wrangler" `
    "$ResolvedSource\dist" `
    "$ResolvedSource\build" `
    "$ResolvedSource\public\erp" `
    "$ResolvedSource\public\assets\erp" `
    "$ResolvedSource\examples" `
    "$ResolvedSource\tests" `
    "$ResolvedSource\worker" `
  /XF Dockerfile '*.log' '*.tsbuildinfo' next-env.d.ts

if ($LASTEXITCODE -gt 7) {
  throw "Portfolio admin sync failed with robocopy exit code $LASTEXITCODE"
}

Write-Host "Portfolio admin synced to $Target"
