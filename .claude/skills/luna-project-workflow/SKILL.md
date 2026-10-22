---
name: luna-project-workflow
description: "Develop or review Luna Player features using its existing module layout, bounded checks and reproducible source-package delivery."
---

# Luna project workflow

Luna Player is an existing Windows Tauri v2 application with a React/TypeScript/Vite frontend and Rust media/native backend. Resolve the actual project root first; app/package.json and app/src-tauri/Cargo.toml are the anchors. Do not create a replacement application.

Start with the user's requested outcome and inspect the relevant module before editing. Check existing changes and keep unrelated local work. Route visual work to luna-ui-consistency, native browser work to luna-tauri-browser, and assistant/catalog work to luna-assistant-library if those skills are available. Each skill also works as ordinary local guidance when a skill runner is unavailable.

Keep existing native command names, storage keys, profile behavior, production app identity and updater configuration unless the task actually changes them. New Rust commands must be registered in lib.rs and their arguments/results must match invoke calls. Read current Cargo/package lock versions rather than upgrading the framework to fit an example. Never include secrets, user media, node_modules or build outputs in source delivery.

User preferences for this project: improve within the current Luna theme; the assistant normally opens as a small overlay, and the browser page must retain its space. Choose targeted checks rather than large repetitive stress matrices. Leave automation of the real Windows Luna window to the user under the current task authorization. Tests and screenshots from a mocked bridge must be labeled as such. Follow later user instructions if these preferences change.

For checks read [references/checks.md](references/checks.md). For a GitHub/Claude source ZIP or patch read [references/delivery.md](references/delivery.md). Reports should identify changes, actual verification and practical limitations. Git operations with external effects follow the user's current authorization; a skill is not authorization to push or release.
