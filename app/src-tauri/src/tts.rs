//! Reading aloud with Microsoft Edge's natural voices ("Read aloud" in Edge).
//! Edge sends the text to Microsoft's speech service over a WebSocket and gets mp3 back, with the
//! time of every word, so the word being read can be marked on the page. Luna talks to the same
//! service the way Edge does. It isn't an official API: if Microsoft changes it, the reader falls
//! back to Windows' own voices.

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

#[cfg(test)]
mod tests {
    #[test]
    fn token_matches_edge_tts() {
        // generate_sec_ms_gec_v2(1700000000) in edge-tts
        assert_eq!(super::gec_at(1_700_000_000), "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2");
    }
    #[test]
    fn escapes_text() {
        assert_eq!(super::xml("a < b & \"c\""), "a &lt; b &amp; &quot;c&quot;");
    }
    /// cargo test tts_live -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn tts_live() {
        let t = std::time::Instant::now();
        let s = super::speak("Merhaba, bu Luna'nın sesli okuması. İkinci cümle burada.", "tr-TR-EmelNeural", 0).await.unwrap();
        println!("{:?} {} bytes, words {:?}", t.elapsed(), s.audio.len(), s.words.iter().map(|w| (&w.text, w.at)).collect::<Vec<_>>());
        assert!(s.audio.len() > 1000 && !s.words.is_empty());
        // TTS_OUT=file: what tts_speak sends to the page, for trying the reader without the app
        if let Ok(out) = std::env::var("TTS_OUT") {
            let w = serde_json::to_vec(&s.words).unwrap();
            let mut b = (w.len() as u32).to_le_bytes().to_vec();
            b.extend_from_slice(&w);
            b.extend_from_slice(&s.audio);
            std::fs::write(out, b).unwrap();
        }
        let v = super::voices().await.unwrap();
        println!("{} voices, tr: {:?}", v.len(), v.iter().filter(|x| x.locale.starts_with("tr")).map(|x| &x.name).collect::<Vec<_>>());
    }
}

const TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM: &str = "143.0.3650.75";
const BASE: &str = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";

fn major() -> &'static str {
    CHROMIUM.split('.').next().unwrap_or("143")
}

/// The changing code Edge sends with each request ("Sec-MS-GEC", version 2): built from the time
/// (in 5-minute steps) and Edge's token with a salted SHA-256 and a 64-bit checksum. Ported from the
/// open-source edge-tts project (rany2/edge-tts, drm.py), which follows what Edge does.
fn gec() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    gec_at(secs + SKEW.load(std::sync::atomic::Ordering::Relaxed))
}

/// How far the PC's clock is from Microsoft's (seconds), learned from a refused request.
static SKEW: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

fn gec_at(unix: i64) -> String {
    let mut ticks = unix + 11_644_473_600; // since 1601, the Windows file time epoch
    ticks -= ticks.rem_euclid(300);
    let data = format!("{}{}", ticks as u128 * 10_000_000, TOKEN).into_bytes();
    let digest = drm::sha256(&data);
    let (a, b) = drm::cs64(&data, &digest);
    let mut cs = a.to_le_bytes().to_vec();
    cs.extend_from_slice(&b.to_le_bytes());
    let hex = |x: &[u8]| x.iter().map(|b| format!("{b:02X}")).collect::<String>();
    format!("{}-{}", hex(&cs), hex(&digest))
}

mod drm {
    const INITIAL: [u32; 8] = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
    const STATE: [u32; 8] = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
    const SCHEDULE: [u32; 14] = [
        0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6, 0xF0C31573, 0x7058CE4E,
        0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564,
    ];
    const K: [u32; 64] = [
        0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01,
        0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
        0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147,
        0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
        0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08,
        0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
        0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
    ];
    const ADJ: u32 = 0xC9DC06A7;
    const SIGMA0_ADJ: u32 = 0x059C0B80;
    const SIGMA1_ADJ: u32 = 0x000B92C0;
    const CS64: [(u32, u32); 14] = [
        (0xE82E91B1, 0xB32700D0), (0x44DE24C6, 0x88DFF51D), (0x3BEB65BC, 0x29514038), (0xC89C5933, 0xB328CBDF),
        (0x8D1EC211, 0xD405B4D5), (0x314EF5D5, 0x26E55F3C), (0xE92491B1, 0x607801C6), (0xF0A5B9D5, 0x82B2C1FB),
        (0x06064CF3, 0xFA51A3DA), (0xDA79FA60, 0x207CC464), (0xBED20560, 0x3C3C74F3), (0x89F9C9F8, 0xD2D14B61),
        (0x35FA38C6, 0xBB04A2C1), (0xCB49E3C6, 0xC5626167),
    ];
    const CS64_FACTOR: u32 = 0x82893933;
    const CS64_ADJ0: u32 = 0xF2F90B1A;
    const CS64_ADJ1: u32 = 0x0B1A0000;

    fn rol16(v: u32) -> u32 {
        v.rotate_left(16)
    }
    fn s0(v: u32) -> u32 {
        v.rotate_right(7) ^ v.rotate_right(18) ^ (v >> 3)
    }
    fn s1(v: u32) -> u32 {
        v.rotate_right(17) ^ v.rotate_right(19) ^ (v >> 10)
    }
    fn expand(w: &mut Vec<u32>, from: usize) {
        for i in from..64 {
            let v = s1(w[i - 2]).wrapping_add(w[i - 7]).wrapping_add(s0(w[i - 15])).wrapping_add(w[i - 16]);
            w.push(v);
        }
    }
    fn rounds(state: [u32; 8], w: &[u32], first: usize) -> [u32; 8] {
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
        for i in first..64 {
            let k = if first == 14 && i == 14 { ADJ } else { K[i] };
            let t1 = h
                .wrapping_add(e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25))
                .wrapping_add(g ^ (e & (f ^ g)))
                .wrapping_add(k)
                .wrapping_add(w[i]);
            let t2 = (a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22)).wrapping_add((a & b) | (c & (a | b)));
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        [a, b, c, d, e, f, g, h]
    }
    fn add(x: [u32; 8], y: [u32; 8]) -> [u32; 8] {
        std::array::from_fn(|i| x[i].wrapping_add(y[i]))
    }
    fn init(d: &[u8]) -> [u32; 8] {
        let mut w = vec![0u32; 14];
        w.push(u32::from_be_bytes([0, d[0], d[1], d[2]]));
        w.push(u32::from_be_bytes([d[3], d[4], d[5], d[6]]));
        for i in 16..30 {
            let mut v = SCHEDULE[i - 16];
            if i - 2 >= 14 {
                v = v.wrapping_add(if i == 16 { s1(w[i - 2]) ^ SIGMA1_ADJ } else { s1(w[i - 2]) });
            }
            if i - 7 >= 14 {
                v = v.wrapping_add(w[i - 7]);
            }
            if i - 15 >= 14 {
                v = v.wrapping_add(if i == 29 { s0(w[i - 15]) ^ SIGMA0_ADJ } else { s0(w[i - 15]) });
            }
            w.push(v);
        }
        w.push(s1(w[28]).wrapping_add(w[23]).wrapping_add(s0(w[15])).wrapping_add(w[14]).wrapping_add(ADJ).wrapping_sub(K[14]));
        expand(&mut w, 31);
        add(INITIAL, rounds(STATE, &w, 14))
    }
    pub fn sha256(data: &[u8]) -> [u8; 32] {
        let len = 57 + data.len() as i64;
        let mut p = data[7..].to_vec();
        p.push(0x80);
        p.extend(std::iter::repeat_n(0, (55 - len).rem_euclid(64) as usize));
        p.extend_from_slice(&((len * 8) as u64).to_be_bytes());
        let mut st = init(&data[..7]);
        for blk in p.chunks(64) {
            let mut w: Vec<u32> = blk.chunks(4).map(|c| u32::from_be_bytes([c[0], c[1], c[2], c[3]])).collect();
            expand(&mut w, 16);
            st = add(st, rounds(st, &w, 0));
        }
        let mut out = [0u8; 32];
        for (i, v) in st.iter().enumerate() {
            out[i * 4..i * 4 + 4].copy_from_slice(&v.to_be_bytes());
        }
        out
    }
    pub fn cs64(data: &[u8], digest: &[u8; 32]) -> (u32, u32) {
        let ka = u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]]) | 1;
        let kb = u32::from_le_bytes([digest[4], digest[5], digest[6], digest[7]]) | 1;
        let fac = [ka.wrapping_mul(CS64_FACTOR), kb.wrapping_mul(CS64_FACTOR)];
        let mut terms: Vec<u32> = CS64.iter().enumerate().map(|(i, (c, _))| c.wrapping_mul(fac[i % 2])).collect();
        let mut offs: Vec<u32> = CS64.iter().map(|(_, o)| *o).collect();
        let mut bytes = vec![0u8];
        bytes.extend_from_slice(data);
        while bytes.len() % 4 != 0 {
            bytes.push(0);
        }
        let mut words: Vec<u32> = bytes.chunks(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
        if words.len() % 2 == 1 {
            words.push(0);
        }
        for (i, &wd) in words.iter().enumerate() {
            let even = i % 2 == 0;
            let mut t = wd.wrapping_mul(if even { ka } else { kb });
            let mut o = rol16(wd).wrapping_mul(if even { 0xEF0569FB } else { 0xC31713DB });
            if i == 0 {
                t = t.wrapping_add(CS64_ADJ0.wrapping_mul(fac[0]));
                o = o.wrapping_add(CS64_ADJ1);
            }
            terms.push(t);
            offs.push(o);
        }
        let (mut swap_acc, mut swap_last, mut state, mut acc) = (0u32, 0u32, 0u32, 0u32);
        for i in (0..terms.len()).step_by(2) {
            let (x, y) = (terms[i], terms[i + 1]);
            let q = rol16(offs[i].wrapping_add(x)).wrapping_mul(0x76F50F34);
            swap_acc = swap_acc.wrapping_add(rol16(q).wrapping_mul(0xC3EFEA97).wrapping_add(q));
            let q = rol16(offs[i + 1].wrapping_add(y)).wrapping_mul(0x1881CE3C);
            swap_last = rol16(q).wrapping_mul(0x35BD1EC9).wrapping_add(q);
            swap_acc = swap_acc.wrapping_add(swap_last);
            state = state.wrapping_mul(ka).wrapping_add(x);
            state = rol16(state).wrapping_mul(0xCF98B111);
            state = rol16(state).wrapping_mul(0x87085B9F);
            state = rol16(state).wrapping_mul(0x12CEB96D);
            state = rol16(state).wrapping_mul(0x257E1D83);
            acc = acc.wrapping_add(state);
            let mut t = state.wrapping_mul(kb).wrapping_add(y);
            t = rol16(t).wrapping_mul(0xA27416F5);
            t = rol16(t).wrapping_mul(0xD38396FF);
            state = rol16(rol16(t).wrapping_mul(0x7C932B89)).wrapping_mul(0xBFA49F69);
            acc = acc.wrapping_add(state);
        }
        (swap_last ^ state, swap_acc ^ acc)
    }
}

/// TLS with ring (two crypto providers are built into the app, so rustls can't pick one by itself).
fn tls() -> tokio_tungstenite::Connector {
    static CFG: std::sync::OnceLock<std::sync::Arc<rustls::ClientConfig>> = std::sync::OnceLock::new();
    let c = CFG.get_or_init(|| {
        let roots = rustls::RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() };
        let cfg = rustls::ClientConfig::builder_with_provider(std::sync::Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .expect("tls versions")
            .with_root_certificates(roots)
            .with_no_client_auth();
        std::sync::Arc::new(cfg)
    });
    tokio_tungstenite::Connector::Rustls(c.clone())
}

fn rand_hex(n: usize) -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut out = String::new();
    while out.len() < n {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out.truncate(n);
    out
}

fn stamp() -> String {
    chrono::Utc::now().format("%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)").to_string()
}

fn xml(t: &str) -> String {
    t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

#[derive(Serialize, Clone)]
pub struct Word {
    pub text: String,
    /// where the word starts and how long it lasts in the audio, in seconds
    pub at: f64,
    pub dur: f64,
}

pub struct Speech {
    pub audio: Vec<u8>,
    pub words: Vec<Word>,
}

/// Reads `text` with `voice` (e.g. "tr-TR-EmelNeural"); `rate` is a percentage change (-50 … +100).
pub async fn speak(text: &str, voice: &str, rate: i32) -> Result<Speech, String> {
    match speak_once(text, voice, rate).await {
        // the PC's clock was off; it was corrected from Microsoft's answer, so once more
        Err(e) if e == CLOCK => speak_once(text, voice, rate).await,
        // the service now and then drops a connection when asked quickly in a row: once more after a moment
        Err(e) if e != "403" => {
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            speak_once(text, voice, rate).await
        }
        r => r,
    }
}

const CLOCK: &str = "clock";

async fn speak_once(text: &str, voice: &str, rate: i32) -> Result<Speech, String> {
    let url = format!(
        "wss://{BASE}/edge/v1?TrustedClientToken={TOKEN}&ConnectionId={}&Sec-MS-GEC={}&Sec-MS-GEC-Version=2-{CHROMIUM}",
        rand_hex(32),
        gec()
    );
    let mut req = url.into_client_request().map_err(|e| e.to_string())?;
    let h = req.headers_mut();
    let ua = format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{m}.0.0.0 Safari/537.36 Edg/{m}.0.0.0",
        m = major()
    );
    for (k, v) in [
        ("Pragma", "no-cache".to_string()),
        ("Cache-Control", "no-cache".to_string()),
        ("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold".to_string()),
        ("User-Agent", ua),
        ("Accept-Language", "en-US,en;q=0.9".to_string()),
        ("Cookie", format!("muid={};", rand_hex(32).to_uppercase())),
    ] {
        h.insert(k, HeaderValue::from_str(&v).map_err(|e| e.to_string())?);
    }
    let connect = tokio_tungstenite::connect_async_tls_with_config(req, None, false, Some(tls()));
    let (mut ws, _) = match tokio::time::timeout(std::time::Duration::from_secs(8), connect).await.map_err(|_| "timeout".to_string())? {
        Ok(x) => x,
        Err(tokio_tungstenite::tungstenite::Error::Http(r)) if r.status() == 403 && SKEW.load(std::sync::atomic::Ordering::Relaxed) == 0 => {
            // refused: the code is made from the time, so the PC's clock may be wrong; Microsoft says its own
            let server = r.headers().get("Date").and_then(|d| d.to_str().ok()).and_then(|d| chrono::DateTime::parse_from_rfc2822(d).ok());
            let Some(server) = server else { return Err("403".into()) };
            let off = server.timestamp() - chrono::Utc::now().timestamp();
            if off.abs() < 60 {
                return Err("403".into());
            }
            SKEW.store(off, std::sync::atomic::Ordering::Relaxed);
            return Err(CLOCK.into());
        }
        Err(e) => return Err(e.to_string()),
    };
    let config = format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n\
         {{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"true\"}},\
         \"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}\r\n",
        stamp()
    );
    ws.send(Message::Text(config.into())).await.map_err(|e| e.to_string())?;
    let lang = voice.splitn(3, '-').take(2).collect::<Vec<_>>().join("-");
    let ssml = format!(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{lang}'><voice name='{voice}'>\
         <prosody pitch='+0Hz' rate='{rate:+}%' volume='+0%'>{}</prosody></voice></speak>",
        xml(text)
    );
    let msg = format!(
        "X-RequestId:{}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}Z\r\nPath:ssml\r\n\r\n{ssml}",
        rand_hex(32),
        stamp()
    );
    ws.send(Message::Text(msg.into())).await.map_err(|e| e.to_string())?;

    let mut audio = Vec::new();
    let mut words = Vec::new();
    loop {
        let next = tokio::time::timeout(std::time::Duration::from_secs(15), ws.next()).await.map_err(|_| "timeout".to_string())?;
        let Some(m) = next else { break };
        match m.map_err(|e| e.to_string())? {
            Message::Text(t) => {
                let (head, body) = t.split_once("\r\n\r\n").unwrap_or((&t, ""));
                if head.contains("Path:turn.end") {
                    break;
                }
                if head.contains("Path:audio.metadata") {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
                        for x in v["Metadata"].as_array().into_iter().flatten() {
                            if x["Type"] != "WordBoundary" {
                                continue;
                            }
                            let d = &x["Data"];
                            words.push(Word {
                                text: d["text"]["Text"].as_str().unwrap_or("").to_string(),
                                at: d["Offset"].as_f64().unwrap_or(0.0) / 1e7,
                                dur: d["Duration"].as_f64().unwrap_or(0.0) / 1e7,
                            });
                        }
                    }
                }
            }
            Message::Binary(b) => {
                // two bytes of header length, the header, then the sound
                if b.len() < 2 {
                    continue;
                }
                let n = u16::from_be_bytes([b[0], b[1]]) as usize;
                if b.len() > 2 + n && String::from_utf8_lossy(&b[2..2 + n]).contains("Path:audio") {
                    audio.extend_from_slice(&b[2 + n..]);
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    let _ = ws.close(None).await;
    if audio.is_empty() {
        return Err("no audio".into());
    }
    Ok(Speech { audio, words })
}

#[derive(Serialize, Clone)]
pub struct Voice {
    pub name: String,
    pub locale: String,
    pub gender: String,
    pub label: String,
    /// Microsoft's kinds for the voice: "Copilot", "Novel", "News", "Conversation", "Cartoon", "General"
    pub kinds: Vec<String>,
}

/// All of Edge's natural voices (about 300, in some 75 languages).
pub async fn voices() -> Result<Vec<Voice>, String> {
    let url = format!(
        "https://{BASE}/voices/list?trustedclienttoken={TOKEN}&Sec-MS-GEC={}&Sec-MS-GEC-Version=2-{CHROMIUM}",
        gec()
    );
    let ua = format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{m}.0.0.0 Safari/537.36 Edg/{m}.0.0.0",
        m = major()
    );
    let v: Vec<serde_json::Value> = reqwest::Client::new()
        .get(url)
        .header("User-Agent", ua)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(v.iter()
        .filter_map(|x| {
            let name = x["ShortName"].as_str()?.to_string();
            // "tr-TR-EmelNeural" → "Emel"
            let label = name.rsplit('-').next().unwrap_or(&name).trim_end_matches("Neural").trim_end_matches("Multilingual").to_string();
            let kinds = x["VoiceTag"]["ContentCategories"].as_array().into_iter().flatten().filter_map(|c| c.as_str().map(String::from)).collect();
            Some(Voice { locale: x["Locale"].as_str().unwrap_or("").to_string(), gender: x["Gender"].as_str().unwrap_or("").to_string(), label, name, kinds })
        })
        .collect())
}
