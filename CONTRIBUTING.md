# Contributing to Luna Player

Thanks for helping. Luna is a Windows desktop player built with React/TypeScript and Rust/Tauri.

## Before you start

- Please do not open issues or pull requests that add piracy sources, copyrighted content, DRM circumvention
  or bundled API keys. Luna is a player; it ships with no content or sources.
- For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

See [BUILDING.md](BUILDING.md). In short:

```powershell
cd app
npm install
npm run tauri dev
```

You need Node.js 20+, Rust (MSVC toolchain), Visual Studio Build Tools and the `mpv/` folder described in
BUILDING.md.

## Checks before a pull request

Run these from `app/`:

```powershell
npx tsc --noEmit
node scripts/i18n-check.cjs
npm run build
```

For Rust changes:

```powershell
cd src-tauri
cargo test --lib
```

The i18n check must print `All texts have English.` New UI text is written in Turkish inside `tt("…")` and
its English translation is added to `app/src/i18n-en.ts`. Rust messages use `tr!("Türkçe", "English")`.

## Code style

- Match the existing style: small focused functions, comments only where the reason is not obvious.
- Do not reformat unrelated files in the same pull request.
- Keep user data compatible: storage keys and file formats are read by older versions too.
- Test the actual behaviour you changed (player, library, books, music, assistant) before opening the PR.

## Commits and pull requests

- One logical change per commit; write the message in English or Turkish.
- Describe what changed and how you tested it.
- Screenshots help for UI changes.
- By contributing you agree that your contribution is licensed under GPL-3.0, the project's license.

## Release process

Releases are built by `.github/workflows/release.yml` on a `v*` tag. It builds the NSIS setup and the portable
zip, then attaches both to the GitHub release. The same steps can be run locally:

```powershell
./scripts/fetch-mpv.ps1      # only when app/src-tauri/mpv is empty
cd app
npm run tauri build
cd ..
./scripts/package-portable.ps1
```
