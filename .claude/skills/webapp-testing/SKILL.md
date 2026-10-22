---
name: webapp-testing
description: Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.
license: Complete terms in LICENSE.txt
---

# Luna frontend testing

Adapted from Anthropic's webapp-testing skill. The unchanged upstream entrypoint is UPSTREAM-SKILL.md; examples and helper sources retain their original license.

Use this for the isolated local React/Vite frontend and mocked Tauri bridge. Use the project's existing Node or Python Playwright installation, whichever is available; prefer the existing runtime over adding another test stack. Keep the real Windows Luna application for the user to test. Do not claim native WebView2, mpv, DRM or extensions work based on DOM-only success.

1. Inspect app/package.json and the component affected. Select a small set of meaningful paths: normal behavior, one failure, and cleanup/cancel if relevant.
2. Prefer an isolated fixture and synthetic localStorage/native results. Separate fixtures, logs and screenshots from production source and never use real API keys or library data.
3. Discover an available local port. Reuse a known server only when its project is correct. Start only the required Vite server and retain its process handle; on Windows keep helpers hidden. Stop only processes created for this check.
4. Inspect the rendered DOM, select controls by role/name, and await visible application state. Do not require networkidle on media or continuously updating pages. Use bounded waits and avoid arbitrary sleep chains.
5. Exercise the interaction, check observable state/native calls, capture browser errors and a screenshot when layout changed. Include a small-width check if the controls are responsive. Close the headless browser and fixture server afterwards.
6. Report the exact bridge level and unresolved native checks. Run relevant existing tests, not every matrix combination. A normal targeted success should lead to delivery.

The upstream scripts/with_server.py is an optional original example, not Luna's required server manager. Its shell/pipe/child-process lifecycle is unsuitable as a default Windows process owner; prefer the environment's normal process tool and recorded session ID. Do not auto-run the Python examples against private sites or the real Luna window. Review and adapt helper code before executing it. Existing Playwright dependencies may need to be available; skill files do not install tools.
