<p align="center">
  <img src="logo/luna-icon-256.png" width="96" alt="Luna Player logo">
</p>

<h1 align="center">Luna Player</h1>

<p align="center">
  A good-looking video player for your films and series.<br>
  It organises your collection, helps you decide what to watch, and plays almost anything.
</p>

<p align="center">
  <a href="releases/latest"><b>⬇ Download for Windows</b></a>
</p>

## What it does

**Your films, nicely organised.** Point Luna at the folders where you keep your videos. It recognises each film and
series and adds posters, summaries, cast and trailers, so your collection looks like a streaming service.
It remembers where you stopped.

**Plays almost anything.** Luna is built on [mpv](https://mpv.io), so nearly every video format just works.
If a film has no subtitles, Luna finds them for you.

**Helps you choose.** Like or dislike what you watch and Luna learns your taste. Add the films your friends
recommend, or connect their Letterboxd, and see everything in one place.

**A film assistant you can talk to.** Ask things like *"What should I watch tonight?"* or *"Who's in Dune?"*
and get answers with posters, cast and links.

**Open links and torrents.** Like VLC's "Open network stream": paste a video link (http, m3u8, rtsp…), a magnet
link or a `.torrent` file, and Luna plays it. Torrents start playing while they download, and Luna finds the
title, poster and subtitles for you. Press **Ctrl+N** or just paste a link into the window.

**Sharper picture with AI upscaling.** If you have [Lossless Scaling](https://store.steampowered.com/app/993090/Lossless_Scaling/)
(a paid app on Steam), Luna can switch it on for you while a video plays: AI and FSR upscaling make lower-resolution
videos look sharper on big screens, and AI frame generation makes motion smoother. Subtitles stay crisp on top.
Press **Q** in the player or use the **UP** menu.

**And more:**
- A first-run check that tells you if anything is missing, with download links
- Hide posters of films with disturbing content (optional)
- English and Turkish (change it in Settings)

## Getting started

1. Download **`Luna Player_…_x64-setup.exe`** from the [Releases](releases/latest) page and run it.
   It works on Windows 10 and 11.
2. If Windows shows *"Windows protected your PC"*, click **More info → Run anyway**.
   This appears because Luna is a small free project without a paid code-signing certificate.
3. A short tour shows you around on first launch.

### Portable version

There is also a **`Luna Player_…_x64-portable.zip`** on the same Releases page. Extract it anywhere and run
`Luna Player.exe`; it keeps its data in the same folder and needs no installer (WebView2 must already be on the
computer, which is the case on Windows 10/11).

### Optional: free keys for the extra features

Luna plays videos without any setup. For posters, the assistant and subtitle search, add these free keys in **Settings**:

| Key | Unlocks | Get it here |
|---|---|---|
| TMDB | Posters, summaries, cast, recommendations | [themoviedb.org](https://www.themoviedb.org/settings/api) |
| Gemini | The film assistant and translations | [aistudio.google.com](https://aistudio.google.com/apikey) |
| OpenSubtitles | Automatic subtitles | [opensubtitles.com](https://www.opensubtitles.com/consumers) |

Your keys and your library stay on your own computer.

## Handy shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Skip back / forward |
| Mouse wheel | Volume |
| F or double-click | Full screen |
| S | Subtitles |
| Ctrl+N | Open a link |
| Q | AI upscaling on / off (needs Lossless Scaling) |

## For developers

Want to build it yourself or help out? See [BUILDING.md](BUILDING.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
The source is the whole repository: React/TypeScript in `app/src`, Rust/Tauri in `app/src-tauri`.

## Please use it responsibly

Luna is a player: it doesn't come with any content, sites or search sources. Only open and download videos you
have the right to watch. Downloading copyrighted material without permission is illegal in many countries.

Friends' Letterboxd lists are read from their public Letterboxd pages. This is not an official Letterboxd feature.

## License

Luna Player is free and open source under the [GPL-3.0](LICENSE) license.

The source code is this repository. Contributions are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md) first. The installers include GPLv2+ mpv and Unlicense yt-dlp binaries; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for their licenses, source links and the shipped copyright texts.

This product uses the TMDB API but is not endorsed or certified by TMDB.
The installer includes [mpv](https://mpv.io) ([license](https://github.com/mpv-player/mpv/blob/master/Copyright),
[source](https://github.com/mpv-player/mpv)), built by [shinchiro/mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake).
Lossless Scaling is a separate product and is not part of Luna.
