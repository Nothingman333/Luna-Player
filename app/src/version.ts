/**
 * The app's version, in one place.
 *
 * Version format: MAJOR.MINOR.PATCH + the letter of the AI model that made the last change.
 * Examples: 1.0.0D (DeepSeek), 1.0.1C (ChatGPT), 1.0.2CC (Claude Code), 1.0.3Q (Qwen), 1.0.4K (Kimi), 1.0.5G (Gemini).
 *
 * Luna numbering carries at ten: 1.6.9 -> 1.7.0; 1.7.9 -> 1.8.0; 1.9.9 -> 2.0.0.
 * When a new model/round starts: bump the number by one and set BUILD_AGENT to that model's letter.
 * Keep app/package.json, app/src-tauri/tauri.conf.json and app/src-tauri/Cargo.toml on the same number.
 * The Settings › General page shows VERSION_LABEL (for example 3.5.4CC).
 */
export const APP_VERSION = "3.5.4";
export const BUILD_AGENT = "CC";

export const BUILD_AGENT_NAMES: Record<string, string> = {
  D: "DeepSeek",
  C: "ChatGPT",
  CC: "Claude Code",
  Q: "Qwen",
  K: "Kimi",
  G: "Gemini",
};

/** "3.4.7D" — what the settings page and the about text show. */
export const VERSION_LABEL = `${APP_VERSION}${BUILD_AGENT}`;
