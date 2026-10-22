# Select the check that answers the change

Read app/package.json first; command availability changes. Existing short groups include test:browser, test:browser-native, test:translation, test:web-notebook, test:books-profiles, test:film-browser and test:assistant-safety. Use only relevant groups, not the entire list automatically.

From the project root: npm --prefix app run build; node app/scripts/i18n-check.cjs. For Rust changes use cargo check/build --manifest-path app/src-tauri/Cargo.toml when the correct Windows toolchain and resources are available. Keep Cargo.toml/Cargo.lock together. A frontend-only check cannot validate Rust code. Missing tools are an environment limitation, not an application defect.

UI checks may use the existing JS or Python Playwright runtime in an isolated Vite fixture with mock Tauri commands/events. Use synthetic storage and a separate port. Check one normal path, relevant failure/cancel/cleanup and a compact layout where appropriate. Close only processes you started. Do not automate the user's actual Windows Luna window under the current project preference.

Use small reproducible regressions for races, archives, credentials, persistence and cancellation when they materially prove the fix. A passing mirror of the implementation is not useful evidence. Report commands/exit codes and the level of the check. Do not multiply the number of checks into a claimed bug count. Retain honest limitations.
