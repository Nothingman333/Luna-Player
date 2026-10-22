//! Web search plugins that run inside Luna. A plugin is an indexer definition in
//! Jackett's "Cardigann" YAML format: it only *describes* how to search a site
//! (URL, inputs, CSS / JSON selectors, filters), so plugins can't run code.
//! Luna ships no definitions; the user adds their own `.yml` files.
//!
//! Supported subset: search paths (GET/POST), inputs, keywordsfilters, HTML and
//! JSON responses, rows (+ JSON `attribute` sub-rows), fields with selector /
//! attribute / text / optional / filters, the common filters, Go-template
//! expressions ({{ .Keywords }}, {{ .Config.x }}, {{ .Result.x }}, if/else/end,
//! eq/ne/and/or/not, re_replace, join), and `download.selectors` for sites whose
//! magnet sits on a details page. Login-protected sites are not supported.

use regex::Regex;
use reqwest::Url;
use scraper::{ElementRef, Html, Selector};
use serde::Serialize;
use serde_json::Value as J;
use serde_yaml::Value as Y;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

// ---------- plugin files ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub file: String,
    pub id: String,
    pub name: String,
    pub site: String,
    pub login: bool,
    pub error: Option<String>,
}

fn load(path: &Path) -> Result<Y, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let y: Y = serde_yaml::from_str(&text).map_err(|e| tr!("YAML hatası: {}", "YAML error: {}", e))?;
    if y.get("search").is_none() {
        return Err(tr!("Bu dosyada 'search' bölümü yok; Cardigann tanımı değil.", "This file has no 'search' section; it isn't a Cardigann definition."));
    }
    Ok(y)
}

fn s(y: &Y, k: &str) -> String {
    y.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn base_url(def: &Y) -> String {
    def.get("links").and_then(|l| l.as_sequence()).and_then(|l| l.first()).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

pub fn list(dir: &Path) -> Vec<PluginInfo> {
    let mut out = vec![];
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let p = e.path();
        if !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("yml") || x.eq_ignore_ascii_case("yaml")) {
            continue;
        }
        let file = p.file_name().unwrap().to_string_lossy().into_owned();
        match load(&p) {
            Ok(d) => out.push(PluginInfo {
                id: s(&d, "id"),
                name: if s(&d, "name").is_empty() { file.clone() } else { s(&d, "name") },
                site: base_url(&d),
                login: d.get("login").is_some(),
                error: None,
                file,
            }),
            Err(err) => out.push(PluginInfo { id: String::new(), name: file.clone(), site: String::new(), login: false, error: Some(err), file }),
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

pub fn add(dir: &Path, paths: Vec<String>) -> Result<u32, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut n = 0;
    for p in paths {
        let src = PathBuf::from(&p);
        load(&src).map_err(|e| format!("{}: {e}", src.file_name().unwrap_or_default().to_string_lossy()))?;
        std::fs::copy(&src, dir.join(src.file_name().ok_or(tr!("Geçersiz dosya", "Invalid file"))?)).map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

pub fn remove(dir: &Path, file: &str) -> Result<(), String> {
    // a bare file name only: no folder, no drive prefix (`C:x.json` would leave `dir` on Windows), no "." or ".."
    if file.is_empty() || file == "." || file == ".." || file.contains(['/', '\\', ':']) {
        return Err(tr!("Geçersiz dosya adı", "Invalid file name"));
    }
    let path = dir.join(file);
    if path.parent() != Some(dir) {
        return Err(tr!("Geçersiz dosya adı", "Invalid file name"));
    }
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

// ---------- Go-template subset ----------

struct Ctx<'a> {
    keywords: String,
    config: &'a HashMap<String, String>,
    result: &'a HashMap<String, String>,
}

impl Ctx<'_> {
    fn var(&self, path: &str) -> String {
        let p = path.trim_start_matches('.');
        match p {
            "Keywords" | "Query.Keywords" => self.keywords.clone(),
            "Query.Q" => self.keywords.clone(),
            "True" => "true".into(),
            "False" => String::new(),
            "Today.Year" => "2026".into(),
            _ => {
                if let Some(k) = p.strip_prefix("Config.") {
                    self.config.get(k).cloned().unwrap_or_default()
                } else if let Some(k) = p.strip_prefix("Result.") {
                    self.result.get(k).cloned().unwrap_or_default()
                } else {
                    String::new()
                }
            }
        }
    }
}

fn truthy(v: &str) -> bool {
    !v.is_empty() && v != "false" && v != "0"
}

fn tokenize(expr: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    let mut chars = expr.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' | '`' => {
                let end = c;
                let mut lit = String::from("\"");
                while let Some(d) = chars.next() {
                    if d == '\\' && end == '"' {
                        if let Some(e) = chars.next() {
                            lit.push(match e { 'n' => '\n', 't' => '\t', other => other });
                        }
                    } else if d == end {
                        break;
                    } else {
                        lit.push(d);
                    }
                }
                out.push(lit);
            }
            '(' | ')' => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
                out.push(c.to_string());
            }
            c if c.is_whitespace() => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Evaluates one term (literal, variable or parenthesised call) starting at `i`.
fn term(t: &[String], i: &mut usize, ctx: &Ctx) -> String {
    let Some(tok) = t.get(*i) else { return String::new() };
    *i += 1;
    if tok == "(" {
        let start = *i;
        let mut depth = 1;
        while *i < t.len() {
            if t[*i] == "(" {
                depth += 1;
            } else if t[*i] == ")" {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            *i += 1;
        }
        let v = call(&t[start..*i], ctx);
        *i += 1;
        return v;
    }
    if let Some(lit) = tok.strip_prefix('"') {
        return lit.to_string();
    }
    if tok.starts_with('.') {
        return ctx.var(tok);
    }
    tok.clone()
}

/// Every argument left in the call.
fn rest(t: &[String], i: &mut usize, ctx: &Ctx) -> Vec<String> {
    let mut out = Vec::new();
    while *i < t.len() {
        out.push(term(t, i, ctx));
    }
    out
}

fn call(t: &[String], ctx: &Ctx) -> String {
    if t.is_empty() {
        return String::new();
    }
    let f = t[0].as_str();
    let mut i = 1;
    let mut args = |n: usize| -> Vec<String> { (0..n).map(|_| term(t, &mut i, ctx)).collect() };
    match f {
        "eq" => { let a = args(2); (a[0] == a[1]).then(|| "true".into()).unwrap_or_default() }
        "ne" => { let a = args(2); (a[0] != a[1]).then(|| "true".into()).unwrap_or_default() }
        // Go templates: and/or take any number of arguments (the first false / the first true one, else the last)
        "and" => { let a = rest(t, &mut i, ctx); a.iter().find(|x| !truthy(x)).or(a.last()).cloned().unwrap_or_default() }
        "or" => { let a = rest(t, &mut i, ctx); a.iter().find(|x| truthy(x)).or(a.last()).cloned().unwrap_or_default() }
        "not" => { let a = args(1); (!truthy(&a[0])).then(|| "true".into()).unwrap_or_default() }
        "re_replace" => {
            let a = args(3);
            Regex::new(&a[1]).map(|r| r.replace_all(&a[0], dotnet_repl(&a[2]).as_str()).into_owned()).unwrap_or(a[0].clone())
        }
        "join" => String::new(),
        "print" | "printf" => args(1).remove(0),
        _ => {
            i = 0;
            term(t, &mut i, ctx)
        }
    }
}

fn eval_expr(expr: &str, ctx: &Ctx) -> String {
    call(&tokenize(expr), ctx)
}

fn render(tpl: &str, ctx: &Ctx) -> String {
    // Split into text and {{ actions }}, then walk them with an if/else stack.
    let mut parts: Vec<(bool, String)> = vec![];
    let mut rest = tpl;
    while let Some(a) = rest.find("{{") {
        let mut text = rest[..a].to_string();
        let Some(b) = rest[a..].find("}}") else { break };
        let mut act = rest[a + 2..a + b].to_string();
        if act.starts_with('-') {
            text = text.trim_end().to_string();
            act.remove(0);
        }
        let trim_after = act.ends_with('-');
        if trim_after {
            act.pop();
        }
        parts.push((false, text));
        parts.push((true, act.trim().to_string()));
        rest = &rest[a + b + 2..];
        if trim_after {
            rest = rest.trim_start();
        }
    }
    parts.push((false, rest.to_string()));

    let mut out = String::new();
    // Each frame: (this branch active, some branch already taken, parent active)
    let mut stack: Vec<(bool, bool, bool)> = vec![];
    let active = |st: &Vec<(bool, bool, bool)>| st.last().map_or(true, |f| f.0);
    for (is_act, p) in parts {
        if !is_act {
            if active(&stack) {
                out.push_str(&p);
            }
            continue;
        }
        let on = active(&stack);
        if let Some(cond) = p.strip_prefix("if ") {
            let v = on && truthy(&eval_expr(cond, ctx));
            stack.push((v, v, on));
        } else if p.starts_with("range") || p.starts_with("with") {
            stack.push((false, true, on));
        } else if let Some(cond) = p.strip_prefix("else if ") {
            if let Some(f) = stack.last_mut() {
                let v = f.2 && !f.1 && truthy(&eval_expr(cond, ctx));
                f.0 = v;
                f.1 |= v;
            }
        } else if p == "else" {
            if let Some(f) = stack.last_mut() {
                f.0 = f.2 && !f.1;
                f.1 = true;
            }
        } else if p == "end" {
            stack.pop();
        } else if on && !p.starts_with("/*") {
            out.push_str(&eval_expr(&p, ctx));
        }
    }
    out
}

// ---------- filters ----------

fn yarg(args: &Y, i: usize) -> String {
    match args {
        Y::Sequence(a) => a.get(i).map(ystr).unwrap_or_default(),
        other if i == 0 => ystr(other),
        _ => String::new(),
    }
}

fn ystr(v: &Y) -> String {
    match v {
        Y::String(s) => s.clone(),
        Y::Number(n) => n.to_string(),
        Y::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

/// .NET replacement syntax → Rust's: "$1E" means group 1 then "E" there, but group "1E" in Rust.
fn dotnet_repl(r: &str) -> String {
    Regex::new(r"\$(\d+)").unwrap().replace_all(r, "$${$1}").into_owned()
}
/// HTML entities: the common names and numeric ones.
fn html_decode(s: &str) -> String {
    let re = Regex::new(r"&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);").unwrap();
    re.replace_all(s, |c: &regex::Captures| {
        let n = &c[1];
        let ch = if let Some(h) = n.strip_prefix("#x").or_else(|| n.strip_prefix("#X")) {
            u32::from_str_radix(h, 16).ok().and_then(char::from_u32)
        } else if let Some(d) = n.strip_prefix('#') {
            d.parse::<u32>().ok().and_then(char::from_u32)
        } else {
            match n {
                "amp" => Some('&'), "lt" => Some('<'), "gt" => Some('>'), "quot" => Some('"'), "apos" => Some('\''), "nbsp" => Some(' '),
                _ => None,
            }
        };
        ch.map(String::from).unwrap_or_else(|| c[0].to_string())
    })
    .into_owned()
}
/// "Amélie Çağrı" → "Amelie Cagri" (the Latin letters with marks that site titles use).
fn strip_accents(s: &str) -> String {
    const FROM: &str = "ÀÁÂÃÄÅàáâãäåÇçĆćČčÈÉÊËèéêëĞğÌÍÎÏìíîïİıÑñÒÓÔÕÖØòóôõöøŞşŠšÙÚÛÜùúûüÝýÿŽž";
    const TO: &str = "AAAAAAaaaaaaCcCcCcEEEEeeeeGgIIIIiiiiIiNnOOOOOOooooooSsSsUUUUuuuuYyyZz";
    s.chars().map(|c| FROM.chars().position(|f| f == c).and_then(|i| TO.chars().nth(i)).unwrap_or(c)).collect()
}

fn apply_filters(mut v: String, filters: Option<&Y>, ctx: &Ctx) -> String {
    let Some(Y::Sequence(fs)) = filters else { return v };
    for f in fs {
        let name = s(f, "name");
        let args = f.get("args").cloned().unwrap_or(Y::Null);
        let a0 = render(&yarg(&args, 0), ctx);
        let a1 = render(&yarg(&args, 1), ctx);
        v = match name.as_str() {
            "replace" => v.replace(&a0, &a1),
            "re_replace" => Regex::new(&a0).map(|r| r.replace_all(&v, dotnet_repl(&a1.replace("$$", "$")).as_str()).into_owned()).unwrap_or(v),
            "regexp" => Regex::new(&a0)
                .ok()
                .and_then(|r| r.captures(&v).map(|c| c.get(1).or(c.get(0)).map(|m| m.as_str().to_string()).unwrap_or_default()))
                .unwrap_or_default(),
            "append" => v + &a0,
            "prepend" => a0 + &v,
            "trim" => if a0.is_empty() { v.trim().to_string() } else { v.trim_matches(|c| a0.contains(c)).to_string() },
            "tolower" => v.to_lowercase(),
            "toupper" => v.to_uppercase(),
            "urldecode" => urlencoding::decode(&v).map(|x| x.into_owned()).unwrap_or(v),
            "urlencode" => urlencoding::encode(&v).into_owned(),
            "split" => {
                let idx: i64 = a1.parse().unwrap_or(0);
                let parts: Vec<&str> = v.split(a0.as_str()).collect();
                let i = if idx < 0 { parts.len() as i64 + idx } else { idx };
                parts.get(i.max(0) as usize).unwrap_or(&"").to_string()
            }
            "querystring" => Url::parse(&v)
                .or_else(|_| Url::parse(&format!("http://x/{}", v.trim_start_matches('/'))))
                .ok()
                .and_then(|u| u.query_pairs().find(|(k, _)| k == &a0).map(|(_, val)| val.into_owned()))
                .unwrap_or_default(),
            "validfilename" => v.chars().filter(|c| !r#"<>:"/\|?*"#.contains(*c)).collect(),
            "htmldecode" => html_decode(&v),
            "diacritics" => strip_accents(&v),
            // keeps only the words of the value that are in the comma-separated list
            "validate" => {
                let ok: Vec<String> = a0.split(',').map(|x| x.trim().to_lowercase()).filter(|x| !x.is_empty()).collect();
                v.split(|c: char| c == ',' || c.is_whitespace()).filter(|w| ok.contains(&w.to_lowercase())).collect::<Vec<_>>().join(",")
            }
            // dates are not shown in Luna's results, so these leave the text as it is
            "dateparse" | "timeago" | "fuzzytime" | "timeparse" => v,
            _ => v,
        };
    }
    v
}

// ---------- extraction ----------

fn collapse(t: &str) -> String {
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn json_path<'a>(v: &'a J, path: &str) -> Option<&'a J> {
    let mut cur = v;
    for part in path.trim_start_matches('$').trim_start_matches('.').split('.').filter(|p| !p.is_empty()) {
        cur = match cur {
            J::Array(a) => a.get(part.parse::<usize>().ok()?)?,
            _ => cur.get(part)?,
        };
    }
    Some(cur)
}

fn json_text(v: &J) -> String {
    match v {
        J::String(s) => s.clone(),
        J::Null => String::new(),
        J::Array(a) => a.iter().map(json_text).collect::<Vec<_>>().join(", "),
        other => other.to_string(),
    }
}

enum Row<'a> {
    Html(ElementRef<'a>),
    Json { row: &'a J, parent: Option<&'a J> },
}

fn field_value(row: &Row, f: &Y, ctx: &Ctx) -> Option<String> {
    if let Some(Y::String(t)) = f.get("text") {
        return Some(render(t, ctx));
    }
    let sel = s(f, "selector");
    let attr = s(f, "attribute");
    match row {
        Row::Html(el) => {
            let target = if sel.is_empty() {
                Some(*el)
            } else {
                let css = Selector::parse(&sel).ok()?;
                el.select(&css).next()
            };
            let target = target?;
            if !attr.is_empty() {
                return target.value().attr(&attr).map(|x| x.trim().to_string());
            }
            // `remove`: drop matching child elements from the text.
            let mut text = collapse(&target.text().collect::<String>());
            if let Ok(rm) = Selector::parse(&s(f, "remove")) {
                for c in target.select(&rm) {
                    let ct = collapse(&c.text().collect::<String>());
                    if !ct.is_empty() {
                        text = collapse(&text.replacen(&ct, "", 1));
                    }
                }
            }
            Some(text)
        }
        Row::Json { row, parent } => {
            let (src, path) = match sel.strip_prefix("..") {
                Some(p) => (parent.unwrap_or(row), p.to_string()),
                None => (*row, sel.clone()),
            };
            let path = if path.is_empty() { attr.clone() } else { path };
            json_path(src, &path).map(json_text)
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub plugin: String,
    pub plugin_file: String,
    pub title: String,
    /// magnet link or .torrent URL, when the listing already has it
    pub link: Option<String>,
    /// page to resolve the link from (download.selectors) when `link` is missing
    pub details: Option<String>,
    pub size: u64,
    pub seeders: i64,
    pub leechers: i64,
}

fn parse_size(t: &str) -> u64 {
    let raw = t.trim();
    // "1,234,567" and "1.234,5" are thousands; a lone comma ("1,5 GB") is the decimal point
    let t = if Regex::new(r"^\d{1,3}(,\d{3})+(\.\d+)?\b").unwrap().is_match(raw) {
        raw.replace(',', "")
    } else if Regex::new(r"^\d{1,3}(\.\d{3})+(,\d+)?\b").unwrap().is_match(raw) && (raw.contains(',') || raw.matches('.').count() > 1) {
        raw.replace('.', "").replace(',', ".")
    } else {
        raw.replace(',', ".")
    };
    if let Ok(n) = t.parse::<f64>() {
        return n as u64;
    }
    let re = Regex::new(r"(?i)([\d.]+)\s*([kmgt]i?b|b|bytes)?").unwrap();
    let Some(c) = re.captures(&t) else { return 0 };
    let n: f64 = c[1].parse().unwrap_or(0.0);
    let mult = match c.get(2).map(|m| m.as_str().to_lowercase()) {
        Some(u) if u.starts_with('k') => 1024f64,
        Some(u) if u.starts_with('m') => 1024f64.powi(2),
        Some(u) if u.starts_with('g') => 1024f64.powi(3),
        Some(u) if u.starts_with('t') => 1024f64.powi(4),
        _ => 1.0,
    };
    (n * mult) as u64
}

fn absolutize(base: &str, link: &str) -> String {
    if link.starts_with("magnet:") || link.starts_with("http://") || link.starts_with("https://") {
        return link.to_string();
    }
    Url::parse(base).and_then(|b| b.join(link)).map(|u| u.to_string()).unwrap_or_else(|_| link.to_string())
}

/// Error with its causes ("error sending request" alone hides the real reason).
fn chain(e: &dyn std::error::Error) -> String {
    let mut out = e.to_string();
    let mut cur = e.source();
    while let Some(c) = cur {
        out.push_str(" → ");
        out.push_str(&c.to_string());
        cur = c.source();
    }
    out
}

fn magnet_from_hash(hash: &str, title: &str) -> String {
    format!("magnet:?xt=urn:btih:{hash}&dn={}", urlencoding::encode(title))
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .cookie_store(true)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36")
        .build()
        .unwrap()
}

fn config_defaults(def: &Y) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for st in def.get("settings").and_then(|v| v.as_sequence()).into_iter().flatten() {
        let name = s(st, "name");
        let mut val = st.get("default").map(ystr).unwrap_or_default();
        if val.is_empty() && s(st, "type") == "select" {
            if let Some(Y::Mapping(opts)) = st.get("options") {
                val = opts.keys().next().map(ystr).unwrap_or_default();
            }
        }
        m.insert(name, val);
    }
    m
}

/// Runs one plugin's search and returns its rows.
pub async fn search_one(path: &Path, query: &str) -> Result<Vec<Hit>, String> {
    let def = load(path)?;
    let file = path.file_name().unwrap().to_string_lossy().into_owned();
    let name = if s(&def, "name").is_empty() { file.clone() } else { s(&def, "name") };
    let base = base_url(&def);
    if base.is_empty() {
        return Err(tr!("'links' boş", "'links' is empty"));
    }
    let search = def.get("search").unwrap();
    let config = config_defaults(&def);
    let empty = HashMap::new();
    let mut ctx = Ctx { keywords: query.to_string(), config: &config, result: &empty };
    ctx.keywords = apply_filters(ctx.keywords.clone(), search.get("keywordsfilters"), &ctx);

    let mut paths: Vec<Y> = search.get("paths").and_then(|p| p.as_sequence()).cloned().unwrap_or_default();
    if paths.is_empty() {
        if let Some(p) = search.get("path") {
            let mut m = serde_yaml::Mapping::new();
            m.insert("path".into(), p.clone());
            paths.push(Y::Mapping(m));
        }
    }
    let http = client();
    let mut hits = vec![];
    for p in paths.iter().take(2) {
        let url_path = render(&s(p, "path"), &ctx);
        let url = absolutize(&base, &url_path);
        let mut inputs: Vec<(String, String)> = vec![];
        let mut raw = String::new();
        let mut add_inputs = |m: Option<&Y>| {
            if let Some(Y::Mapping(m)) = m {
                for (k, v) in m {
                    let k = ystr(k);
                    let v = render(&ystr(v), &ctx);
                    if k == "$raw" {
                        raw = v;
                    } else {
                        inputs.push((k, v));
                    }
                }
            }
        };
        add_inputs(search.get("inputs"));
        add_inputs(p.get("inputs"));
        let post = s(p, "method").eq_ignore_ascii_case("post");
        let req = if post {
            // a $raw input goes into the form body as written ("category[]=1&category[]=2")
            let mut body: Vec<String> = inputs.iter().map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v))).collect();
            if !raw.is_empty() {
                body.push(raw.clone());
            }
            http.post(&url).header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded").body(body.join("&"))
        } else {
            let mut u = Url::parse(&url).map_err(|e| tr!("Adres hatalı: {} ({})", "Bad address: {} ({})", url, e))?;
            if !inputs.is_empty() {
                let mut q = u.query_pairs_mut();
                for (k, v) in &inputs {
                    q.append_pair(k, v);
                }
            }
            let mut s2 = u.to_string();
            if !raw.is_empty() {
                s2.push(if s2.contains('?') { '&' } else { '?' });
                s2.push_str(&raw);
            }
            http.get(s2)
        };
        let res = req.send().await.map_err(|e| tr!("Bağlanılamadı: {}", "Couldn't connect: {}", chain(&e)))?;
        if !res.status().is_success() {
            return Err(tr!("Site {} döndürdü", "The site returned {}", res.status()));
        }
        let body = res.text().await.map_err(|e| e.to_string())?;
        let response_type = p.get("response").map(|r| s(r, "type")).unwrap_or_default();
        let rows_def = search.get("rows").ok_or(tr!("'rows' tanımı yok", "No 'rows' definition"))?;
        let fields = search.get("fields").and_then(|f| f.as_mapping()).ok_or(tr!("'fields' tanımı yok", "No 'fields' definition"))?;

        let extract = |row: Row| -> Option<Hit> {
            let mut result: HashMap<String, String> = HashMap::new();
            for (k, f) in fields {
                let key = ystr(k);
                let c = Ctx { keywords: ctx.keywords.clone(), config: &config, result: &result };
                let optional = f.get("optional").and_then(|v| v.as_bool()).unwrap_or(false);
                let f = if let Y::String(sel) = f {
                    // shorthand: `field: selector`
                    let mut m = serde_yaml::Mapping::new();
                    m.insert("selector".into(), Y::String(sel.clone()));
                    Y::Mapping(m)
                } else {
                    f.clone()
                };
                let v = match field_value(&row, &f, &c) {
                    Some(v) => apply_filters(v, f.get("filters"), &c),
                    None if optional || f.get("default").is_some() => render(&f.get("default").map(ystr).unwrap_or_default(), &c),
                    None => String::new(),
                };
                let base_key = key.split('_').next().unwrap_or(&key).to_string();
                result.insert(key.clone(), v.clone());
                if base_key != key && !v.is_empty() {
                    result.insert(base_key, v);
                }
            }
            let title = result.get("title").cloned().unwrap_or_default();
            if title.is_empty() {
                return None;
            }
            let link = ["magnet", "download"]
                .iter()
                .filter_map(|k| result.get(*k).filter(|v| !v.is_empty()))
                .next()
                .map(|v| absolutize(&base, v))
                .or_else(|| result.get("infohash").filter(|h| !h.is_empty()).map(|h| magnet_from_hash(h, &title)));
            let details = result.get("details").filter(|v| !v.is_empty()).map(|v| absolutize(&base, v));
            Some(Hit {
                plugin: name.clone(),
                plugin_file: file.clone(),
                title,
                link,
                details,
                size: result.get("size").map(|v| parse_size(v)).unwrap_or(0),
                seeders: result.get("seeders").and_then(|v| v.trim().replace(',', "").parse().ok()).unwrap_or(0),
                leechers: result.get("leechers").and_then(|v| v.trim().replace(',', "").parse().ok()).unwrap_or(0),
            })
        };

        if response_type == "json" || body.trim_start().starts_with('{') || body.trim_start().starts_with('[') && response_type != "html" {
            let j: J = serde_json::from_str(&body).map_err(|e| tr!("JSON okunamadı: {}", "Couldn't read the JSON: {}", e))?;
            let rows = json_path(&j, &s(rows_def, "selector")).and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let sub = s(rows_def, "attribute");
            for r in &rows {
                if sub.is_empty() {
                    hits.extend(extract(Row::Json { row: r, parent: None }));
                } else if let Some(J::Array(children)) = r.get(&sub) {
                    for c in children {
                        hits.extend(extract(Row::Json { row: c, parent: Some(r) }));
                    }
                }
            }
        } else {
            let doc = Html::parse_document(&body);
            let sel = Selector::parse(&s(rows_def, "selector")).map_err(|_| tr!("Geçersiz satır seçicisi: {}", "Invalid row selector: {}", s(rows_def, "selector")))?;
            for el in doc.select(&sel) {
                hits.extend(extract(Row::Html(el)));
            }
        }
        if !hits.is_empty() {
            break;
        }
    }
    Ok(hits)
}

/// Finds the magnet / .torrent link on a details page via the plugin's `download.selectors`.
pub async fn resolve(path: &Path, url: &str) -> Result<String, String> {
    let def = load(path)?;
    let base = base_url(&def);
    let res = client().get(url).send().await.map_err(|e| e.to_string())?;
    let page = res.url().clone();
    let body = res.text().await.map_err(|e| e.to_string())?;
    let doc = Html::parse_document(&body);
    // <base href> on the page wins, like in a browser
    let page = Selector::parse("base[href]").ok()
        .and_then(|b| doc.select(&b).next().and_then(|e| e.value().attr("href")).and_then(|h| page.join(h).ok()))
        .unwrap_or(page);
    let resolve_link = |v: &str| -> String {
        if v.starts_with("magnet:") || v.contains("://") { v.to_string() } else { page.join(v).map(|u| u.to_string()).unwrap_or_else(|_| absolutize(&base, v)) }
    };
    let sels = def.get("download").and_then(|d| d.get("selectors")).and_then(|v| v.as_sequence()).cloned().unwrap_or_default();
    for sd in &sels {
        let Ok(css) = Selector::parse(&s(sd, "selector")) else { continue };
        if let Some(el) = doc.select(&css).next() {
            let attr = if s(sd, "attribute").is_empty() { "href".to_string() } else { s(sd, "attribute") };
            if let Some(v) = el.value().attr(&attr) {
                let empty = HashMap::new();
                let config = config_defaults(&def);
                let ctx = Ctx { keywords: String::new(), config: &config, result: &empty };
                return Ok(resolve_link(&apply_filters(v.to_string(), sd.get("filters"), &ctx)));
            }
        }
    }
    // Fallback: the first magnet link on the page.
    let a = Selector::parse("a[href^='magnet:']").unwrap();
    doc.select(&a)
        .next()
        .and_then(|e| e.value().attr("href").map(String::from))
        .ok_or_else(|| tr!("Sayfada indirme bağlantısı bulunamadı", "No download link on the page"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOut {
    pub hits: Vec<Hit>,
    pub errors: Vec<(String, String)>,
}

/// Searches every enabled plugin at the same time.
pub async fn search(dir: &Path, query: String, disabled: Vec<String>) -> SearchOut {
    let files: Vec<PathBuf> = list(dir)
        .into_iter()
        .filter(|p| p.error.is_none() && !disabled.contains(&p.file))
        .map(|p| dir.join(p.file))
        .collect();
    let tasks: Vec<_> = files
        .into_iter()
        .map(|f| {
            let q = query.clone();
            tokio::spawn(async move {
                let name = f.file_name().unwrap().to_string_lossy().into_owned();
                (name, tokio::time::timeout(Duration::from_secs(25), search_one(&f, &q)).await)
            })
        })
        .collect();
    let mut out = SearchOut { hits: vec![], errors: vec![] };
    for t in tasks {
        if let Ok((name, r)) = t.await {
            match r {
                Ok(Ok(h)) => out.hits.extend(h),
                Ok(Err(e)) => out.errors.push((name, e)),
                Err(_) => out.errors.push((name, tr!("Zaman aşımı", "Timed out"))),
            }
        }
    }
    out.hits.sort_by(|a, b| b.seeders.cmp(&a.seeders));
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn cardigann_bits() {
        assert_eq!(regex::Regex::new(r"(\d{2})x(\d{2})").unwrap().replace_all("12x45", super::dotnet_repl("S$1E$2").as_str()), "S12E45");
        assert_eq!(super::parse_size("1,234,567"), 1234567);
        assert_eq!(super::parse_size("1,5 GB"), (1.5 * 1024f64.powi(3)) as u64);
        assert_eq!(super::parse_size("1.234,5 MB"), (1234.5 * 1024f64.powi(2)) as u64);
        assert_eq!(super::html_decode("a&amp;b&#233;"), "a&bé");
        assert_eq!(super::strip_accents("Amélie Çağrı"), "Amelie Cagri");
    }

    use super::*;

    #[test]
    fn templates() {
        let cfg: HashMap<String, String> = [("sort".to_string(), "seeders".to_string())].into();
        let res = HashMap::new();
        let c = Ctx { keywords: "big buck".into(), config: &cfg, result: &res };
        assert_eq!(render("q={{ .Keywords }}", &c), "q=big buck");
        assert_eq!(render("{{ if .Keywords }}s/{{ .Keywords }}{{ else }}top{{ end }}", &c), "s/big buck");
        assert_eq!(render("{{ if eq .Config.sort \"seeders\" }}S{{ else }}D{{ end }}", &c), "S");
        assert_eq!(render("{{ re_replace .Keywords \" \" \"+\" }}", &c), "big+buck");
        assert_eq!(render("{{ range .Categories }}x{{ end }}ok", &c), "ok");
        assert_eq!(parse_size("1.5 GB"), 1610612736);
        assert_eq!(parse_size("700 MiB"), 734003200);
    }

    #[test]
    fn json_rows_with_sub_attribute() {
        let dir = std::env::temp_dir().join("luna-idx-test");
        let _ = std::fs::create_dir_all(&dir);
        let yml = dir.join("t.yml");
        std::fs::write(&yml, r#"
id: t
name: Test
links: [ "https://example.invalid/" ]
search:
  path: api
  response: { type: json }
  rows: { selector: data.items, attribute: files }
  fields:
    title: { selector: ..name }
    infohash: { selector: hash }
    size: { selector: size }
    seeders: { selector: seeds }
"#).unwrap();
        let def = load(&yml).unwrap();
        assert_eq!(s(&def, "name"), "Test");
        let j: J = serde_json::json!({"data":{"items":[{"name":"Movie","files":[{"hash":"ABC","size":"2 GB","seeds":5}]}]}});
        let rows = json_path(&j, "data.items").unwrap().as_array().unwrap();
        let child = &rows[0]["files"][0];
        let cfg = HashMap::new(); let res = HashMap::new();
        let c = Ctx { keywords: String::new(), config: &cfg, result: &res };
        let f: Y = serde_yaml::from_str("{ selector: ..name }").unwrap();
        assert_eq!(field_value(&Row::Json { row: child, parent: Some(&rows[0]) }, &f, &c).as_deref(), Some("Movie"));
    }

    #[test]
    fn html_rows() {
        let html = Html::parse_document(r#"<table><tr class="r"><td><a class="t" href="/d/1">Some Title</a></td><td class="s">1.2 GB</td><td><a href="magnet:?xt=urn:btih:X">m</a></td></tr></table>"#);
        let sel = Selector::parse("tr.r").unwrap();
        let row = html.select(&sel).next().unwrap();
        let cfg = HashMap::new(); let res = HashMap::new();
        let c = Ctx { keywords: String::new(), config: &cfg, result: &res };
        let f: Y = serde_yaml::from_str("{ selector: a.t }").unwrap();
        assert_eq!(field_value(&Row::Html(row), &f, &c).as_deref(), Some("Some Title"));
        let f: Y = serde_yaml::from_str("{ selector: \"a[href^='magnet:']\", attribute: href }").unwrap();
        assert_eq!(field_value(&Row::Html(row), &f, &c).as_deref(), Some("magnet:?xt=urn:btih:X"));
        let f: Y = serde_yaml::from_str("{ selector: a.t, attribute: href, filters: [ { name: regexp, args: \"/d/(\\\\d+)\" } ] }").unwrap();
        let v = field_value(&Row::Html(row), &f, &c).unwrap();
        assert_eq!(apply_filters(v, f.get("filters"), &c), "1");
    }

    /// Full search against a throwaway local HTTP server (HTML listing + details-page magnet).
    #[tokio::test(flavor = "multi_thread")]
    async fn end_to_end_local_site() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten().take(4) {
                let mut st = stream;
                let mut buf = [0u8; 4096];
                let n = st.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let body = if req.starts_with("GET /search?q=open+movie") {
                    r#"<table><tr class="row"><td><a class="name" href="/item/7">Open Movie 1080p</a></td><td class="size">1.4 GB</td><td class="se">42</td><td class="le">3</td></tr></table>"#.to_string()
                } else if req.starts_with("GET /item/7") {
                    r#"<a id="dl" href="magnet:?xt=urn:btih:1234">get</a>"#.to_string()
                } else {
                    format!("unexpected: {}", req.lines().next().unwrap_or(""))
                };
                let _ = write!(st, "HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: {}
Connection: close

{}", body.len(), body);
            }
        });
        let dir = std::env::temp_dir().join("luna-idx-e2e");
        let _ = std::fs::create_dir_all(&dir);
        let yml = dir.join("local.yml");
        std::fs::write(&yml, format!(r#"
id: local
name: Local test
links: [ "http://127.0.0.1:{port}/" ]
search:
  paths:
    - path: search
  inputs:
    q: "{{{{ .Keywords }}}}"
  keywordsfilters:
    - name: tolower
  rows: {{ selector: tr.row }}
  fields:
    title: {{ selector: a.name }}
    details: {{ selector: a.name, attribute: href }}
    size: {{ selector: td.size }}
    seeders: {{ selector: td.se }}
    leechers: {{ selector: td.le }}
download:
  selectors:
    - selector: a#dl
      attribute: href
"#)).unwrap();
        let hits = search_one(&yml, "Open Movie").await.unwrap();
        assert_eq!(hits.len(), 1, "{:?}", hits.iter().map(|h| &h.title).collect::<Vec<_>>());
        let h = &hits[0];
        assert_eq!(h.title, "Open Movie 1080p");
        assert_eq!(h.seeders, 42);
        assert_eq!(h.size, 1503238553);
        assert!(h.link.is_none());
        let link = resolve(&yml, h.details.as_ref().unwrap()).await.unwrap();
        assert_eq!(link, "magnet:?xt=urn:btih:1234");
    }
}
