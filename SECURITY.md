# Security policy

## Supported versions

Security fixes go to the latest release. Older versions may not receive patches.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting on this repository
(**Security → Advisories → Report a vulnerability**). Include:

- what the problem is and where (file/command),
- the steps to reproduce it,
- the affected version and Windows version,
- whether you are willing to test a fix.

You will get an acknowledgement as soon as possible. Please give us time to prepare a fix before publishing
details.

## Scope

Luna runs locally and reads files the user chooses. It calls public APIs (TMDB, Open Library, Internet Archive,
LibriVox, radio-browser, OpenSubtitles) and, when the assistant is used, Google's Gemini API with the user's
own key. The API keys are stored in the WebView's local storage on the user's computer; Luna does not send them
anywhere except the matching service.

Reports about the following are especially welcome:

- a way to execute code or read arbitrary local files from a book, subtitle, torrent, addon or web page,
- an SSRF/path-traversal issue in a command reachable from a web page or a link,
- a crash/denial of service triggered by a downloaded file,
- a secret accidentally committed to the repository or shipped in a release.

Out of scope: piracy sources, content the user downloads, third-party players/programs, and reports that only
say "the app can play copyrighted files".
