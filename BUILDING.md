# Building Luna Player

Requirements: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (MSVC toolchain) and the Visual Studio Build Tools, on Windows.

1. **Get mpv.** Download `mpv-x86_64-*.7z` from https://github.com/shinchiro/mpv-winbuild-cmake/releases and extract it into
   `app/src-tauri/mpv/`. The folder should contain `mpv.exe`, `mpv.com`, `d3dcompiler_43.dll` and `mpv/fonts.conf`.
2. **Run in development mode:**
   ```
   cd app
   npm install
   npm run tauri dev
   ```
3. **Make the installer:** `npm run tauri build`. The setup file ends up in `app/src-tauri/target/release/bundle/nsis/`.

## How it fits together

- The interface is a React app (`app/src`) inside a [Tauri](https://tauri.app) window (`app/src-tauri`).
- Video plays in an mpv window embedded with `--wid`; the interface sits on top as a transparent webview.
  mpv is controlled over JSON IPC (a named pipe), see `app/src-tauri/src/mpv.rs`.
- `app/mock.html` runs the interface in a normal browser with a fake Tauri bridge, handy for UI work
  (`npm run dev`, then open `http://localhost:1420/mock.html`).

## Translations

UI text is written in Turkish in the code and wrapped in `tt("…")` (`app/src/i18n.ts`). The English texts are in
`app/src/i18n-en.ts`. After adding text, run `node scripts/i18n-check.cjs` in `app/` to list anything still missing English.
Messages from the Rust side use the `tr!("Türkçe", "English")` macro.

## Third-party licenses

- mpv, bundled in the installer: [GPLv2+ / LGPL](https://github.com/mpv-player/mpv/blob/master/Copyright)
- Inter font: SIL Open Font License (`app/src-tauri/fonts/Inter-LICENSE.txt`)
