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
- webview2-com — MIT; windows-core — MIT / Apache-2.0. Used for native WebView2 audio isolation.
- epub.js — BSD-2-Clause
- PDF.js — Apache-2.0
- Vite, TypeScript — MIT / Apache-2.0
- librqbit, reqwest, serde, zip and the other Rust crates — their respective licenses, listed in
  `app/src-tauri/Cargo.lock` and the crates' repositories.

## Optional downloads (only when you ask for them in Luna)

- **whisper.cpp** (`whisper-cli.exe` and its libraries, v1.8.4 Windows builds) — MIT, https://github.com/ggml-org/whisper.cpp.
  The processor build and the NVIDIA CUDA 12 build are downloaded from the project's GitHub releases and checked against a
  fixed size and SHA-256 before use. The CUDA build contains NVIDIA's CUDA runtime libraries (cudart, cuBLAS), which keep
  NVIDIA's own license terms.
- **Whisper models** (ggml format) — OpenAI Whisper weights, MIT, https://github.com/openai/whisper; converted files are
  downloaded from https://huggingface.co/ggerganov/whisper.cpp.
- **Anime4K** shaders v4.0.1 — MIT, Copyright (c) 2019 bloc97, https://github.com/bloc97/Anime4K. Used by mpv's `glsl-shaders`.

- **Silero VAD** model for whisper.cpp (`ggml-silero-v6.2.0.bin`, 885 098 bytes) — MIT, https://github.com/snakers4/silero-vad,
  ggml conversion https://huggingface.co/ggml-org/whisper-vad; downloaded when voice-activity detection is first used and checked
  against a fixed size and SHA-256.
- **AutoEq** headphone correction files — MIT, https://github.com/jaakkopasanen/AutoEq. Only the ParametricEQ.txt text format is read;
  files are chosen by the user.

## Fonts (bundled)

- **Atkinson Hyperlegible Next** (Braille Institute), **Lexend** (Bonnie Shaver-Troup, Thomas Jockin, Santiago Orozco, Hector Gomez)
  and **OpenDyslexic** (Abbie Gonzalez) — SIL Open Font License 1.1, through the `@fontsource` packages.

## Native components added in 1.9.0

- **notify** (file-system watching) — CC0-1.0; **tauri-plugin-notification**, **tauri-plugin-global-shortcut**,
  **tauri-plugin-autostart** — Apache-2.0 or MIT (the Tauri project).

## Services and data

- TMDB API — https://www.themoviedb.org/documentation/api. This product uses the TMDB API but is not
  endorsed or certified by TMDB.
- Open Library, Project Gutenberg, LibriVox, Internet Archive, Radio Browser, OpenSubtitles,
  Art Institute of Chicago, The Metropolitan Museum of Art and Wikimedia Commons are used through their
  public APIs; their terms apply.
- Where-to-watch data comes from **JustWatch** through the TMDB API; JustWatch must be named wherever it is shown (Luna does).
- The Internet Archive's availability API (https://archive.org/wayback/available) is used only when "Open archived copy" is pressed.
- **AniList** (https://anilist.co, GraphQL API) and **AniSkip** (https://api.aniskip.com, community data) are asked for a show's MyAnimeList id and for opening/ending times only when "find opening and ending times for anime" is switched on; the show's name, the episode number and its length are sent.
- Google Gemini is used only when the user supplies their own API key.
- SponsorBlock data (https://sponsor.ajay.app, database license **CC BY-NC-SA 4.0**) is used only when
  "skip non-music parts of YouTube songs" is switched on; only the first 4 characters of the video id's SHA-256 are sent.
  Because of the non-commercial license, do not ship a paid build with this switch available without asking the SponsorBlock authors.

Luna Player does not include any films, books, music, streams or search sources. Only open content you have
the right to use.
