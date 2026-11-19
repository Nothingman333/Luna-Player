//! Birlikte izle: two or more Lunas watch the same film without a Luna server.
//! The host opens a fresh iroh endpoint (encrypted QUIC, dialled by public key) for every room; the invite link
//! carries that key and a random token: `luna://izle/<key>?k=<token>`. Only small JSON messages travel (play, pause,
//! seek, chat); video never does. Closing the room drops the endpoint and its key forever, so the old link can't reach
//! anything again. A new room always gets a new key. UPnP port mapping is not compiled in (no `portmapper` feature):
//! no router port is opened; iroh punches through NAT or falls back to the public n0 relay, which only sees
//! encrypted bytes. Every guest waits for the host's explicit approval.

use iroh::endpoint::{presets, Connection, RecvStream, SendStream};
use iroh::{Endpoint, EndpointId, SecretKey};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::{mpsc, oneshot};

const ALPN: &[u8] = b"luna/izle/1";
const MAX_FRAME: usize = 16 * 1024;
const MAX_GUESTS: usize = 8;
/// Messages a peer may send per second before the rest of that second is dropped.
const RATE: u32 = 30;
/// Message kinds a guest may send; anything else is dropped by the host.
const GUEST_KINDS: [&str; 4] = ["chat", "react", "sync", "state"];

static GENERATION: AtomicU64 = AtomicU64::new(0);
static ROOM: Mutex<Option<Room>> = Mutex::new(None);

struct Peer {
    name: String,
    tx: mpsc::Sender<Value>,
    conn: Connection,
}

enum Role {
    Host { token: String, link: String, pending: HashMap<String, oneshot::Sender<bool>>, banned: HashSet<String>, everyone: bool },
    Guest,
}

struct Room {
    generation: u64,
    endpoint: Endpoint,
    name: String,
    role: Role,
    /// host: the approved guests by endpoint id; guest: only the host, under the key "host"
    peers: HashMap<String, Peer>,
}

fn lock() -> std::sync::MutexGuard<'static, Option<Room>> {
    ROOM.lock().unwrap_or_else(|e| e.into_inner())
}

fn trusted(caller: &tauri::Webview) -> Result<(), String> {
    if caller.label() == "main" { Ok(()) } else { Err("Main Luna window required".into()) }
}

fn emit(app: &tauri::AppHandle, value: Value) {
    let _ = app.emit_to("main", "party", value);
}

fn clean_name(raw: &str) -> String {
    let n: String = raw.chars().filter(|c| !c.is_control()).take(40).collect::<String>().trim().to_string();
    if n.is_empty() { "Misafir".into() } else { n }
}

fn random_token() -> String {
    use ring::rand::SecureRandom;
    let mut b = [0u8; 16];
    let _ = ring::rand::SystemRandom::new().fill(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// `luna://izle/<endpoint key>?k=<token>` → the key and the token; `None` for anything else.
pub fn parse_link(raw: &str) -> Option<(EndpointId, String)> {
    if raw.len() > 512 {
        return None;
    }
    let link = url::Url::parse(raw.trim()).ok()?;
    if link.scheme() != "luna" || !link.host_str()?.eq_ignore_ascii_case("izle") {
        return None;
    }
    let id: EndpointId = link.path().trim_matches('/').parse().ok()?;
    let token = link.query_pairs().find(|(k, _)| k == "k")?.1.to_string();
    (token.len() == 32 && token.bytes().all(|b| b.is_ascii_hexdigit())).then_some((id, token))
}

/// The first watch-party link among the arguments Luna was started with.
pub fn from_args<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter().find(|a| parse_link(a).is_some())
}

fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

async fn write_frame(s: &mut SendStream, v: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(v).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FRAME {
        return Err("message too large".into());
    }
    s.write_all(&(bytes.len() as u32).to_be_bytes()).await.map_err(|e| e.to_string())?;
    s.write_all(&bytes).await.map_err(|e| e.to_string())
}

async fn read_frame(r: &mut RecvStream) -> Result<Value, String> {
    let mut head = [0u8; 4];
    r.read_exact(&mut head).await.map_err(|e| e.to_string())?;
    let len = u32::from_be_bytes(head) as usize;
    if len == 0 || len > MAX_FRAME {
        return Err("bad frame".into());
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await.map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_slice(&buf).map_err(|e| e.to_string())?;
    if v.is_object() { Ok(v) } else { Err("bad message".into()) }
}

/// A writer task per peer: frames go out in order; dropping the sender ends it.
fn spawn_writer(mut send: SendStream) -> mpsc::Sender<Value> {
    let (tx, mut rx) = mpsc::channel::<Value>(64);
    tauri::async_runtime::spawn(async move {
        while let Some(v) = rx.recv().await {
            if write_frame(&mut send, &v).await.is_err() {
                break;
            }
        }
        let _ = send.finish();
    });
    tx
}

struct Bucket { start: Instant, count: u32 }
impl Bucket {
    fn new() -> Self { Bucket { start: Instant::now(), count: 0 } }
    fn allow(&mut self) -> bool {
        if self.start.elapsed() >= Duration::from_secs(1) { self.start = Instant::now(); self.count = 0; }
        self.count += 1;
        self.count <= RATE
    }
}

fn members(room: &Room) -> Value {
    let mut list = vec![];
    match room.role {
        Role::Host { .. } => {
            list.push(json!({"id": "host", "name": room.name, "host": true, "me": true}));
            for (id, p) in &room.peers { list.push(json!({"id": id, "name": p.name, "host": false})); }
        }
        Role::Guest => {}
    }
    Value::Array(list)
}

/// Host: sends the member list to every guest (each sees itself marked) and to the host's own window.
fn broadcast_members(app: &tauri::AppHandle, room: &Room) {
    let list = members(room);
    for (id, p) in &room.peers {
        let mine: Vec<Value> = list.as_array().into_iter().flatten().map(|m| {
            let mut m = m.clone();
            m["me"] = json!(m["id"].as_str() == Some(id.as_str()));
            m
        }).collect();
        let _ = p.tx.try_send(json!({"t": "members", "list": mine}));
    }
    emit(app, json!({"kind": "members", "list": list}));
}

fn status_of(room: &Option<Room>) -> Value {
    match room {
        None => json!({"open": false}),
        Some(r) => match &r.role {
            Role::Host { link, everyone, .. } => json!({"open": true, "host": true, "link": link, "everyone": everyone, "members": members(r), "name": r.name}),
            Role::Guest => json!({"open": true, "host": false, "name": r.name}),
        },
    }
}

#[tauri::command]
pub fn party_status(caller: tauri::Webview) -> Result<Value, String> {
    trusted(&caller)?;
    Ok(status_of(&lock()))
}

/// A watch-party link Luna was started with (cold start from a clicked link). The window asks before joining.
#[tauri::command]
pub fn party_startup_link(caller: tauri::Webview) -> Result<Option<String>, String> {
    trusted(&caller)?;
    Ok(from_args(std::env::args().skip(1)))
}

async fn bind(secret: Option<SecretKey>, accept: bool) -> Result<Endpoint, String> {
    let mut b = Endpoint::builder(presets::N0);
    if let Some(k) = secret { b = b.secret_key(k); }
    if accept { b = b.alpns(vec![ALPN.to_vec()]); }
    b.bind().await.map_err(|e| format!("Bağlantı başlatılamadı: {e}"))
}

#[tauri::command]
pub async fn party_host(app: tauri::AppHandle, caller: tauri::Webview, name: String) -> Result<Value, String> {
    trusted(&caller)?;
    if lock().is_some() {
        return Err("Zaten bir odadasın".into());
    }
    // a brand-new key for this room only: once it is closed, nothing answers this key again
    let endpoint = bind(Some(SecretKey::generate()), true).await?;
    if tokio::time::timeout(Duration::from_secs(12), endpoint.online()).await.is_err() {
        endpoint.close().await;
        return Err("İnternete bağlanılamadı, oda açılamadı".into());
    }
    let token = random_token();
    let link = format!("luna://izle/{}?k={token}", endpoint.id());
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let taken = {
        let mut g = lock();
        let taken = g.is_some();
        if !taken {
            *g = Some(Room {
                generation,
                endpoint: endpoint.clone(),
                name: clean_name(&name),
                role: Role::Host { token, link, pending: HashMap::new(), banned: HashSet::new(), everyone: false },
                peers: HashMap::new(),
            });
        }
        taken
    };
    if taken {
        endpoint.close().await;
        return Err("Zaten bir odadasın".into());
    }
    let accept_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(incoming) = endpoint.accept().await {
            let app = accept_app.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(conn) = incoming.await {
                    let _ = serve_guest(app, generation, conn).await;
                }
            });
        }
    });
    Ok(status_of(&lock()))
}

fn alive(generation: u64) -> bool {
    lock().as_ref().is_some_and(|r| r.generation == generation)
}

async fn serve_guest(app: tauri::AppHandle, generation: u64, conn: Connection) -> Result<(), String> {
    let id = conn.remote_id().to_string();
    let (send, mut recv) = tokio::time::timeout(Duration::from_secs(15), conn.accept_bi()).await.map_err(|_| "timeout")?.map_err(|e| e.to_string())?;
    let hello = tokio::time::timeout(Duration::from_secs(15), read_frame(&mut recv)).await.map_err(|_| "timeout")??;
    let tx = spawn_writer(send);
    let name = clean_name(hello["name"].as_str().unwrap_or(""));
    // token, room size and bans are checked before the host is even asked
    let (answer_rx, refusal) = {
        let mut g = lock();
        let Some(room) = g.as_mut().filter(|r| r.generation == generation) else { return Err("closed".into()) };
        let guests = room.peers.len();
        let Role::Host { token, pending, banned, .. } = &mut room.role else { return Err("not host".into()) };
        if !same(hello["token"].as_str().unwrap_or(""), token) || hello["t"] != "hello" {
            (None, Some("closed"))
        } else if banned.contains(&id) {
            (None, Some("rejected"))
        } else if guests + pending.len() >= MAX_GUESTS || pending.contains_key(&id) || room.peers.contains_key(&id) {
            (None, Some("full"))
        } else {
            let (otx, orx) = oneshot::channel();
            pending.insert(id.clone(), otx);
            (Some(orx), None)
        }
    };
    if let Some(reason) = refusal {
        let _ = tx.send(json!({"t": "refused", "reason": reason})).await;
        tokio::time::sleep(Duration::from_millis(400)).await;
        conn.close(1u32.into(), reason.as_bytes());
        return Ok(());
    }
    emit(&app, json!({"kind": "request", "id": id, "name": name}));
    let approved = tokio::select! {
        a = tokio::time::timeout(Duration::from_secs(120), answer_rx.expect("pending")) => matches!(a, Ok(Ok(true))),
        _ = conn.closed() => false,
    };
    {
        let mut g = lock();
        if let Some(Room { role: Role::Host { pending, .. }, .. }) = g.as_mut().filter(|r| r.generation == generation) { pending.remove(&id); }
    }
    emit(&app, json!({"kind": "requestDone", "id": id}));
    if !approved || !alive(generation) {
        let _ = tx.send(json!({"t": "refused", "reason": "rejected"})).await;
        tokio::time::sleep(Duration::from_millis(400)).await;
        conn.close(1u32.into(), b"rejected");
        return Ok(());
    }
    {
        let mut g = lock();
        let Some(room) = g.as_mut().filter(|r| r.generation == generation) else { return Ok(()) };
        let everyone = matches!(room.role, Role::Host { everyone: true, .. });
        let _ = tx.try_send(json!({"t": "welcome", "host": room.name, "everyone": everyone}));
        room.peers.insert(id.clone(), Peer { name: name.clone(), tx: tx.clone(), conn: conn.clone() });
        broadcast_members(&app, room);
    }
    emit(&app, json!({"kind": "joined", "id": id, "name": name}));
    let mut bucket = Bucket::new();
    loop {
        let msg = tokio::select! {
            m = read_frame(&mut recv) => m,
            _ = conn.closed() => Err("closed".into()),
        };
        let Ok(mut msg) = msg else { break };
        if msg["t"] == "bye" { break; }
        let kind = msg["t"].as_str().unwrap_or("").to_string();
        if !GUEST_KINDS.contains(&kind.as_str()) || !bucket.allow() { continue; }
        let g = lock();
        let Some(room) = g.as_ref().filter(|r| r.generation == generation) else { break };
        // host-only control: a guest's play/pause/seek is dropped, chat still goes through
        if kind == "sync" && matches!(room.role, Role::Host { everyone: false, .. }) { continue; }
        msg["from"] = json!(id);
        msg["name"] = json!(name);
        for (pid, p) in &room.peers { if *pid != id { let _ = p.tx.try_send(msg.clone()); } }
        drop(g);
        emit(&app, json!({"kind": "msg", "data": msg}));
    }
    let mut g = lock();
    if let Some(room) = g.as_mut().filter(|r| r.generation == generation) {
        if room.peers.remove(&id).is_some() {
            broadcast_members(&app, room);
            drop(g);
            emit(&app, json!({"kind": "left", "id": id, "name": name}));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn party_answer(caller: tauri::Webview, id: String, allow: bool) -> Result<(), String> {
    trusted(&caller)?;
    let mut g = lock();
    if let Some(Room { role: Role::Host { pending, .. }, .. }) = g.as_mut() {
        if let Some(tx) = pending.remove(&id) { let _ = tx.send(allow); }
    }
    Ok(())
}

#[tauri::command]
pub fn party_kick(app: tauri::AppHandle, caller: tauri::Webview, id: String) -> Result<(), String> {
    trusted(&caller)?;
    let mut g = lock();
    let Some(room) = g.as_mut() else { return Ok(()) };
    let Role::Host { banned, .. } = &mut room.role else { return Err("Yalnız oda sahibi çıkarabilir".into()) };
    banned.insert(id.clone());
    if let Some(p) = room.peers.remove(&id) {
        let _ = p.tx.try_send(json!({"t": "kicked"}));
        let conn = p.conn.clone();
        tauri::async_runtime::spawn(async move { tokio::time::sleep(Duration::from_millis(400)).await; conn.close(2u32.into(), b"kicked"); });
        broadcast_members(&app, room);
        drop(g);
        emit(&app, json!({"kind": "left", "id": id, "name": p.name, "kicked": true}));
    }
    Ok(())
}

#[tauri::command]
pub fn party_mode(caller: tauri::Webview, everyone: bool) -> Result<(), String> {
    trusted(&caller)?;
    let mut g = lock();
    let Some(room) = g.as_mut() else { return Ok(()) };
    let Role::Host { everyone: e, .. } = &mut room.role else { return Err("Yalnız oda sahibi değiştirebilir".into()) };
    *e = everyone;
    for p in room.peers.values() { let _ = p.tx.try_send(json!({"t": "mode", "everyone": everyone})); }
    Ok(())
}

/// Sends one message (chat, reaction, sync) to the room. The host's goes to every guest; a guest's goes to the host,
/// who passes it on.
#[tauri::command]
pub fn party_send(caller: tauri::Webview, data: Value) -> Result<(), String> {
    trusted(&caller)?;
    let kind = data["t"].as_str().unwrap_or("");
    if !GUEST_KINDS.contains(&kind) || serde_json::to_vec(&data).map(|b| b.len()).unwrap_or(usize::MAX) > MAX_FRAME - 512 {
        return Err("Geçersiz mesaj".into());
    }
    let g = lock();
    let Some(room) = g.as_ref() else { return Err("Oda yok".into()) };
    let mut msg = data;
    if matches!(room.role, Role::Host { .. }) { msg["from"] = json!("host"); msg["name"] = json!(room.name); }
    for p in room.peers.values() { let _ = p.tx.try_send(msg.clone()); }
    Ok(())
}

/// Host: closes the room for everyone; the endpoint and its key are dropped, so the link stops working for good.
/// Guest: leaves the room; the room stays open for the others.
#[tauri::command]
pub async fn party_close(app: tauri::AppHandle, caller: tauri::Webview) -> Result<(), String> {
    trusted(&caller)?;
    let Some(room) = lock().take() else { return Ok(()) };
    let host = matches!(room.role, Role::Host { .. });
    if let Role::Host { pending, .. } = room.role {
        for (_, tx) in pending { let _ = tx.send(false); }
    }
    for p in room.peers.values() { let _ = p.tx.try_send(json!({"t": if host { "closed" } else { "bye" }})); }
    tokio::time::sleep(Duration::from_millis(300)).await;
    for p in room.peers.values() { p.conn.close(0u32.into(), b"closed"); }
    let _ = tokio::time::timeout(Duration::from_secs(3), room.endpoint.close()).await;
    emit(&app, json!({"kind": "ended", "reason": if host { "closedByMe" } else { "left" }}));
    Ok(())
}

#[tauri::command]
pub async fn party_join(app: tauri::AppHandle, caller: tauri::Webview, link: String, name: String) -> Result<Value, String> {
    trusted(&caller)?;
    let (id, token) = parse_link(&link).ok_or("Bu bir Luna izleme linki değil")?;
    if lock().is_some() {
        return Err("Zaten bir odadasın".into());
    }
    let endpoint = bind(None, false).await?;
    let fail = |e: &str| { let e = e.to_string(); let ep = endpoint.clone(); async move { ep.close().await; Err::<Value, String>(e) } };
    let conn = match tokio::time::timeout(Duration::from_secs(25), endpoint.connect(id, ALPN)).await {
        Ok(Ok(c)) => c,
        _ => return fail("Bu oda kapatıldı ya da şu an ulaşılamıyor").await,
    };
    let Ok((send, mut recv)) = conn.open_bi().await else { return fail("Bu oda kapatıldı ya da şu an ulaşılamıyor").await };
    let tx = spawn_writer(send);
    let me = clean_name(&name);
    let _ = tx.send(json!({"t": "hello", "token": token, "name": me})).await;
    emit(&app, json!({"kind": "waiting"}));
    let answer = tokio::select! {
        a = tokio::time::timeout(Duration::from_secs(130), read_frame(&mut recv)) => a.ok().and_then(|r| r.ok()),
        _ = conn.closed() => None,
    };
    let Some(answer) = answer else { return fail("Oda sahibi cevap vermedi").await };
    if answer["t"] != "welcome" {
        let why = match answer["reason"].as_str() {
            Some("rejected") => "Oda sahibi katılma isteğini kabul etmedi",
            Some("full") => "Oda dolu",
            _ => "Bu oda kapatıldı",
        };
        return fail(why).await;
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let host_name = clean_name(answer["host"].as_str().unwrap_or(""));
    let taken = {
        let mut g = lock();
        let taken = g.is_some();
        if !taken {
            let mut peers = HashMap::new();
            peers.insert("host".to_string(), Peer { name: host_name.clone(), tx, conn: conn.clone() });
            *g = Some(Room { generation, endpoint: endpoint.clone(), name: me, role: Role::Guest, peers });
        }
        taken
    };
    if taken { return fail("Zaten bir odadasın").await; }
    let reader_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut reason = "lost";
        loop {
            let msg = tokio::select! {
                m = read_frame(&mut recv) => m,
                _ = conn.closed() => Err("closed".into()),
            };
            let Ok(msg) = msg else { break };
            match msg["t"].as_str() {
                Some("closed") => { reason = "closed"; break; }
                Some("kicked") => { reason = "kicked"; break; }
                Some("members") => emit(&reader_app, json!({"kind": "members", "list": msg["list"]})),
                Some("mode") => emit(&reader_app, json!({"kind": "mode", "everyone": msg["everyone"]})),
                Some(k) if GUEST_KINDS.contains(&k) => emit(&reader_app, json!({"kind": "msg", "data": msg})),
                _ => {}
            }
        }
        let room = { let mut g = lock(); if g.as_ref().is_some_and(|r| r.generation == generation) { g.take() } else { None } };
        if let Some(room) = room {
            let _ = tokio::time::timeout(Duration::from_secs(3), room.endpoint.close()).await;
            emit(&reader_app, json!({"kind": "ended", "reason": reason}));
        }
    });
    emit(&app, json!({"kind": "welcome", "host": host_name, "everyone": answer["everyone"]}));
    Ok(json!({"open": true, "host": false, "hostName": host_name, "everyone": answer["everyone"]}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn link_needs_key_and_token() {
        let id = SecretKey::generate().public();
        let good = format!("luna://izle/{id}?k={}", "a1".repeat(16));
        assert!(parse_link(&good).is_some());
        assert_eq!(from_args(["--minimized".into(), good.clone()]), Some(good));
        for bad in [
            format!("luna://izle/{id}"),
            format!("luna://izle/{id}?k=short"),
            format!("luna://play/{id}?k={}", "a1".repeat(16)),
            format!("https://izle/{id}?k={}", "a1".repeat(16)),
            format!("luna://izle/notakey?k={}", "a1".repeat(16)),
        ] {
            assert!(parse_link(&bad).is_none(), "{bad}");
        }
    }
    #[test]
    fn rate_limit_drops_floods() {
        let mut b = Bucket::new();
        let allowed = (0..100).filter(|_| b.allow()).count();
        assert_eq!(allowed, RATE as usize);
    }

    /// Two real endpoints on this machine: host opens, guest asks, host approves, a chat arrives, host closes,
    /// and the same link can't be joined again.
    #[test]
    #[ignore = "uses the network (n0 relay / DNS)"]
    fn host_guest_roundtrip() {
        let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let host = bind(Some(SecretKey::generate()), true).await.unwrap();
            tokio::time::timeout(Duration::from_secs(15), host.online()).await.unwrap();
            let addr = host.addr();
            let h2 = host.clone();
            let server = tokio::spawn(async move {
                let conn = h2.accept().await.unwrap().await.unwrap();
                let (send, mut recv) = conn.accept_bi().await.unwrap();
                let hello = read_frame(&mut recv).await.unwrap();
                let tx = spawn_writer(send);
                tx.send(json!({"t": "welcome", "host": "H"})).await.unwrap();
                let chat = read_frame(&mut recv).await.unwrap();
                (hello, chat)
            });
            let guest = bind(None, false).await.unwrap();
            let conn = guest.connect(addr, ALPN).await.unwrap();
            let (send, mut recv) = conn.open_bi().await.unwrap();
            let tx = spawn_writer(send);
            tx.send(json!({"t": "hello", "token": "x", "name": "G"})).await.unwrap();
            assert_eq!(read_frame(&mut recv).await.unwrap()["t"], "welcome");
            tx.send(json!({"t": "chat", "text": "selam"})).await.unwrap();
            let (hello, chat) = server.await.unwrap();
            assert_eq!((hello["name"].as_str(), chat["text"].as_str()), (Some("G"), Some("selam")));
            let id = host.id();
            host.close().await;
            // the closed room's key answers nothing any more
            let again = tokio::time::timeout(Duration::from_secs(8), guest.connect(id, ALPN)).await;
            assert!(!matches!(again, Ok(Ok(_))));
            guest.close().await;
        });
    }
}
