# Builds the release (installer and Luna Player.exe) with this computer's folders left out of the
# program: Rust and C keep source file paths for their error messages, and those would carry the
# Windows user name and the project folder. They are rewritten to "cargo", "luna" and "~".
param([string]$Tag = "", [string]$Notes = "")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE ".cargo" }
$fso = New-Object -ComObject Scripting.FileSystemObject
$short = { param($p) if (Test-Path $p) { $fso.GetFolder($p).ShortPath } else { $p } }

$maps = [ordered]@{}
foreach ($p in @($cargoHome, (& $short $cargoHome))) { $maps[$p] = "cargo" }
foreach ($p in @($root, (& $short $root))) { $maps[$p] = "luna" }
foreach ($p in @($env:USERPROFILE, (& $short $env:USERPROFILE))) { $maps[$p] = "~" }

# CARGO_ENCODED_RUSTFLAGS takes one flag per 0x1F-separated field, so folders with spaces are fine.
$env:CARGO_ENCODED_RUSTFLAGS = ($maps.Keys | ForEach-Object { "--remap-path-prefix=$_=$($maps[$_])" }) -join [char]0x1f
# MSVC: drop the same folders from __FILE__ in the C libraries (aws-lc and friends).
$env:CFLAGS = ($maps.Keys | Where-Object { $_ -notmatch ' ' } | ForEach-Object { "/d1trimfile:$_\" }) -join " "

$key = Join-Path $env:USERPROFILE ".luna-keys\luna-updater.key"
if (Test-Path $key) {
  $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $key -Raw).Trim()
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
} else { Write-Warning "No update key at ${key}: this build won't be offered as an update." }

Set-Location (Join-Path $root "app")
# The build prints its progress on stderr; Windows PowerShell would stop on that, so only the exit code counts.
$ErrorActionPreference = "Continue"
npm run tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed ($LASTEXITCODE)" }

# ---- Updates: the installer is signed with Luna's update key, and latest.json tells installed
# copies about it. Upload latest.json, the setup exe and its .sig to the GitHub release with this tag.
# The key lives outside the project (%USERPROFILE%\.luna-keys), never in git; without it a build
# still works but installed copies can't update to it.
$version = (Get-Content (Join-Path $root "app/src-tauri/tauri.conf.json") -Raw | ConvertFrom-Json).version
$nsis = Join-Path $root "app/src-tauri/target/release/bundle/nsis"
$setup = Join-Path $nsis "Luna Player_${version}_x64-setup.exe"
if ((Test-Path $key) -and (Test-Path "$setup.sig")) {
  if (-not $Tag) { $Tag = "v$version" }
  # GitHub turns the space in the file name into a dot
  $asset = "Luna.Player_${version}_x64-setup.exe"
  $manifest = [ordered]@{
    version   = $version
    notes     = $Notes
    pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
      "windows-x86_64" = [ordered]@{
        signature = (Get-Content "$setup.sig" -Raw).Trim()
        url       = "https://github.com/Nothingman333/Luna-Player/releases/download/$Tag/$asset"
      }
    }
  }
  $out = Join-Path $nsis "latest.json"
  [IO.File]::WriteAllText($out, ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
  Write-Host "Update files for release ${Tag}: $setup, $setup.sig, $out"
}
