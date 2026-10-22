/**
 * The app's version, in one place.
 *
 * Version format: MAJOR.MINOR.PATCH + the letter of the AI model that made the last change.
 * Examples: 1.0.0D (DeepSeek), 1.0.1C (ChatGPT), 1.0.2CC (Claude Code), 1.0.3Q (Qwen), 1.0.4K (Kimi), 1.0.5G (Gemini).
 *
 * When a new model/round starts: bump the number by one and set BUILD_AGENT to that model's letter.
 * Keep app/package.json, app/src-tauri/tauri.conf.json and app/src-tauri/Cargo.toml on the same number.
 * The Settings › General page shows VERSION_LABEL.
 */
export const APP_VERSION = "1.6.3";
export const BUILD_AGENT = "CC";

export const BUILD_AGENT_NAMES: Record<string, string> = {
  D: "DeepSeek",
  C: "ChatGPT",
  CC: "Claude Code",
  Q: "Qwen",
  K: "Kimi",
  G: "Gemini",
};

/** "1.6.3CC" — what the settings page and the about text show. */
export const VERSION_LABEL = `${APP_VERSION}${BUILD_AGENT}`;
