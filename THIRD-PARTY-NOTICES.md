# Third-party notices

Luna Player itself is licensed under the **GNU General Public License v3.0** (see `LICENSE`).
The release packages also contain the programs and assets below. They are not part of Luna's source code and
keep their own licenses.

## mpv

- Project: https://mpv.io — source: https://github.com/mpv-player/mpv
- License: **GPLv2 or later** (the distributed Windows build is built with GPL-only parts enabled).
  The full copyright notice and the GPLv2/LGPL license texts are shipped as `mpv/Copyright`,
  `mpv/LICENSE.GPL` and `mpv/LICENSE.LGPL` inside the installer and the portable package.
- Binaries: Windows builds by [shinchiro/mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake),
  downloaded from its GitHub releases.
- Written offer: the corresponding mpv source is available at the upstream repository and at
  https://github.com/shinchiro/mpv-winbuild-cmake (build scripts and revisions). If you redistribute Luna,
  keep `mpv/Copyright` and this notice with the binaries, and make the mpv source available under GPLv2+.

## yt-dlp

- Project: https://github.com/yt-dlp/yt-dlp
- License: **Unlicense** (public domain). The license text is shipped as `mpv/yt-dlp-LICENSE.txt`.
- Used by mpv's `ytdl_hook` script to resolve YouTube and similar links.

## Fonts

- **Inter** — SIL Open Font License 1.1, `app/src-tauri/fonts/Inter-LICENSE.txt`.
- **Literata**, **Sora**, **IBM Plex Sans** — SIL Open Font License 1.1, distributed through Fontsource.
- mpv's `fonts.conf` and the system font stack are used for subtitle rendering.

## JavaScript / Rust libraries

- React, React DOM — MIT
- Tauri and its plugins — MIT / Apache-2.0
- epub.js — BSD-2-Clause
- PDF.js — Apache-2.0
- Vite, TypeScript — MIT / Apache-2.0
- librqbit, reqwest, serde, zip and the other Rust crates — their respective licenses, listed in
  `app/src-tauri/Cargo.lock` and the crates' repositories.

## Services and data

- TMDB API — https://www.themoviedb.org/documentation/api. This product uses the TMDB API but is not
  endorsed or certified by TMDB.
- Open Library, Project Gutenberg, LibriVox, Internet Archive, Radio Browser, OpenSubtitles,
  Art Institute of Chicago, The Metropolitan Museum of Art and Wikimedia Commons are used through their
  public APIs; their terms apply.
- Google Gemini is used only when the user supplies their own API key.

Luna Player does not include any films, books, music, streams or search sources. Only open content you have
the right to use.
