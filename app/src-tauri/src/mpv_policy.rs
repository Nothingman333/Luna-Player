//! Validation at the untrusted webview -> mpv boundary. Native code calls Mpv directly.
use serde_json::Value;

const WRITABLE: &[&str] = &[
    "ab-loop-a", "ab-loop-b", "aid", "audio-delay", "chapter", "cscale", "deband", "dscale",
    "force-media-title", "glsl-shaders", "hwdec", "interpolation", "loop-file", "mute", "panscan",
    "pause", "replaygain", "scale", "secondary-sid", "sid", "slang", "speed", "sub-ass-override",
    "sub-back-color", "sub-blur", "sub-bold", "sub-border-style", "sub-color", "sub-delay", "sub-font",
    "sub-font-size", "sub-margin-y", "sub-outline-color", "sub-outline-size", "sub-pos",
    "sub-shadow-offset", "sub-speed", "sub-visibility", "tscale", "vid", "video-aspect-override",
    "video-rotate", "video-sync", "video-zoom", "volume", "volume-max", "ytdl-format",
    "brightness", "contrast", "saturation", "gamma", "hue",
];
const FILE_OPTIONS: &[&str] = &[
    "start", "sub-delay", "audio-delay", "aid", "sid", "sub-speed", "secondary-sid", "vid", "speed",
    "loop-file", "pause", "ytdl-format", "user-agent", "referrer",
];

/// Parse mpv's byte-length escaping, so a comma inside a user-agent cannot inject an option.
/// Reject unsupported syntax instead of trying to guess what mpv will interpret.
pub fn file_options(text: &str) -> Option<Vec<(String, String)>> {
    let mut rest = text;
    let mut out = Vec::new();
    while !rest.is_empty() {
        let (key, tail) = rest.split_once('=')?;
        if !FILE_OPTIONS.contains(&key) { return None; }
        let (value, tail) = if let Some(encoded) = tail.strip_prefix('%') {
            let (size, body) = encoded.split_once('%')?;
            if size.is_empty() || !size.bytes().all(|b| b.is_ascii_digit()) { return None; }
            let n: usize = size.parse().ok()?;
            let value = body.get(..n)?;
            let tail = body.get(n..)?;
            (value, tail)
        } else {
            let (value, tail) = tail.find(',').map_or((tail, ""), |i| (&tail[..i], &tail[i..]));
            if value.contains(['%', '"', '\'', '\\', '\0', '\n', '\r']) { return None; }
            (value, tail)
        };
        if value.contains(['\0','\n','\r']) { return None; }
        if key == "referrer" { let u=tauri::Url::parse(value).ok()?;if !matches!(u.scheme(),"http"|"https")||!u.username().is_empty()||u.password().is_some()||value.len()>8192{return None;} }
        else if key != "user-agent" && value.contains(',') { return None; }
        out.push((key.to_string(), value.to_string()));
        if tail.is_empty() { break; }
        rest = tail.strip_prefix(',')?;
        if rest.is_empty() { return None; }
    }
    Some(out)
}

fn filters_ok(text: &str, audio: bool) -> bool {
    if text.is_empty() { return true; }
    // No arbitrary lavfi graph: only numerical parameters of the specific filters Luna builds.
    let graph = if audio {
        r"(?:highpass=f=[0-9.]+|(?:equalizer|lowshelf|highshelf)=f=[0-9.]+:t=[oq]:w=[0-9.]+:g=-?[0-9.]+|acompressor=threshold=[0-9.]+:ratio=[0-9.]+:attack=[0-9.]+:release=[0-9.]+:makeup=[0-9.]+|dynaudnorm=f=[0-9.]+:g=[0-9.]+:p=[0-9.]+:m=[0-9.]+|volume=-?[0-9.]+dB)"
    } else {
        r"(?:hqdn3d=[0-9.]+:[0-9.]+:[0-9.]+:[0-9.]+|cas=[0-9.]+)"
    };
    let label = r"(?:@[A-Za-z0-9_]+:)?";
    let lavfi = format!(r"{label}lavfi=\[{graph}(?:,{graph})*\]");
    let entry = if audio { format!(r"(?:{lavfi}|@luna_karaoke:lavfi=\[pan=stereo\|c0=c0-c1\|c1=c1-c0\])") } else {
        format!(r"(?:{lavfi}|{label}d3d11vpp=format=nv12:scale=[12](?:\.[0-9]+)?:scaling-mode=(?:nvidia|intel))")
    };
    regex::Regex::new(&format!(r"^(?:{entry})(?:,{entry})*$")).is_ok_and(|r| r.is_match(text))
}

fn property_ok(name: &str, value: Option<&Value>) -> bool {
    if matches!(name, "af" | "vf") {
        return value.and_then(Value::as_str).is_some_and(|s| filters_ok(s, name == "af"));
    }
    WRITABLE.contains(&name)
}

pub fn validate(args: &Value) -> Result<(), String> {
    let ok = (|| -> Option<bool> {
        let a = args.as_array()?;
        if a.is_empty() || a.len() > 64 || a.iter().any(|v| v.is_object() || v.is_null()) { return Some(false); }
        let command = a[0].as_str()?;
        Some(match command {
            "loadfile" => (2..=5).contains(&a.len()) && a[1].is_string()
                && a.get(2).is_none_or(|v| matches!(v.as_str(), Some("replace" | "append" | "append-play")))
                && a.get(3).is_none_or(|v| v.as_i64().is_some() || v.as_str().is_some_and(|s| s.parse::<i64>().is_ok()))
                && a.get(4).is_none_or(|v| v.as_str().and_then(file_options).is_some()),
            "set_property" | "set" => a.len() == 3 && property_ok(a[1].as_str()?, a.get(2)),
            "cycle" | "add" | "multiply" | "cycle-values" => (2..=16).contains(&a.len())
                && WRITABLE.contains(&a[1].as_str()?),
            "observe_property" => a.len() == 3 && a[1].as_u64().is_some() && a[2].is_string(),
            "unobserve_property" => a.len() == 2 && a[1].as_u64().is_some(),
            "get_property" => a.len() == 2 && a[1].is_string(),
            "af" | "vf" => a.len() == 3 && match a[1].as_str()? {
                "add" | "set" => a[2].as_str().is_some_and(|s| filters_ok(s, command == "af")),
                "remove" => a[2].as_str().is_some_and(|s| s.starts_with('@') && s[1..].bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')),
                _ => false,
            },
            "seek" | "revert-seek" | "frame-step" | "frame-back-step" | "sub-add" | "sub-remove" |
            "sub-reload" | "sub-step" | "sub-seek" | "audio-add" | "stop" => a.len() <= 5,
            // The target directory is fixed in native startup; no screenshot-to-file command is allowed.
            "screenshot" => a.len() == 2 && matches!(a[1].as_str(), Some("video" | "subtitles" | "window")),
            _ => false,
        })
    })().unwrap_or(false);
    if ok { Ok(()) } else { Err("This mpv command or option is not allowed".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn reject_execution_and_option_bypasses() {
        for args in [json!(["run", "calc"]), json!(["subprocess", {"args":["calc"]}]),
            json!(["load-script", "x.lua"]), json!(["set_property", "options/script-opts", "x"]),
            json!(["set_property", "ytdl-raw-options", "exec=calc"]),
            json!(["loadfile", "a", "replace", -1, "start=0,scripts=x.lua"]),
            json!(["loadfile", "a", "replace", -1, "start=0,--script-opts=x"]),
            json!(["loadfile", "a", "replace", "script-opts=x"]),
            json!(["vf", "add", "lavfi=[metadata=mode=print:file=evil]"]),
            json!(["set_property", "af", "lavfi=[amovie=evil]"]),
            json!(["af", "add", "@luna_karaoke:lavfi=[pan=stereo|c0=c0-c1|c1=c1-c0,amovie=evil]"]),
            json!(["cycle-values", "vf", "lavfi=[movie=evil]"]),
            json!(["screenshot-to-file", "evil"])] {
            assert!(validate(&args).is_err(), "accepted {args}");
        }
    }
    #[test]
    fn preserve_actual_luna_commands_and_encoded_commas() {
        for args in [json!(["screenshot", "video"]), json!(["multiply", "speed", 1.1]),
            json!(["loadfile", "film.mkv", "replace", -1, "start=12,aid=1,sid=no,sub-delay=-0.5"]),
            json!(["af", "add", "@luna_voice:lavfi=[highpass=f=80,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=2500:t=q:w=1.1:g=5]"]),
            json!(["af", "add", "@luna_karaoke:lavfi=[pan=stereo|c0=c0-c1|c1=c1-c0]"]),
            json!(["set_property", "vf", "@dn:lavfi=[hqdn3d=1.0:0.8:1.5:1.1],@sharp:lavfi=[cas=0.50]"]),
            json!(["vf", "add", "@vsr:d3d11vpp=format=nv12:scale=2:scaling-mode=nvidia"])] {
            assert!(validate(&args).is_ok(), "rejected {args}");
        }
        assert_eq!(file_options("user-agent=%6%a,b=cd,start=2").unwrap()[0].1,"a,b=cd");
        assert!(file_options("user-agent=%3%é,start=2").is_none());
        assert!(file_options("start=%14%1,script-opts=x").is_none());
    }
}

#[cfg(test)]mod web_referrer_tests{use super::*;use serde_json::json;#[test]fn browser_referrer(){let u="https://page.test/watch?q=a,b";let opt=format!("start=0,referrer=%{}%{}",u.len(),u);assert!(validate(&json!(["loadfile","https://media.test/a.m3u8","replace",-1,opt])).is_ok());for bad in ["referrer=file:///secret","referrer=https://u:p@page.test/","referrer=https://page.test/,scripts=x.lua","referrer=%21%https://page.test/\r\n"]{assert!(file_options(bad).is_none(),"{bad}");}}}
