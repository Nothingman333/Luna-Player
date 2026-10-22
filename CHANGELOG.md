## Unreleased — assistant and browser review (bug fixes and small improvements, not yet released)
- Assistant (Web part): a question or a refusal about the page ("do not translate this page", "is the translation right?", "what is the original price?") no longer translates the page or undoes a translation; only plain commands do, with the right language direction ("from German into English") and the interface language as the default.
- New exact commands `/çevir [language]` and `/orijinal` (listed first in the Web part and in `/help`); slash commands also work with Caps Lock ("/SETTINGS").
- Page reading: a list of articles, an article before the main content, a page wrapped in one form, a huge menu or inline tags no longer give wrong, empty or fragmented text; headings, list items and table rows are marked. Form values stay unread.
- The assistant also sees what the user selected on the page (never from a field), the page language and whether the page was still loading; page data passes a whitelist, and the end of the page block carries a one-time token.
- Native page-read errors are explained in the interface language; the translate tool's default target follows the interface language.

## Unreleased — review pass (bug fixes and small improvements, not yet released)
- Bulk relink: a root folder containing Turkish "İ" no longer produces a broken new path; the preview also finds records whose path lives only in a storage key (book positions, playback preferences); summary line plus "Select found" / "Clear selection".
- Books: saving details without a cover (or picking a candidate with none) keeps the book's own cover; the cover field is only an override with a "use the book's own cover" button; "Select books on this shelf" in the shelf editor; quotation count; the quotation export no longer fails on a damaged tag record.
- Web translation: status and error texts follow the interface language; a page that rejects the finished translation no longer offers a retry that cannot succeed.
- Letterboxd changes: a title without a year matches the same title with a year, like the list merge does.
- Notebook: entries are validated before they are written; search box in the scene / word notebook.
- Settings: the panel no longer slides sideways in narrow windows; relink rows keep their checkbox beside the path.
- Every interface text has English again (`node scripts/i18n-check.cjs` passes).

## 1.6.0CC — 2026-10-22 (beta)
- Books and music get the films' full taste profile in a "My taste" tab (taste map, weights, genres/authors/artists, rating spread or listening hours, most played, gaps).
- Songs: thumbs-up / thumbs-down on every row and "out of 10?" after a vote; the points feed the music taste.
- Liked or disliked books and songs get six-topic scores and genres from the AI once (twenty per message, only new ones, "Measuring…" while it runs); films unchanged.
- Own Letterboxd updates itself daily and follows changed or removed ratings and hearts; missing genres from TMDB; update button on the taste profile.
- Same tab order in every part; the assistant shows a song playing on another part's page and lets you pick it or a general chat.
- "Find songs like this" opens a songs card (new list or grow an existing one); reader music popup has a volume drop-down and popups fade out.
- Luna Analiz: settings, Stop and the running button in order; smoother reading animation. Big player: the assistant stays above the timeline; mouse back closes it.

## 1.5.4CC – 1.5.2CC — 2026-10-22 (beta, tried with Luna Dev.cmd)
- Separate book and music taste, own lists only in "+ Add to list" with a new list, friends' lists read-only, picture gallery, poster preview, share/import lists, podcast fixes.

## 1.5.1CC — 2026-10-21 (beta, not built yet: try it with Luna Dev.cmd)

- Luna Analiz: real half stars; similar titles open their page; Luna-style switches; (i) explains My taste; a settings button (how many reviews, spoilers in or out); the Settings card restyled.
- "+ Add to list": lists grouped under each friend, with search.
- Recommendations: "All films" for a friend (all their lists and picks in one wall).
- Your taste profile: taste map, weights and where they come from, avoided topics, genres, rating spread, what stands out in liked titles, trends across analyses, how generous you rate, gaps, latest analyses.
- Books: Luna Analiz reads 1000Kitap reviews; "In-depth review" asks the assistant for reviews, videos, essays and thinkers' readings with sources.
- Music: volume in the big player; "Liked" always first; playlists get a picture from their songs; Spotify import can be stopped or cancelled; "playlist of songs like this".
- Assistant: a bubble at the bottom right (hidden while a film plays), minimise button, right-click Copy / Ask on selected text (and Cut/Copy/Paste in text boxes), "/" commands with /help that work with every AI, a tool-less retry for models that reject tools.
- .m3u / .m3u8: IPTV lists open as a channel list; HLS streams play directly.

## 1.5.0CC — 2026-10-21 (beta, not built yet: try it with Luna Dev.cmd)

- **"Worth watching?" is now Luna Analiz**, laid out like the rest of the details page: a plain section with Luna's headings, chips and the mode's colour instead of a boxed card. Big "For you" score next to Luna Analiz, review tone, TMDB and Letterboxd; agreement with bars; praise and criticism; topics with score bars.
- **Long reviews are read whole:** Letterboxd cuts long reviews short in its lists (about 470 characters); Luna now fetches the rest. In the feed they open with "Read more"; spoilers stay hidden behind "show".
- **My taste (was "Preferences")**, built like the shared review-analysis app: the importance you set counts 35%, the topics you marked as reasons in titles you liked count 65%, the reasons for dislikes pull a topic down. The "For you" score blends the community score with these, and says why ("Pace is very strong, and it matters to you"). Each topic shows its effective weight, where it was learned from and this title's score; "Apply" takes the suggested importance.
- "After watching" (reasons, note, draft) and the local keyword scan are tidy fold-out sections under it.

## 1.4.9CC — 2026-10-21 (beta, not built yet: try it with Luna Dev.cmd)

- **"Worth watching?" › Letterboxd, live:** the reviews scroll into the card one by one as they are fetched. The AI then reads them in groups of ten: the group being read lights up, and each review gets its tone, topic and a one-line gist. Spoiler reviews stay blurred until clicked. "Stop" cancels.
- **A much more detailed analysis** (the method of the shared "review analysis" app):
  - AI score with what pulls it up and down, and a community score from the reviews' tone and depth plus the stars;
  - what most reviewers agree on, with shares, and where they split;
  - a critic's note, themes, feelings, who it is for, similar titles, a score per topic;
  - the positive / mixed / negative / no-stance split, and every review read, filterable by tone.
- **Taste learning:** each analysis keeps the topic scores. Once three analysed titles are liked or disliked, Luna suggests preference weights ("Apply"), shows "Fits your taste %", and the analysis and the assistant use it.
- **API profiles** (Settings › Accounts and keys): save several services with their own key, model and base URL (up to 8). The assistant and the review analysis can each use a profile. Keys stay in Windows' credential store.
- "Worth watching?" is now also on Discover and recommendation pages.

## 1.4.8CC — 2026-10-21 (beta)

- **AI connection fixed:**
  - OpenAI and Claude sometimes failed with "Couldn't reach the assistant … error sending request".
  - The cause: Luna checked the servers' certificates only against the list built into the program, and those servers now also use a newer issuer that the list lacks.
  - Luna now also trusts Windows' own, always up-to-date certificate store.
  - The error message now shows the real cause (certificate, timeout…).

## 1.4.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **"Worth watching?" › Letterboxd + AI:** one button fetches the film's most popular Letterboxd reviews (50 by default) and has an AI sum them up for you:
  - the overall feeling, a "for you" paragraph from your preferences, what is praised and criticised, "you'll like it if / skip it if", and a note per topic;
  - the average star rating and the number of spoiler reviews;
  - the same reviews also go to the local keyword scan.
  The AI is told not to reveal spoilers and to use only what the reviews say.
- **Settings › Accounts and keys › Review analysis:**
  - its own AI (Gemini, OpenAI, Claude, a base URL, or the same as the assistant) and model;
  - how many reviews to fetch (10–100);
  - an extra instruction.
  It uses the keys already entered for the assistant.
- Letterboxd turns away Luna's own connection on review pages, so they are read with Windows' built-in curl.exe; the film is found by its TMDB id, or by title and year.

﻿## 1.4.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **"Worth watching?" workspace** in film/series details (library and the assistant's film card):
  - paste or import reviews (TXT/JSON);
  - a local keyword scan by topic: story, pace, acting, visuals, characters, music. The community score and your own signal stay apart.
  - film and series preferences, mood weights and warnings;
  - like/dislike with reasons, a history of 8 scans, and a review draft from your notes;
  - JSON export.
- **Music:**
  - pausing while a YouTube link resolves keeps it paused;
  - stale retries and skips can no longer start another song;
  - a bad start index is clamped.
- **Read aloud:**
  - volume and mute in the bar;
  - the assistant's volume and mute commands reach the reading voice;
  - bad speed or voice settings are cleaned;
  - a voice error stops reading instead of skipping text;
  - no restart after Stop.
- **Books:**
  - notes are kept per file, so two editions don't share notes. Old notes are kept and can be copied on request.
  - a failed save keeps the editor open and shows an error;
  - broken notes can't crash the reader;
  - a stale book search doesn't show old results.
- **Dependency:** @xmldom/xmldom 0.8.15 for epubjs (npm audit: 0).
- **Checks:** 32 more regression tests (`npm run test:next`), also in CI.

## 1.4.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Fixes package (B01–B36):**
  - Backup and restore: a wrong-shaped backup, a full storage or a failed save no longer wipes or half-restores data.
  - API keys: saving and deleting a key now waits and shows an error when it fails.
  - Collections: same title in two years, the chosen episode, the right book, YouTube songs, renames and a slow search after a delete.
  - Updates: beta and auto-check switches respected; a retry after a failed download works.
  - Read aloud: pause, speed, voice, stop at chapter end and resume; only listened time counted.
  - YouTube: a broken direct link falls back instead of looping.
  - Letterboxd: real addresses only; remakes kept apart; star values checked; posters not mixed up.
  - Torrents: cancelling no longer deletes files.
  - Wikisource: safe decoding, valid long chapters, and a failed chapter stops the save.
- **Library:**
  - Sort by A–Z, year or rating; filter by genre, unmatched or several copies.
  - Collection search.
  - Letterboxd lists: friend-rating filter and a link to the list.
- **Checks:** 37 regression tests (`npm run test:regression`), also run by CI.

## 1.4.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Small window:** leaving full screen (or playing in a small window) no longer blows the window back up to the size of the screen. 1.4.3 checked "is the window inside the screen?" on every resize, and leaving full screen briefly reports a screen-sized window; the check now runs once, when Luna starts.

## 1.4.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Same look on every screen:** on screens narrower than 1920 points (e.g. Windows scaling 125% or 150%) Luna zooms out a little, so text, spacing and the top bar sit as on a 1920-wide screen (Settings › "Fit the layout to the screen"). The top bar's labels fold away step by step only when the tabs don't fit.
- **Above the taskbar:** a window that was restored taller than the screen is shrunk and moved back into the space above the taskbar (the assistant's input was hidden under it). Luna opens full screen the first time on a machine.
- **Full screen:** the ⛶ / ✕ buttons wake only at the very top edge, so they no longer cover the "Recommendations" tab.
- **Assistant:** opens as the big workspace (Escape shrinks it only for the moment); the small bubble has the same ⋯ menu by each title (Watched, Liked, Disliked, Watch later, Trailer) instead of the old tick box.
- **Assistant with OpenAI / Claude / base URL:** a message mentioning Letterboxd is no longer pushed to the "film links" tool; the assistant is told the addresses of your own and your friends' Letterboxd (it can read them again with read_link) and what data it has (notes, diary, lists); trivia questions keep Luna's tools (no Google search outside Gemini); a required tool is the only one offered.

## 1.4.2CC — 2026-10-21 (beta)

- A clean rebuild of 1.4.1's code (every build file made anew); checked that the interface inside the program is byte for byte the one Luna Dev runs.
- GitHub: every push and pull request is built and tested (CI), and each release is checked live (downloads, checksums, the updater's latest.json); the services Luna uses are checked daily.

## 1.4.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Letterboxd › all their films:** a friend's whole "Watched" list comes in as its own tab (before, only the films they rated 4★+ did); friends connected earlier get it on "⟳ Update". A person with only Letterboxd lists opens on them, not on an empty "Recommendations" tab (that tab only shows when someone typed a recommendation for them).
- **Hide what I watched:** if Luna doesn't know yet what you watched, it says how to connect your own profile ("This is my profile").

## 1.4.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

From testing with a friend.

- **Home › where are your films?** With no library folder yet, the home screen asks for one right away ("Choose film folder" / "Choose series folder" open the folder picker). Before, the button only led to the Folders page.
- **Folders › films and series apart:** the Folders page has "Film folders" and "Series folders", each with its own add button; a folder can be moved between the two. In a series folder each show is its own folder, a "Season 2" / "Sezon 2" folder is the season, and "03 - Pilot.mkv" or "Bölüm 3" is the episode, even without S01E03 in the name.
- **The same film twice:** copies of one film (a 1080p and a 4K, or two file names TMDB matches to the same film) sit side by side in the grids and the poster says "2 copies". The details page lists every copy with its quality, subtitles and size; the chosen one is what Play plays (the last watched copy first).
- **SRT next to the quality:** a video with a subtitle file beside it ("Film.srt", "Film.tr.srt") shows "SRT" next to 1080p / 4K on the cards and the details page.
- **Rename a file in Luna:** right-click › "Rename file…" renames the video on disk; its subtitle files get the new name too, and where you stopped, its quality and "finished" stay. The assistant can do it as well ("rename that file to Alien (1979)"), asking first.
- **Full screen:** F11 now also works on the library screens (before only during a film), and each time Luna goes full screen, at start too, a small note at the top left says "Full screen · F11 to leave" for a few seconds.
- **Collections window:** the posters behind showed sharply through the glass. The page behind is now blurred, as under the assistant.
- **The assistant's AI:** besides Gemini, OpenAI, Claude, or any OpenAI-compatible server at a base URL (OpenRouter, Groq, DeepSeek, a local Ollama / LM Studio without a key). Settings › Accounts & keys: pick the service, the key and the model (the list is loaded from the service). All of Luna's tools work with them; Google Search stays Gemini-only, so such answers are marked "no sources".
- **Letterboxd:**
  - the link box takes a user name, "@name", "letterboxd.com/name" or a full link (a page with a query or a "www." no longer fails); an unknown user says so;
  - while a profile is read, a card shows what is being read ("Watched: page 3 · 214 films", "List 4/12…") and for how long, instead of a silent wait of a minute or two;
  - "This is my profile": your own watched films (with your stars), likes and watchlist are saved in Luna (the diary and "Watch later"), and "⟳ Update" refreshes them;
  - "Hide what I watched" on friends' recommendations and their Letterboxd lists hides the films you already watched (ticked, rated or on your Letterboxd); it remembers the choice.
- (Dev: the browser mock can add folders, rename, read Letterboxd with progress and answer as OpenAI / Claude.)

## 1.3.9CC — 2026-10-21

- **Books › no second copy:** a free book that is already in the library (asked for from the open-libraries row or by the assistant) is opened from the library instead of being downloaded again as "… (2).epub". Its card says "In your library · read".
- **Audiobooks › only audiobooks:** the most-listened row showed LibriVox's cover-art picture sets ("Thumbs 12", "LibrivoxCDCoverArt…"); only recordings are listed now, and a book read more than once shows its most listened reading (a search still shows every reading).
- **README:** new pictures (music, books, the assistant asking which one) and the text covers music, books, collections and updates.

## 1.3.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

Bug pass.

- **Header › all tabs on a laptop:** at 1280–1400 px wide the seventh film tab (Öneriler) was cut off and hidden. The tabs sit closer there and "Dosya aç" keeps only its icon (with its tooltip), so all of them fit. On narrower windows the tabs still slide sideways, but now the mouse wheel moves them, a fade at the edge shows more are waiting, and the open tab is brought into view (before, with no scrollbar, some tabs couldn't be reached by mouse).
- **Music › a song that won't open:** a missing or broken file left the bar at 0:00 showing "Pause" as if playing, and the queue stopped there. Now it is skipped after the "couldn't open" warning, and the next song plays. After 3 in a row (for example a drive unplugged), or at the end of the queue, Luna stops and pauses instead of running through the rest. A radio station that fails just stops.
- **Player › panels:** the Upscaler panel stayed open under the audio/subtitles or video-settings panel and the two overlapped. Now opening one closes the others, and the Upscaler panel closes on a click outside it like the rest.
- **Player › Esc:** with a panel or menu open, Esc closed the whole film. Now the first Esc closes the panel, the next one leaves the film.
- **Esc closes windows:** Esc now closes the window on top everywhere, as a click beside it does. Before, many didn't close on Esc (open link, subtitle search, confirmations, the music link…). A window over the film or a book closes alone; the film keeps playing.
- **Reader › comics in Luna Dev:** CBZ comics stayed on "…" and never showed a page in the development build (React's double mount left a "closed" flag set). The installed build wasn't affected.
- **Reader › Esc in the search box:** closes the panel now (a note being written is still not thrown away by Esc). The contents button opens on the contents again, not on the last search.
- (Dev only: the browser mock can now deliver events and acts as a small mpv, so playback can be tried there.)

## 1.3.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › no release file name:** the library step no longer shows a film's release file name ("Dune.Part.Two.2024.1080p.mkv"); it says "Filmler klasörü taranıyor…" instead.
- (Checked: the tour's posters show without a TMDB key, since TMDB's image server needs none; only an internet connection.)

## 1.3.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › real posters:** the films the scenes name show their own posters (Prisoners, Zodiac, Dune 1984, Blade Runner 2049 on the picture-quality step), and with an empty library (a first run) well-known films fill the shelves. Shown from TMDB's image server like the library's, nothing copied into Luna. None on the torrent step, and the content-warning step uses no real film.
- **TMDB credit:** the notice TMDB's API terms ask for is in Settings › General (under the version) and a small "posters from TMDB" line sits under the tour's step counter.

## 1.3.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › the whole of Luna for someone new:** 16 steps now. Added: Picture quality (Lossless Scaling driven by Luna: a sharp/soft split moving over a picture, 60 → 120 FPS, subtitles kept sharp; Q and the UP button), History and safety (one history of films, songs and books, a backup in one file, signed updates) and Shortcuts (Alt+A for the assistant first, then Ctrl+O, Ctrl+N, Space, F, ← →, Ctrl+→, Alt+←, Esc, lighting up in turn). The film assistant step now sits with the film steps.
- **Tour › Alt+A:** both assistant steps say the assistant opens from any screen with Alt+A.
- **Tour › what's new:** the short tour for people who saw the old one also gets History and safety and Shortcuts.

## 1.3.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Tour › the whole of Luna:** the first-run tour now shows all of it, 13 steps: a new welcome (the three parts circling the mark), "Film, Müzik, Kitap" (the switch moving between the parts in their colours), Music (synced lyrics lighting up, the music bar, radio / podcasts / likes), Books (a page read aloud word by word, Gutenberg / Vikikaynak / LibriVox), the assistant everywhere (the "Hangisi hakkında?" chooser, a web search, ready questions) and Collections (research steps, the confirmation card with ticks, "Çıkması bekleniyor"). Music and Books slides take their part's colour; new steps carry a "Yeni" badge.
- **Tour › what's new, once:** someone who saw the older tour gets a short "Yenilikler" tour of only the new steps the next time Luna opens. Settings › "Tanıtımı göster" still shows the whole tour.

## 1.3.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › from the "now playing" screen:** the assistant opened over the full song screen is about the song: it comes first in the chooser (picked), the header shows its name and the ready questions are about it.

## 1.3.2CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › two things open at once, you pick:** the assistant now sees everything open at the same time — the film or episode playing, a film page, a book in the reader or its page, the song, radio or audiobook playing — in every part of Luna. When two or more are open, a small "Hangisi hakkında?" row above the message box lets you pick which one the chat is about ("bu", "bunu" then mean that one); it appears only then. A message that names one ("çalan şarkı…", "izlediğim film…") picks it by itself.
- **Assistant › the song in the film part:** with only a song playing, the film part's assistant knows it too (before, only the music part did).

## 1.3.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections › a book added by hand finds your shelf:** a book typed into a collection ("＋ Ekle" › Kitap) that is already in your library is matched to it (its full title, cover and author), so it opens from the collection.

## 1.3.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Music › the bar is whole again:** the heart had a column of its own in the music bar, so the lyrics button, the volume and the close button were pushed onto a second row out of sight and the controls sat at the right edge. The heart now sits beside the song; the controls are in the middle and the volume is on the right again.
- **Music › narrow window:** the volume stays (shorter) instead of disappearing; only the lyrics button is hidden.

## 1.2.9CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections › no more see-through layers:** while the big assistant is open over the collections, the collections page waits hidden behind it (two glass panes showed through each other); it is back when the assistant closes or shrinks.
- **Collections › the real music bar:** instead of the small bar of 1.2.7, Luna's own music bar (seek, volume, shuffle, repeat, like) shows over the collections page while music plays, and the page moves up to leave it room.
- **Collections › the Google button** shows Google's coloured "G" instead of a plain letter.

## 1.2.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › an existing collection first:** asked for a collection on a subject you already have one on ("Dune" → "Dune Evreni"), the assistant makes nothing new: it says you have it (and what's in it) and offers to look again for new and missing things. A "yes" (or "look again / update" in the request) searches the internet again and adds only what the collection doesn't have yet to the same collection; if nothing is new it says it's up to date.

## 1.2.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections › the assistant opens over the page:** "find", "what is it about", "let the assistant add" no longer close the collections; the assistant (big or small) opens on top and closing it brings you back. Esc closes the assistant first.
- **Collections › buttons instead of words:** each row has small buttons: play / read / download, **G** (search it on Google), the YouTube trailer (films and series) and ✦ (let the assistant find it). The right-click menu has Google and the trailer too.
- **Collections › add by hand:** "＋ Add" (and "Add by hand…" in Edit) opens a small form: film/series, song or book, its name, year / artist / author and a note. A song is looked up on YouTube so it plays; a film in the library is joined to it. A new empty collection opens with the form ready.
- **Collections › music plays with the page open:** a song plays with the collection's other songs after it, and a bar at the bottom of the page shows what's playing (previous, pause, next, "Go to music").
- **Menus and the small assistant stay sharp and on top:** they were inside the part of Luna that a full-screen page blurs, so the Edit menu came up blurred behind the collections. They now open above everything.
- A book or a film opened from anywhere (the assistant too) closes the collections page, so it doesn't stay on top of the reader or come back after the film.
- **Subtitles:** a failed OpenSubtitles search or download is tried four times (a short wait between) before the error is shown; a wrong key or the daily limit is shown at once.

## 1.2.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collection films checked on TMDB:** before the confirmation card every film is looked up on TMDB; when it belongs to a series (Dune: Part One → Dune Collection) the series' missing films are added, the newest and the announced ones too. A film whose date is still ahead is marked "Expected: <date>"; one whose date has passed but isn't marked released is searched by name on Google ("has it come out?") and is added as out or as expected by the answer.
- The internet research before a collection follows the same rule for announced films.

## 1.2.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections are researched on the internet first:** before making a collection the assistant runs a Google search for the subject (every book, every film and series with its release status, the best-known soundtrack pieces) and builds the list from that, not from memory, so new films and books are in. Announced but unreleased ones are added with "coming: <date>". If the search can't be used, nothing from memory is passed off as a search.
- **The assistant knows today's date** (it's in every request now), so it knows its own knowledge may be older than what has come out.

## 1.2.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections follow your words first:** "the new films" means only the new adaptations (no old ones), "films" means no series, a director, year or genre narrows it; it is complete only inside what you asked for, and the songs come only from what made it in.
- **Collection confirmation has ticks:** every film, song and book on the card has a checkbox (all ticked); untick what you don't want and only the rest is saved. The count per group shows how many are kept, and the assistant is told what you took out so it doesn't claim or suggest them again. Unticking everything is the same as Cancel.

## 1.2.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections are complete:** unless you set a limit, a collection now holds every book of the series or universe (in order, other authors' sequels and prequels too), every film and series adaptation (old ones, miniseries, spin-offs; nothing unreleased), and for each of them the 3–5 best-known soundtrack pieces one by one with their composer (not album names), so they play. For any subject, not only Dune.
- Songs and free books for a long collection are looked up six at a time (up to 80 items) instead of all at once.

## 1.2.2CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collection confirmation names everything:** before saving, the card lists each film, song and book by name (with year or person and the assistant's note), grouped, instead of only "2 films, 2 songs, 2 books".

## 1.2.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections, fixed again:** a collection request that also mentioned "soundtrack" (or another behind-the-scenes word) was sent to a Google search, which has none of Luna's tools, so the assistant said it couldn't make the collection. Only the exact spelling "koleksiyon" was caught before; now typos ("koleksion"), lists and any "make / add / gather / download / take me" request always go to Luna's tools.

## 1.2.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › take me there (new):** "take me to Discover", "open the radio", "show my collections", "my history", "settings"… the assistant closes and Luna opens that page in the right part (film, music, books).
- **After making a collection** the assistant closes and the collection opens, so you see it at once (the answer stays in the chat).
- The assistant's working steps are back as before (each shows at once; no waiting at the end).

## 1.1.9CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › collections, fixed:** since 1.1.7 a request with Luna's tools failed (the collection tool's nested list was likely refused by Gemini), so the assistant answered without tools and wrote the collection out as text without saving it. The tool now takes plain lists ("Name | year or person | note"). If the tools still fail, the note under the answer says so with the real error ("Luna's tools couldn't be used, nothing was done …") instead of "Google search couldn't be used", and the assistant no longer pretends it did something.
- **Collections keep names and join what can be had:** films and books not on disk are saved by name; songs are looked up on YouTube so they play from the collection; for books a free edition is searched (Vikikaynak, Project Gutenberg): the item then says **Download**, and a click brings it into the library and opens it. Nothing is downloaded without that click.

## 1.1.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Books › Discover › Vikikaynak (Turkish, new):** Turkish works out of copyright from Turkish Wikisource (Sabahattin Ali, Ömer Seyfettin, Halit Ziya, Nutuk…), legal and free. Luna turns the work's pages into an EPUB with chapters and a contents list (long works take up to a minute).
- **The assistant looks in every free source at once:** Project Gutenberg, Vikikaynak and the catalogs you added, then shows the best match on the "Is it this one?" card with where it was found. If nothing free has it, it says so and doesn't point to pirate sites.
- **Assistant:** asking for a collection with "soundtrack" in it no longer turns into a web search that only writes the list as text (it really makes the collection now); while it gathers a collection, the film reel, sound bars and page-flip animations play in turn; each step stays on screen a moment (the work itself isn't slower).
- Ready questions are ordered longest first so the chips fill the rows tidily, in both languages; the assistant's welcome text fits the part you're in (music, books).

## 1.1.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Collections (new, in every part):** the new "Collections" button in the top bar. A collection keeps films, songs and books around one theme, e.g. ask the assistant "make a collection about Dune: the films, the music, the books". They don't have to be in your library: what is opens with one click (Play / Read), the rest says Find and the assistant looks for it. "Add to a collection…" in the right-click menu of films, songs and books; rename, delete, remove an item, "have the assistant add to it". The assistant asks before it makes or changes one, and Undo works.
- **One history:** the same window has a History page: films (each sitting of more than a minute, with how far you got), songs and books together, by day, with Film / Music / Book filters; click to open again, right-click to remove, or clear it all. The assistant knows the last two weeks ("what did I watch yesterday?").
- New ready questions: a collection for a film you love / the book you're reading.

## 1.1.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Luna updates itself (new):** a while after opening (at most twice a day) Luna looks at its GitHub releases; when a new version is out a card at the bottom says "Luna 1.2.0 is ready" with **Update**, What's new, Later and Skip this version. Update downloads it, checks the signature, installs it and reopens Luna; your data stays. The portable zip and the developer build open the download page instead.
- **Settings › General › Updates:** check now, "Tell me when a new version is out", and **Get beta versions too** (off by default; turning it on warns that betas may have bugs and offers to back up first).
- The version number in Settings now really follows the changes (it had stayed at 1.1.1 since 1.1.1CC).

## 1.1.5CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Assistant › free books:** asking for a book that isn't in the library ("Suç ve Ceza'yı istiyorum") searches the free libraries with the page-turning animation and shows a card with the cover: "Is it this one?" → **Yes, save it** (downloads into the library) → **Read**. "Another edition" goes through the other results; a book already in the library shows Read at once; a saved book deleted later goes back to Save.

## 1.1.4CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **The assistant's ready questions:** "What is this film / series / book about?" (no spoilers) is now the first one on a film's page, in the right-click menus of films, series and books, and "What is the book I'm reading about?" in Books.
- Versions (fixed): the last number counts to 9, then the middle one goes up (1.1.9 → 1.2.0). 1.2.0CC was renamed 1.1.3CC.

## 1.1.3CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Books › delete on right-click, everywhere:** every book of the library (home shelves, "Continue reading", the library, the reading history, the cover on a book's page) now has "Delete the reading record" (where you were, like, rating, note; the file stays) and "Delete the file (to the Recycle Bin)", each asked first.

## 1.1.2CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Read aloud:** changing the voice while reading now switches at once (the pieces already prepared in the old voice were played first; leaving the book was needed).

## 1.1.1CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Read aloud › the best voices first:** the voice menu now lists Microsoft's newest voices first (Ava, Andrew, Emma, Brian: the 2024 multilingual "Copilot" voices), then the other new multilingual voices, then the voices made for novels; old copies and the children's voice are hidden. The book's own language comes first (at most ten, "Other voices in this language…" for the rest); the multilingual voices can read Turkish and other languages too.
- If Microsoft's service drops the connection (it does now and then when asked quickly in a row), Luna tries once more before switching to Windows' voice.

## 1.1.0CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Books › read aloud (new), with Microsoft Edge's natural voices** (as in Edge's "Read aloud"): the speaker button at the top of the reader, or Ctrl+Shift+U. The sentence being read is shaded and the word being said is marked, in step with the voice; the pages turn (or scroll) by themselves and it goes on into the next chapter.
- **Read from here:** select any text and choose "🔊 Read from here" (while reading: "Continue from here"). Without a selection it starts from the top of the page, or from where you stopped if that is on the page.
- **The reading bar:** previous / next paragraph, pause, speed (0.5×–2×, the voice keeps its pitch), voice (Emel or Ahmet for Turkish, the book's language first, multilingual voices, or Windows' own voice offline), sleep timer (15 / 30 / 60 minutes or the end of the chapter), close.
- Music pauses when reading starts, and the reading waits if you start music. Headset keys pause the reading. Changing the chapter from the contents or the search reads on from the new page.
- If Edge's voice can't be reached, Windows' voice reads on and the bar says so. The first time, the bar also says that the page's text goes to Microsoft's speech service, as in Edge.
- The time listened goes into the reading history (🔊). The assistant can start and stop it ("kitabı sesli oku", "okumayı durdur"); while a book is read aloud, "durdur / devam" are for the reading.
- Versions: a new feature now raises the middle number (1.1.0); fixes raise the last one.

## 1.0.10CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Book reader fixes:** the selection menu appears only after the mouse button is released and sits above the selected text (under it near the top), never over it. The reader now lives in the app's own layer: the small assistant shows over it, right-click menus work in it, and the big assistant blurs it (the text no longer shows through). The assistant button opens a menu: open the assistant, a spoiler-free recap, talk about the book, what to listen to while reading.
- **Music › Liked (new, like Spotify's Liked Songs):** ♥ in the player bar, Now playing and the reader's music panel, and in every song's menu. Library › "Liked" has songs and podcast episodes in two tabs, play / shuffle; it can't be deleted (a song leaves it when un-liked). A "Liked" card leads the lists on the music home and in Lists.
- **Music › History (new):** every listen, day by day with the time; remove one or clear all.
- **One song menu everywhere** (Discover, library songs, playlists, liked, history, most played, the player bar): the assistant's questions, play, play next, add to the end of the queue, like, add to a list, open on YouTube / Spotify or search YouTube, copy the link.
- **Discover:** switching country shows "Loading the … list" with placeholders.
- **Books › shelves (new):** All · Reading · Finished · Liked · Disliked · History. Liked and finished books also show on the books home. Books read from a link or "Open file" count too.
- **Reading history (new):** every sitting with a book is kept (day, time, minutes, from % to %), with the total reading time; remove one or clear all.
- The assistant also knows your liked songs and episodes, your listening history, books marked as read and your reading history.

## 1.0.9CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

The book reader in the approved Apple Books–style design:

- **Highlights and underlines** (EPUB): select text → yellow / green / blue / pink or underline, a note, copy, or "Ask the assistant" about the passage. A click on a highlight changes its colour, edits its note or deletes it.
- **Notes:** a note on a highlight, or on the page (the pencil at the top; also for PDF and comics).
- **Bookmarks:** the bookmark at the top right marks the page (filled when the page is marked).
- **One side panel:** Contents · Bookmarks · Notes (every highlight and note, newest first, click to go there) · Search (EPUB: every place the words appear, with the text around).
- **Ask the assistant** at the top: a spoiler-free reminder of the book up to the chapter you're in.
- **Themes and settings:** six themes (Original, Quiet, Paper, Evening, Night, Forest), text size, **brightness** (darkens the page; Windows' brightness isn't touched) and **warm light**, font, line spacing, bold text, scroll to read, two pages on wide screens.
- The top and bottom bars take the page's colours and fade while you read (a mouse move brings them back); the bottom shows the pages left in the chapter.
- Panels and menus close when you click anywhere else, in the book page too.
- Highlights, notes and bookmarks are kept per book on this computer (and go into the backup file).

## 1.0.8CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Music is fetched as sound only, always.** A song found by a YouTube search (Discover, Spotify lists) was left to mpv, which turned the search into a new entry without the audio-only settings and fetched the 1080p video too (the clip showed through behind the assistant, and it took ~4 s). Luna now finds every YouTube song's audio-only address itself (the search through YouTube's quick search service) and gives mpv only that: it starts ~0.2 s after the address is found. If Luna can't find it, mpv tries, still sound only; a film resets mpv to picture and normal quality.
- **yt-dlp folder build:** it starts in ~0.4 s instead of ~1.1 s for every song (the one-file build unpacked itself each time); a lookup went from ~2.4 s to ~1.6 s. Weekly self-update works with it. `scripts/fetch-mpv.ps1` and `package-portable.ps1` use it; the installer ships `mpv/yt-dlp/`.
- **Loading shows:** from the click until the sound starts, the song row and the player bar show a spinner and "Loading…" (the previous song pauses meanwhile).
- **Sooner starts:** a song is prepared after the mouse rests on it 0.12 s (up to four at a time); an opened playlist and the Discover chart prepare their first three.
- **Right click on played songs** (music home "Most played", the reader's "Recently played") and on recently played podcast episodes: remove from the list, copy the link, open in the browser (YouTube / Spotify page, or a YouTube search for a song found by name; the episode and its RSS feed).

## 1.0.7CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Serious fix: a song no longer opens as a video or lands in Films.** The music queue was briefly empty while mpv still had a song (opening a YouTube link cleared it first and then waited for YouTube); the app took that song for a film. Music is now also recognised by the addresses it was loaded from, and a YouTube link keeps the music going until its songs are ready.
- **Music and films:** starting a film pauses the music instead of throwing it away; when you close the film the song is back where it was, paused (no headset key starts it during the film). Live radio just stops.
- **Songs start sooner:** resting the mouse on a song (Discover, library songs, playlist rows, the reader's music panel) starts finding it, and a click while that runs waits for it instead of starting a second search.
- **Music › Discover:** a search box for songs and artists.
- **Podcasts:** in Now playing the tab is "About this episode" (the episode's own description and date) instead of lyrics; a recently played episode queues the rest of its show, so "Up next" has the episodes.
- **Book reader:** a ♪ button in the top bar opens a small music panel: what's playing with back / play-pause / next, and your lists, recently played songs and podcasts to start without leaving the book.

## 1.0.6CC — 2026-10-21 (beta, not built yet: tried with Luna Dev.cmd)

- **Podcasts:** the last episode of each show you listened to is remembered: "Recently played" on the podcast page and "Pick up your podcasts" on the music home page. A card carries on the episode where you stopped (with how much is left) and "Episodes" opens that show's other episodes; the episode you were on is marked in the list.
- **Books:** the "Continue reading" card has the book's backdrop (the painting found on its details page, else its cover), blurred and darkened, like the details page.

## 1.0.5CC — 2026-10-20 (beta, not built yet: tried with Luna Dev.cmd)

- **Music › Discover (new):** what's most played now in 16 countries (Apple's open charts, no account), songs of the artists you listen to most, and genre buttons that have the assistant make a playlist. Songs play from YouTube; nothing is downloaded.
- **Music library tabs:** Albums / Artists / Songs also show the songs from your Luna lists and the ones you've played from links, so they work without a music folder ("- Topic" / "VEVO" channel names become the artist).
- **Songs start sooner:** the next YouTube song's audio address is found while the current one plays (and the first one when a playlist page opens), so it starts at once; if that address fails, it's loaded the usual way without a warning.
- **Playlist page:** in a small window the page behind no longer shows through the song list (darker, more blurred).
- **Assistant:** "durdur", "devam", "sonraki", "önceki", "sesi kıs / aç / 40 yap", "karıştır", "ne çalıyor" act at once without asking the model (it used to say "stopped" without doing it); a new player_control tool covers other wordings. A song in a Luna list is found by title and artist in any order ("Duke Ellington Solitude") and plays inside that list; a song that's nowhere gets the YouTube card ("not in your lists, found it on YouTube": add and play, or just play) instead of "not found". Recommendations in films, music and books give both what's in the library and new finds outside it.
- **Copied links:** a Spotify, YouTube, Apple Music, podcast, torrent, video or book link copied in another program brings a small "Import / Close" note at the top for 30 seconds (from when Luna is in front); it can be turned off in Settings › General, and then the clipboard isn't read at all.
- **Podcasts:** a podcast link (RSS feed, Apple Podcasts, Spotify show) is recognised in the music link window: the show is followed and opened. The shows you follow are on the music home page.
- **Backup (Settings › Backup, new):** one file with your records, lists, notes and settings (not the media files, not the API keys); restore from it; buttons open Google Drive / OneDrive / Dropbox so you upload it yourself.
- **API keys** (TMDB, OpenSubtitles, Gemini) are kept encrypted in Windows' Credential Manager instead of plain text; an old plain copy is moved there and removed from Luna's settings and its state file.
- **Torrents carry on after a restart:** the engine remembers its downloads; they show in Downloads again and continue.
- **Unknown files:** a video added by hand whose name TMDB doesn't recognise gets a small "I couldn't recognise this file — write its name" card; nothing found again says it may not be a film.
- **yt-dlp updates itself** once a week in the background.
- **DeepSeek's findings (4 + 2):** "[REC] (2007)" / "[REC] 2" keep their bracketed titles; a font added later no longer overwrites one with the same file name; the Folders breadcrumb shows inside sub-folders again; quick ± clicks on the subtitle timeline add up; a subtitle's language from the server can't put the file outside the video's folder; deleting a finished torrent stops it first even when it plays as a local file. Also: an old "recommend" check in the assistant had a broken character and never matched.

## 1.0.4CC — 2026-10-20 (beta)

- The `Luna Player.exe` in the project folder finds the project's mpv again (videos play from it); since 1.0.2 it only looked beside itself.
- The project folder's Windows permissions were put back to normal: a tool had marked it "low integrity", so every program started from it (Luna too) couldn't write its settings and closed at once ("os error 183").

## 1.0.3CC — 2026-10-20 (beta)

Two outside bug reports on the 1.0.1 beta (30 + 75 findings) checked one by one: 104 were real and are fixed; one (torrent list after a restart) was not a bug as described.

- **Books:** arrow / space keys inside an EPUB no longer throw; a theme picked while a book loads sticks; the progress bar jumps by chapter when page positions can't be made. A PDF opens at its last page when the saved page is past the end, a damaged page says so, closing while loading leaves nothing running. Comics: the last two-page spread counts as finished, an unreadable page says so, no memory is kept after closing. "Author - Title - Subtitle" keeps its subtitle; a book opened with "Open file" stays in "Continue". Catalogs: a free PDF is preferred to an EPUB to buy, paging and a new search no longer mix catalogs or shelves, xml:base, redirects, prefixed OpenSearch tags and {searchTerms} in the path or twice all work. LibriVox keeps chapters that only come in one quality. EPUB titles decode &#233;-style characters and any namespace prefix. Downloads: a zip with no book or comic pages is refused, the size limit holds while downloading, names like CON / AUX are saved safely.
- **Music:** shuffle keeps the song playing and the songs before it; a film's speed / loop no longer carries into music; holding Space pauses once; another playlist that shares a song starts instead of pausing the wrong one. Lyrics: a dropped connection is retried, live and studio takes don't share lyrics, a line with several times shows at each. A YouTube song that mpv reports by its media address still moves on at its end. Short podcasts aren't marked heard after seconds; "newest episode" is the newest even when the feed lists the oldest first. Radio search also finds stations by genre. Deleted songs leave "most played" and "where you left off". Library scans: a cancelled or failed scan no longer overwrites the library, "2Pac" / "50 Cent" keep their names, an album's later track can give the cover, a changed cover is picked up, nested folders don't list a song twice. Spotify move: an unticked song stays unticked, one unreadable song no longer stops the move. The music link window does nothing after it is closed.
- **Assistant:** closing it while a card waits cancels; every delete gets its own card and choices, and an empty delete no longer lets other changes pass unasked; playing a song asks like other opens; "Undo" undoes every round of an answer, leaves a downloaded book out, and covers a music playlist it made. Non-Latin names don't match everything; "Home" deletes the song Home, not the album Homecoming; a playlist keeps the size asked for; a series asked for by name isn't the film of that name; a year given ("Dune (1984)") is respected when removing or editing. A question sent from a menu while it is busy waits instead of getting lost; a deleted conversation stays deleted; a new song gets its own conversation.
- **Films:** an unfinished torrent asks before the music stops; "I finished this episode" moves "Continue" on; a 45-second clip isn't finished at the start; Discover's picks follow a like turned into a dislike and what was watched. Addon addresses keep their ?token=. File names: "The Web (1947)", "(500) Days of Summer", "C++.mp4" and two shows of the same name from different years are read right; .m2ts is in the open dialog. Missing-file checks and subtitle timelines ignore late answers; subtitle lines are sorted; UTF-16 subtitles show on the timeline; a failing subtitle name search says why. Deleting a book or song never takes a video's subtitles along. Removing a season torrent clears every episode opened from it. Hero sliders keep picture and title together; a cover that failed once tries again for the next song or book. Watch-later cards are checked for content warnings; a list search fills the posters of what it shows; a known TMDB id gives its own poster.
- **Letterboxd:** "Update" no longer wipes list edits made while it ran, says when lists couldn't be read; a custom list named like a standard shelf stays separate; list CSV exports and Letterboxd links import without a Gemini key; the diary's latest vote counts for friend match.
- **Other:** page reading can't be redirected into the local network; search plugins: "$1E" replacements, and/or with more arguments, htmldecode / diacritics / validate, POST $raw, .YML files and "1,234,567" sizes work. Lossless Scaling is restarted even if saving fails, is detected on a second monitor, and its untitled default profile becomes Luna's. Every font in a .ttc is listed; same-named fonts in a zip both stay. The setup check's "Check again" works after an error.

## 1.0.2CC — 2026-10-20 (beta)

- **Privacy:** the program no longer carries the folders it was built in (the Windows user name and the project folder showed inside `Luna Player.exe` as error-message paths). Shared builds are made with `scripts/build-release.ps1`.
- The GitHub release workflow runs only when started by hand: pushing a tag no longer rebuilds the release over the tested files.

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
