# Luna adaptation — 2026-10-22

Upstream: https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/webapp-testing
License: Apache-2.0
Unchanged upstream entrypoint: UPSTREAM-SKILL.md.

The active SKILL.md adds Luna scope, existing-theme constraints, bounded verification and native/mock distinctions. Webapp-testing has a replacement active workflow compatible with existing JS/Python tooling and Windows process ownership; original helpers remain optional references. Systematic-debugging removes unavailable plugin dependencies and replaces the platform-specific diagnostic shell example with redacted boundary checks. React guidance is limited to the Vite client. Other bundled upstream references are preserved unchanged. This is a local adaptation, not an upstream-endorsed release.
