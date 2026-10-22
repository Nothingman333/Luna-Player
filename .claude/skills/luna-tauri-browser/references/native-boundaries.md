# Luna browser module boundaries

- Browser.tsx: tab state, address editing/IME, page capture generations, translate/cancel/retry, native geometry and temporary overlays. Avoid a slow independent request blocking all webview mutations.
- BrowserManager.tsx/CSS: extension permission preview and runtime status, session download controls. Never label a planned command as a completed native operation.
- browser.rs: trusted main caller, isolated site profile, tab creation/actions, popups/permission events, native bounds and assistant bubble regions. Main IPC remains unavailable to remote pages.
- browser_extensions.rs: bounded package preparation, explicit install, profile API callback status, enable/remove and timeout handling. Keep installed source immutable; do not delete it on an uncertain late completion.
- extension_package.rs/signature.rs: trusted store URL/ID handling, developer proof identity, RSA/ECDSA CRX3 verification, ZIP/folder bounds and safe paths. Preserve declared optional/site permissions in the preview; unknown/malformed input must not cause unbounded allocation.
- browser_downloads.rs: actual operation ID, UI-thread native control, byte progress/CanResume, collision-free target path, active record retention and callback teardown. User-facing close of an active-download tab and teardown/reload are different lifecycle paths.
- browserTranslation.ts/browserTranslatePage.js: page-token-aware translation and restore; preserve original text, abort/retry boundaries and DOM changes made after capture.

A DOM z-index does not reorder a native child webview. Keep normal assistant overlays over the page and hide/clip the native layer only where required. Validate DPI, resize, modal visibility and closing without assuming a synthetic DOM frame is the live renderer. Keep external content, page instructions and extension packages away from privileged commands.
