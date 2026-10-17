// Lists tt("…") texts in src that have no English text in src/i18n-en.ts.  Run: node scripts/i18n-check.cjs
const ts = require("typescript"); const fs = require("fs"); const path = require("path");
const src = path.join(__dirname, "..", "src");
const en = fs.readFileSync(path.join(src, "i18n-en.ts"), "utf8");
const have = new Set([...en.matchAll(/^\s*("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])));
const missing = new Set();
for (const f of fs.readdirSync(src).filter((f) => /\.tsx?$/.test(f))) {
  const sf = ts.createSourceFile(f, fs.readFileSync(path.join(src, f), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const v = (n) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "tt" && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && !have.has(n.arguments[0].text)) missing.add(n.arguments[0].text);
    ts.forEachChild(n, v);
  };
  v(sf);
}
console.log(missing.size ? [...missing].join("\n") : "All texts have English.");
