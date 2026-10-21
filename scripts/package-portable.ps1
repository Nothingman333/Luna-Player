# Builds dist-share/Luna Player_<version>_x64-portable.zip from a finished release build.
param([string]$Version = "")
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root "app"

if (-not $Version) {
  $conf = Get-Content (Join-Path $app "src-tauri/tauri.conf.json") -Raw | ConvertFrom-Json
  $Version = $conf.version
}
$Version = $Version.TrimStart("v")

$exe = Join-Path $app "src-tauri/target/release/Luna Player.exe"
if (-not (Test-Path $exe)) { throw "Release binary not found: $exe (run 'npm run tauri build' first)" }

$outRoot = Join-Path $root "dist-share"
$folder = Join-Path $outRoot "Luna Player"
$zip = Join-Path $outRoot "Luna Player_${Version}_x64-portable.zip"

Remove-Item $folder -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $folder "mpv/mpv"), (Join-Path $folder "fonts") | Out-Null
Copy-Item $exe (Join-Path $folder "Luna Player.exe")

$mpvDir = Join-Path $app "src-tauri/mpv"
foreach ($f in @("mpv.exe", "mpv.com", "d3dcompiler_43.dll", "yt-dlp.exe", "Copyright", "LICENSE.GPL", "LICENSE.LGPL", "yt-dlp-LICENSE.txt")) {
  $src = Join-Path $mpvDir $f
  if (Test-Path $src) { Copy-Item $src (Join-Path $folder "mpv/$f") }
}
# the yt-dlp folder build (starts much faster than the one-file yt-dlp.exe)
if (Test-Path (Join-Path $mpvDir "yt-dlp/yt-dlp.exe")) { Copy-Item (Join-Path $mpvDir "yt-dlp") (Join-Path $folder "mpv/yt-dlp") -Recurse }
Copy-Item (Join-Path $mpvDir "mpv/fonts.conf") (Join-Path $folder "mpv/mpv/fonts.conf")
Copy-Item (Join-Path $app "src-tauri/fonts/*") (Join-Path $folder "fonts") -Recurse

foreach ($doc in @("README.md", "LICENSE", "COPYRIGHT", "THIRD-PARTY-NOTICES.md", "CHANGELOG.md")) {
  $src = Join-Path $root $doc
  if (Test-Path $src) { Copy-Item $src (Join-Path $folder $doc) }
}

Remove-Item $zip -Force -ErrorAction SilentlyContinue
Push-Location $outRoot
try { Compress-Archive -Path "Luna Player" -DestinationPath $zip -CompressionLevel Optimal }
finally { Pop-Location }

Write-Host "Portable package: $zip"
