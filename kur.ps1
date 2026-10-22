param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
$rustup = Join-Path $cargoBin 'rustup.exe'
function Find-CppTools {
    if (Test-Path -LiteralPath $vswhere) {
        $found = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        return ($found | Select-Object -First 1)
    }
    return $null
}
if ($CheckOnly) {
    Write-Host ('C++ tools: ' + [bool](Find-CppTools))
    Write-Host ('Rustup: ' + (Test-Path -LiteralPath $rustup))
    exit 0
}
function Download-SignedInstaller([string]$url, [string]$destination) {
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $destination
    $signature = Get-AuthenticodeSignature -LiteralPath $destination
    if ($signature.Status -ne 'Valid') { throw "Installer signature could not be verified: $destination" }
}
try {
    Write-Host 'Luna: Rust MSVC + Microsoft C++ Build Tools kurulumu' -ForegroundColor Cyan
    Write-Host 'Resmi kurucular indirilir. Windows yonetici izni isteyebilir.'
    Write-Host 'C++ araclari birkac GB indirebilir; kurulum bitene kadar pencereyi kapatmayin.'
    $work = Join-Path ([IO.Path]::GetTempPath()) ('Luna-Prerequisites-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null

    Write-Host '[1/3] Microsoft C++ Build Tools ve Windows SDK'
    $cpp = Find-CppTools
    if (-not $cpp) {
        $installer = Join-Path $work 'vs_buildtools.exe'
        Download-SignedInstaller 'https://aka.ms/vs/17/release/vs_buildtools.exe' $installer
        $process = Start-Process -FilePath $installer -ArgumentList '--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' -WindowStyle Hidden -Wait -PassThru
        if ($process.ExitCode -eq 3010) {
            Write-Host 'Windows yeniden baslatilmali. Yeniden baslatip kur.bat dosyasini tekrar acin.' -ForegroundColor Yellow
            exit 1
        }
        if ($process.ExitCode -ne 0) { throw "C++ installer exit code: $($process.ExitCode). Download folder: $work" }
        if (-not (Find-CppTools)) { throw 'C++ tools were not detected after installation.' }
    } else {
        Write-Host "C++ araclari mevcut: $cpp"
        # An existing partial installation may lack the Windows SDK. Add the workload to it.
        $vsInstaller = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\setup.exe'
        if (Test-Path -LiteralPath $vsInstaller) {
            $process = Start-Process -FilePath $vsInstaller -ArgumentList @('modify', '--installPath', ('"' + $cpp + '"'), '--passive', '--norestart', '--add', 'Microsoft.VisualStudio.Workload.VCTools', '--includeRecommended') -WindowStyle Hidden -Wait -PassThru
            if ($process.ExitCode -eq 3010) { Write-Host 'Windows yeniden baslatilmali; sonra kur.bat dosyasini tekrar acin.'; exit 1 }
            if ($process.ExitCode -ne 0) { throw "C++ workload update exit code: $($process.ExitCode)" }
        }
    }

    Write-Host '[2/3] Rust MSVC'
    if (-not (Test-Path -LiteralPath $rustup)) {
        $installer = Join-Path $work 'rustup-init.exe'
        $rustUrl = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
        Invoke-WebRequest -UseBasicParsing -Uri $rustUrl -OutFile $installer
        $checksumText = (Invoke-WebRequest -UseBasicParsing -Uri ($rustUrl + '.sha256')).Content
        $expectedHash = ($checksumText.Trim() -split '\s+')[0]
        if ($expectedHash -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expectedHash) {
            throw 'Rustup SHA-256 verification failed.'
        }
        & $installer -y --default-toolchain none --profile minimal
        if ($LASTEXITCODE -ne 0) { throw "Rustup installation failed: $LASTEXITCODE" }
    }
    & $rustup toolchain install stable-x86_64-pc-windows-msvc --profile minimal
    if ($LASTEXITCODE -ne 0) { throw "Rust MSVC installation failed: $LASTEXITCODE" }
    # Keep this choice local to Luna; do not change the user's global Rust default.
    $env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
    & (Join-Path $cargoBin 'cargo.exe') --version
    if ($LASTEXITCODE -ne 0) { throw 'Cargo verification failed.' }

    Write-Host '[3/3] Luna medya dosyalari'
    $mpvTarget = Join-Path $PSScriptRoot 'app\src-tauri\mpv'
    $installedMpv = Join-Path $env:LOCALAPPDATA 'Luna Player\mpv'
    if ((Test-Path -LiteralPath (Join-Path $PSScriptRoot 'app\src-tauri')) -and -not (Test-Path -LiteralPath (Join-Path $mpvTarget 'mpv.exe'))) {
        if (Test-Path -LiteralPath (Join-Path $installedMpv 'mpv.exe')) {
            New-Item -ItemType Directory -Path $mpvTarget -Force | Out-Null
            Get-ChildItem -LiteralPath $installedMpv -Force | Copy-Item -Destination $mpvTarget -Recurse
            Write-Host 'Kurulu Luna playerin mpv dosyalari kaynak kopyasina alindi.'
        } else {
            Write-Host 'mpv bulunamadi. BUILDING.md icindeki scripts/fetch-mpv.ps1 adimini tamamlayin.' -ForegroundColor Yellow
        }
    }
    Write-Host ''
    Write-Host 'Kurulum tamam. Simdi Luna Web Yerel.cmd dosyasini acabilirsiniz.' -ForegroundColor Green
} catch {
    Write-Host ('HATA: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
