$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$connections = Get-NetTCPConnection -LocalPort 3333 -ErrorAction SilentlyContinue
if ($connections) {
  $connections |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
}

$logDir = Join-Path $root '.run-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outLog = Join-Path $logDir "api-live-$stamp.out.log"
$errLog = Join-Path $logDir "api-live-$stamp.err.log"

$process = Start-Process `
  -FilePath 'cmd.exe' `
  -ArgumentList @('/d', '/s', '/c', 'npm run build:packages && npm run start -w @promotor/api') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Start-Sleep -Seconds 12

$result = [pscustomobject]@{
  pid = $process.Id
  outLog = $outLog
  errLog = $errLog
}

Write-Output ($result | ConvertTo-Json -Compress)
