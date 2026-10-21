# Downloads the Windows mpv build and yt-dlp into app/src-tauri/mpv.
# Used locally when the folder is empty and by the GitHub release workflow.
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root "app/src-tauri/mpv"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$headers = @{ "User-Agent" = "Luna-Player-build" }
if ($env:GITHUB_TOKEN) { $headers["Authorization"] = "Bearer $env:GITHUB_TOKEN" }

Write-Host "Finding the latest mpv Windows build..."
$release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest"
$asset = $release.assets |
  Where-Object { $_.name -like "mpv-x86_64-*.7z" -and $_.name -notlike "*dev*" } |
  Select-Object -First 1
if (-not $asset) { throw "No mpv x86_64 .7z asset found in the latest release." }

$seven = @(
  "C:\Program Files\7-Zip\7z.exe",
  "C:\Program Files (x86)\7-Zip\7z.exe",
  (Get-Command 7z -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $seven) { throw "7-Zip is required. Install it or put 7z.exe on PATH." }

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("mpv-" + [guid]::NewGuid().ToString("N") + ".7z")
Write-Host "Downloading $($asset.name)..."
Invoke-WebRequest -Headers $headers -Uri $asset.browser_download_url -OutFile $tmp
Write-Host "Extracting..."
& $seven x $tmp "-o$dest" -y | Out-Null
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

# Some builds extract into a mpv-x86_64-* subfolder: flatten it.
$sub = Get-ChildItem $dest -Directory | Where-Object { $_.Name -like "mpv-x86_64-*" } | Select-Object -First 1
if ($sub) {
  Get-ChildItem $sub.FullName -Force | Move-Item -Destination $dest -Force
  Remove-Item $sub.FullName -Recurse -Force
}

Write-Host "Downloading yt-dlp..."
# the folder build: it starts in ~0.4 s instead of unpacking itself for every song (~1.1 s)
$zip = Join-Path $env:TEMP "yt-dlp_win.zip"
Invoke-WebRequest -Headers $headers -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_win.zip" -OutFile $zip
$ytdir = Join-Path $dest "yt-dlp"
if (Test-Path $ytdir) { Remove-Item -Recurse -Force $ytdir }
Expand-Archive -Path $zip -DestinationPath $ytdir
Remove-Item $zip
Write-Host "Downloading license texts..."
Invoke-WebRequest -Headers $headers -Uri "https://raw.githubusercontent.com/mpv-player/mpv/master/Copyright" -OutFile (Join-Path $dest "Copyright")
Invoke-WebRequest -Headers $headers -Uri "https://raw.githubusercontent.com/mpv-player/mpv/master/LICENSE.GPL" -OutFile (Join-Path $dest "LICENSE.GPL")
Invoke-WebRequest -Headers $headers -Uri "https://raw.githubusercontent.com/mpv-player/mpv/master/LICENSE.LGPL" -OutFile (Join-Path $dest "LICENSE.LGPL")
Invoke-WebRequest -Headers $headers -Uri "https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/LICENSE" -OutFile (Join-Path $dest "yt-dlp-LICENSE.txt")

foreach ($f in @("mpv.exe", "mpv.com", "d3dcompiler_43.dll", "yt-dlp\yt-dlp.exe", "Copyright", "LICENSE.GPL", "LICENSE.LGPL", "yt-dlp-LICENSE.txt")) {
  if (-not (Test-Path (Join-Path $dest $f))) { throw "Missing after extraction: $f" }
}
if (-not (Test-Path (Join-Path $dest "mpv/fonts.conf"))) { throw "Missing after extraction: mpv/fonts.conf" }

Write-Host "mpv and yt-dlp are ready in $dest"
