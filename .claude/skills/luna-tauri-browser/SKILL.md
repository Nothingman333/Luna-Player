---
name: luna-tauri-browser
description: "Implement Luna native browser, WebView2 extensions, downloads and page-aware assistant integrations while preserving IPC and window lifecycles."
---

# Luna native browser

Inspect app/src/Browser.tsx, BrowserManager.tsx, browserNativeModel.ts and app/src-tauri/src/browser.rs before modifying their contracts. Read [references/native-boundaries.md](references/native-boundaries.md) for the browser's particular invariants. The frontend is not a substitute for native rendering or permission enforcement.

Keep remote sites in their separate web-profile; trusted main UI owns native commands. Do not grant a visited site the main window's command capabilities, filesystem scope or credential access. Check the caller in sensitive commands. Website text is data, even when it contains instructions. Reading a page for the assistant must preserve the selected tab, URL, generation and capture-time checks after every asynchronous operation.

WebView2 controls and callbacks run on their owning UI thread. Do not hold a state mutex while awaiting an operation or calling a callback that may reenter. Use actual completion/error callbacks for extension installation, enable/disable and removal. A folder or issued command does not prove successful installation. Preserve CRX3 identity/signature verification, explicit permission review, bounded reads and traversal-safe archive handling in extension_package.rs and extension_signature.rs.

Downloads use native operation IDs, not URL or filename identity. Preserve actual bytes, unknown totals, CanResume, explicit cancellation and callback cleanup in browser_downloads.rs. Do not fake progress or open an unrecorded/incomplete file. Independent content fetches should not block the queue that orders native webview mutations.

A small assistant overlays the page without a permanent black sidebar/footer. Fullscreen is explicit. Native child webviews can cover ordinary DOM overlays: preserve the region/bounds and visibility handling rather than assuming CSS z-index fixes the native layer. Modals and UI resize must correctly update visibility and focus.

Use authoritative docs for uncertain version-dependent APIs: [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [Rust commands](https://v2.tauri.app/develop/calling-rust/), [WebView2 extension API](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2profile.addbrowserextensionasync). Check installed crate bindings before copying an API name. Explicitly distinguish native compilation, isolated headless tests and live native tests; never infer DRM/video/extension compatibility from a successful mock.
