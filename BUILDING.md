# Building Luna Player

Requirements: Windows 10/11, [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (MSVC toolchain) and
the Visual Studio Build Tools (Desktop development with C++).

## 1. Get mpv and yt-dlp

The release build bundles mpv and yt-dlp with the app. They are not in the repository (they are large binaries),
so fetch them once:

```powershell
./scripts/fetch-mpv.ps1
```

This downloads the latest `mpv-x86_64-*.7z` from
[shinchiro/mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake), extracts it into
`app/src-tauri/mpv/`, and puts `yt-dlp.exe`, `Copyright` and `yt-dlp-LICENSE.txt` next to it. The folder should
contain `mpv.exe`, `mpv.com`, `d3dcompiler_43.dll`, `yt-dlp.exe`, `mpv/fonts.conf`, `Copyright` and
`yt-dlp-LICENSE.txt`.

## 2. Run in development mode

```powershell
cd app
npm install
npm run tauri dev
```

## 3. Build the setup (NSIS)

```powershell
cd app
npm run tauri build
```

The installer is written to `app/src-tauri/target/release/bundle/nsis/Luna Player_<version>_x64-setup.exe`.

For a build you share, run `./scripts/build-release.ps1` from the project folder instead: it does the same build but leaves your computer's folders (and so your Windows user name) out of the program's error-message paths.

## 4. Build the portable ZIP

After the setup build finishes:

```powershell
./scripts/package-portable.ps1
```

It creates `dist-share/Luna Player_<version>_x64-portable.zip` with:

```
Luna Player/
  Luna Player.exe
  fonts/
  mpv/ (mpv.exe, mpv.com, d3dcompiler_43.dll, yt-dlp.exe, mpv/fonts.conf, licenses)
  README.md, LICENSE, THIRD-PARTY-NOTICES.md, CHANGELOG.md
```

The portable build keeps its data in the same folder and can be moved or deleted without an installer.

## 5. Release with GitHub Actions

`.github/workflows/release.yml` builds both packages on a Windows runner when a `v*` tag is pushed:

```powershell
git tag v0.3.0
git push origin v0.3.0
```

The workflow fetches mpv, builds the NSIS setup, makes the portable zip and attaches both to the GitHub release.
It can also be started manually from the Actions tab with a version input.

## How it fits together

- The interface is a React app (`app/src`) inside a [Tauri](https://tauri.app) window (`app/src-tauri`).
- Video plays in an mpv window embedded with `--wid`; the interface sits on top as a transparent webview.
  mpv is controlled over JSON IPC (a named pipe), see `app/src-tauri/src/mpv.rs`.
- `app/mock.html` runs the interface in a normal browser with a fake Tauri bridge, handy for UI work
  (`npm run dev`, then open `http://localhost:1420/mock.html`).

## Translations

UI text is written in Turkish in the code and wrapped in `tt("…")` (`app/src/i18n.ts`). The English texts are in
`app/src/i18n-en.ts`. After adding text, run `node scripts/i18n-check.cjs` in `app/` to list anything still missing
English. Messages from the Rust side use the `tr!("Türkçe", "English")` macro.

## Third-party licenses

- Luna Player: GPL-3.0 (`LICENSE`).
- mpv (bundled): GPLv2+ / LGPL; copyright text in `app/src-tauri/mpv/Copyright`.
- yt-dlp (bundled): Unlicense; text in `app/src-tauri/mpv/yt-dlp-LICENSE.txt`.
- Inter font: SIL Open Font License (`app/src-tauri/fonts/Inter-LICENSE.txt`).

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for source links and the full list.
