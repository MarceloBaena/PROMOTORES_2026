$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
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
$outLog = Join-Path $logDir "web-live-$stamp.out.log"
$errLog = Join-Path $logDir "web-live-$stamp.err.log"

$process = Start-Process `
  -FilePath 'cmd.exe' `
  -ArgumentList @('/d', '/s', '/c', 'npm run dev:web') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Start-Sleep -Seconds 18

$result = [pscustomobject]@{
  pid = $process.Id
  outLog = $outLog
  errLog = $errLog
}

Write-Output ($result | ConvertTo-Json -Compress)
