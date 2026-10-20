## 1.0.1CC — 2026-10-20 (beta)

- **Assistant:** no film page for taste remarks ("vampir konusunu sevmiyorum" was read as "konusu"), none twice for a film already shown, and the one-film page only when a film was asked for.
- **Header:** fits on 1920 px screens again with its labels; on narrower windows the labels fold step by step and the tabs fade at the edge when they scroll.
- **Music:** turning shuffle off restores the original order; the end of a playlist rewinds and pauses (play starts it again); a YouTube link that can't be read also stops the sound.
- **Books:** comic (CBZ) pages are freed as you read (memory no longer grows); arrow / Page keys turn pages even after clicking the Aa or contents buttons.
- "İnik değil" tooltip reworded.
- Notebook: the version rules are kept, rules can't be deleted; Gemini (G) added to the model letters.
- Fixes found by DeepSeek (see `deepseek tarafından bulunan hatalar/BULGULAR.md`), checked and the header fix reworked by Claude Code.

## 1.0.0D — 2026-10-19

- **Settings › General now shows the app version** (`1.0.0D`).
- Version format: `MAJOR.MINOR.PATCH` + the letter of the AI model that made the last change
  (`D` DeepSeek, `C` ChatGPT, `CC` Claude Code, `Q` Qwen, `K` Kimi). Each new model round bumps the number.
- Single version source: `app/src/version.ts`; `package.json`, `tauri.conf.json` and `Cargo.toml` follow it.
- Remaining audit fixes, packaging and release workflow updates from the 0.3.0 cycle.
# Changelog

## 0.3.0 — 2026-10-19

A large correctness and packaging release.

### Player and library

- Fixed "continue watching" saving several seconds behind, and saved the final position on exit.
- Fixed `1920x1080` being read as a release year (posters/summaries now match).
- Fixed the external-subtitle key overriding an embedded subtitle on every launch.
- Fixed lost-file re-linking through a torrent using a stale library snapshot.
- Fixed subtitle nudge keys/buttons using stale state (G/H, +/−).
- Fixed the cancelled sleep timer leaving the video paused.
- Throttled seek-bar dragging; final seek on release.
- The preview worker is always stopped before a file is deleted or moved.
- "Finished" now uses one threshold (95%) across the home row, menus and the player.

### Books

- Audiobooks are visible to the assistant and on the books home ("Recently listened audiobooks").
- A corrupt EPUB can no longer panic/abort the whole app (`percent_decode` is byte-safe, with a test).
- CBZ blob URLs are revoked; PDF documents/workers are destroyed.
- EPUB "two pages" no longer reloads the whole book.
- CBZ page numbers cannot go negative; loaded pages are clamped.
- CBR files are no longer advertised as downloadable (RAR is not supported).
- A failed book deletion no longer clears the reading record first.

### Music and assistant

- YouTube playlist requests now search smarter (punctuation, artist/title, relevance checks), fill missing
  entries with the artist's other real tracks, and show a preview before creating the playlist.
- The assistant opens the new playlist and closes itself; Alt+A toggles it.
- Song links (`play_song`) and the "add to library and play" card are restored.
- The assistant prompt no longer includes an unbounded film library (first 400 entries).
- Playlist/reminder/title removals respect the year; duplicate recommendations are avoided.
- Undo only reverts the assistant's own changes, not later manual edits.
- Empty/one-letter note deletion can no longer wipe every note.
- Conversations are separated by song/book/film context instead of one endless chat.

### Packaging

- Setup (NSIS) and portable zip builds, GitHub Actions release workflow.
- GPL-3.0 license, third-party notices (mpv GPLv2+, yt-dlp Unlicense, fonts OFL).
- Build documentation for fetching mpv and producing both packages.

## 0.2.3 and earlier

See the git history and the previous GitHub releases.
