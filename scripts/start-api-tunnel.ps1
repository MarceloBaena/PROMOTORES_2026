$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root '.run-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outLog = Join-Path $logDir "api-tunnel-$stamp.out.log"
$errLog = Join-Path $logDir "api-tunnel-$stamp.err.log"

$process = Start-Process `
  -FilePath 'cmd.exe' `
  -ArgumentList @('/d', '/s', '/c', 'npx localtunnel --port 3333 --local-host 127.0.0.1') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Start-Sleep -Seconds 8

$result = [pscustomobject]@{
  pid = $process.Id
  outLog = $outLog
  errLog = $errLog
}

Write-Output ($result | ConvertTo-Json -Compress)
