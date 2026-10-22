/* Pure model checks for the playback, sound, scrobble, podcast, RSVP, palette and user-command extras.
 * Each model file has no imports, so it is transpiled and loaded whole; no Windows UI automation. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const base = path.resolve(__dirname, '..');
function load(file) {
  const source = fs.readFileSync(path.join(base, 'src', file), 'utf8');
  assert.ok(!/^import\s/m.test(source), file + ' must stay import-free so it can be tested on its own');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports;
}
const read = (file) => fs.readFileSync(path.join(base, 'src', file), 'utf8');
const P = load('playbackExtrasModel.ts'), S = load('scrobbleModel.ts'), D = load('podcastExtrasModel.ts');
const R = load('rsvpModel.ts'), K = load('paletteModel.ts'), U = load('userCommandsModel.ts');
const tests = [], test = (name, run) => tests.push({ name, run });

test('YouTube ids come from every address form and nothing else', () => {
  assert.equal(P.youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43'), 'dQw4w9WgXcQ');
  assert.equal(P.youtubeId('https://youtu.be/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ');
  assert.equal(P.youtubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(P.youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(P.youtubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  for (const bad of ['https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'C:\\Films\\a.mkv', '', null, 'https://rr1---sn.googlevideo.com/videoplayback?id=1'])
    assert.equal(P.youtubeId(bad), null);
});
test('SponsorBlock: hash-prefix answers keep only this video, skip-type segments and chosen categories', () => {
  const url = P.sponsorUrl('ABCDEF', ['sponsor']);
  assert.ok(url.startsWith('https://sponsor.ajay.app/api/skipSegments/abcd?categories='));
  assert.ok(decodeURIComponent(url).includes('["skip"]'));
  const json = [
    { videoID: 'other000000', segments: [{ segment: [1, 20], category: 'sponsor', UUID: 'x' }] },
    { videoID: 'dQw4w9WgXcQ', segments: [
      { segment: [60, 90], category: 'sponsor', UUID: 'b', actionType: 'skip' },
      { segment: [10, 30], category: 'intro', UUID: 'a', actionType: 'skip' },
      { segment: [100, 100.5], category: 'sponsor', UUID: 'tiny' },
      { segment: [120, 140], category: 'sponsor', UUID: 'mute', actionType: 'mute' },
      { segment: [150, 170], category: 'selfpromo', UUID: 'notchosen' },
      { segment: ['x', 5], category: 'sponsor', UUID: 'bad' }] }];
  const segs = P.parseSponsorSegments(json, 'dQw4w9WgXcQ', ['sponsor', 'intro']);
  assert.deepEqual(segs.map((s) => s.uuid), ['a', 'b']);
  assert.deepEqual(P.parseSponsorSegments({ message: 'Not Found' }, 'x', ['sponsor']), []);
  const plain = P.parseSponsorSegments([{ segment: [5, 15], category: 'sponsor', UUID: 'p' }], 'whatever', ['sponsor']);
  assert.equal(plain.length, 1);
});
test('SponsorBlock: a segment is skipped once, not in its last half second, and an undone one stays', () => {
  const segs = [{ start: 10, end: 30, category: 'intro', uuid: 'a' }, { start: 60, end: 90, category: 'sponsor', uuid: 'b' }];
  assert.equal(P.segmentToSkip(segs, 9, []), null);
  assert.equal(P.segmentToSkip(segs, 10.2, []).uuid, 'a');
  assert.equal(P.segmentToSkip(segs, 29.7, []), null);
  assert.equal(P.segmentToSkip(segs, 15, ['a']), null);
  assert.equal(P.segmentToSkip(segs, 61, ['a']).uuid, 'b');
  assert.equal(P.segmentToSkip(segs, NaN, []), null);
});
test('Sound filters: only Luna-labelled filters, EQ skips flat bands and clamps gains', () => {
  assert.deepEqual(P.soundFilters(P.SOUND_DEFAULTS), []);
  const f = P.soundFilters({ normalize: true, night: true, voice: true, bands: [20, 0, 0, 0, 0, 0, 0, 0, 0, -3] });
  assert.deepEqual(f.map((x) => x.label), ['@luna_voice', '@luna_eq', '@luna_night', '@luna_norm']);
  assert.ok(f.every((x) => P.SOUND_LABELS.includes(x.label) && /^lavfi=\[.+\]$/.test(x.value)));
  const eq = f.find((x) => x.label === '@luna_eq').value;
  assert.ok(eq.includes('equalizer=f=31:t=o:w=1:g=12') && eq.includes('equalizer=f=16000:t=o:w=1:g=-3'));
  assert.ok(!eq.includes('f=62:'));
  assert.equal(P.presetOf(P.EQ_PRESETS.rock), 'rock');
  assert.equal(P.presetOf([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'custom');
  for (const [name, bands] of Object.entries(P.EQ_PRESETS)) assert.equal(P.presetOf(bands), name, 'preset table and presetOf agree: ' + name);
});
test('Sound settings from storage are cleaned (bad bands, wrong types)', () => {
  assert.deepEqual(P.cleanSoundFx(null), P.SOUND_DEFAULTS);
  const c = P.cleanSoundFx({ normalize: 'yes', night: true, bands: [99, -99, 'x', 1.6, 0, 0, 0, 0, 0, 0] });
  assert.equal(c.normalize, false); assert.equal(c.night, true);
  assert.deepEqual(c.bands.slice(0, 4), [12, -12, 0, 2]);
  assert.deepEqual(P.cleanSoundFx({ bands: [1, 2] }).bands, P.SOUND_DEFAULTS.bands);
});
test('A-B loop: A, then B, then clear; B at or before A restarts A', () => {
  let s = P.abNext(null, null, 10); assert.deepEqual(s, { a: 10, b: null });
  assert.deepEqual(P.abNext(s.a, s.b, 10.2), { a: 10.2, b: null });
  s = P.abNext(s.a, s.b, 20); assert.deepEqual(s, { a: 10, b: 20 });
  assert.deepEqual(P.abNext(s.a, s.b, 25), { a: null, b: null });
});
test('Music sleep timer: deadline and a gentle fade in the last seconds', () => {
  assert.equal(P.sleepDeadline('off', 1000), null);
  assert.equal(P.sleepDeadline('song', 1000), null);
  assert.equal(P.sleepDeadline(15, 1000), 1000 + 15 * 60000);
  assert.equal(P.sleepFadeVolume(80, 100), 80);
  assert.equal(P.sleepFadeVolume(80, 10), 40);
  assert.equal(P.sleepFadeVolume(80, -3), 0);
});
test('Scrobble rule: half the song or 4 minutes; never under 30 s', () => {
  assert.equal(S.scrobbleDue(100, 200), true); assert.equal(S.scrobbleDue(99, 200), false);
  assert.equal(S.scrobbleDue(240, 1200), true); assert.equal(S.scrobbleDue(239, 1200), false);
  assert.equal(S.scrobbleDue(29, 29), false); assert.equal(S.scrobbleDue(0, 0), false);
});
test('Scrobble track: radio, podcasts and audiobooks are left out; YouTube titles are split', () => {
  assert.equal(S.scrobbleTrack({ title: 'x', artist: 'y', radio: true }), null);
  assert.equal(S.scrobbleTrack({ title: 'x', artist: 'y', podcast: 'feed' }), null);
  assert.deepEqual(S.scrobbleTrack({ title: 'Barış Manço - Gülpembe (Official Video)', artist: 'Barış Manço - Topic', duration: 300.4 }),
    { artist: 'Barış Manço', title: 'Gülpembe', album: undefined, duration: 300 });
  assert.deepEqual(S.scrobbleTrack({ title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue' }), { artist: 'Miles Davis', title: 'So What', album: 'Kind of Blue', duration: undefined });
  assert.equal(S.scrobbleTrack({ title: 'No artist' }), null);
});
test('ListenBrainz bodies: playing_now has no timestamp, a listen has seconds', () => {
  const t = { artist: 'A', title: 'B', album: 'C', duration: 200 };
  const now = S.listenBrainzBody('playing_now', t, 1700000000999);
  assert.equal(now.listen_type, 'playing_now'); assert.equal(now.payload[0].listened_at, undefined);
  const one = S.listenBrainzBody('single', t, 1700000000999);
  assert.equal(one.payload[0].listened_at, 1700000000);
  assert.equal(one.payload[0].track_metadata.release_name, 'C');
  assert.equal(one.payload[0].track_metadata.additional_info.duration_ms, 200000);
});
test('MD5 matches known vectors (Last.fm signatures depend on it), UTF-8 included', () => {
  const crypto = require('node:crypto');
  assert.equal(S.md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(S.md5('The quick brown fox jumps over the lazy dog'), '9e107d9d372bb6826bd81d3542a419d6');
  for (const s of ['Barış Manço', 'ğüşıöç İ', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'é'.repeat(300)])
    assert.equal(S.md5(s), crypto.createHash('md5').update(s, 'utf8').digest('hex'));
  const sig = S.lastfmSignature({ method: 'track.scrobble', artist: 'A', format: 'json', api_key: 'k' }, 'secret');
  assert.equal(sig, crypto.createHash('md5').update('api_keykartistAmethodtrack.scrobblesecret').digest('hex'));
});
test('Podcast chapters: JSON chapters in order, hidden and untitled ones out, links only http(s)', () => {
  const c = D.parseChaptersJson({ version: '1.2.0', chapters: [
    { startTime: 120, title: 'Two', url: 'javascript:alert(1)' }, { startTime: 0, title: 'One', img: 'https://x/i.jpg' },
    { startTime: 50, title: 'Hidden', toc: false }, { startTime: 70, title: '' }, { startTime: 'x', title: 'Bad' }] });
  assert.deepEqual(c.map((x) => x.title), ['One', 'Two']);
  assert.equal(c[0].img, 'https://x/i.jpg'); assert.equal(c[1].url, undefined);
  assert.deepEqual(D.parseChaptersJson(null), []);
});
test('Podcast transcripts: VTT with voices, SRT with commas, JSON segments, timestamps', () => {
  assert.equal(D.parseTimestamp('01:02:03.5'), 3723.5); assert.equal(D.parseTimestamp('02:03,250'), 123.25);
  assert.ok(Number.isNaN(D.parseTimestamp('ab:cd')));
  const vtt = 'WEBVTT\n\nNOTE x\n\n1\n00:00:01.000 --> 00:00:04.000 align:start\n<v Ayşe>Merhaba <i>dünya</i></v>\n\n00:00:05.000 --> 00:00:06.000\nİkinci &amp; son';
  const cues = D.parseCues(vtt);
  assert.equal(cues.length, 2); assert.equal(cues[0].speaker, 'Ayşe'); assert.equal(cues[0].text, 'Merhaba dünya'); assert.equal(cues[1].text, 'İkinci & son');
  const srt = '1\r\n00:00:02,500 --> 00:00:03,000\r\nBir\r\n\r\n2\r\n00:00:01,000 --> 00:00:02,000\r\nSıfır';
  assert.deepEqual(D.parseCues(srt).map((c) => c.text), ['Sıfır', 'Bir']);
  const js = D.parseTranscriptJson({ segments: [{ speaker: 'A', startTime: 3, endTime: 4, body: 'b' }, { startTime: 1, endTime: 2, body: 'a' }, { startTime: 5, body: ' ' }] });
  assert.deepEqual(js.map((c) => c.text), ['a', 'b']);
});
test('Podcast transcripts: merging, position lookup and format choice', () => {
  const m = D.mergeCues([{ start: 0, end: 1, text: 'a', speaker: 'X' }, { start: 1.5, end: 2, text: 'b', speaker: 'X' }, { start: 2.1, end: 3, text: 'c', speaker: 'Y' }, { start: 9, end: 10, text: 'd', speaker: 'Y' }]);
  assert.deepEqual(m.map((c) => c.text), ['a b', 'c', 'd']);
  const list = [{ start: 0 }, { start: 10 }, { start: 20 }];
  assert.equal(D.indexAt(list, -1), -1); assert.equal(D.indexAt(list, 0), 0); assert.equal(D.indexAt(list, 15), 1); assert.equal(D.indexAt(list, 99), 2);
  const pick = D.pickTranscript([{ url: 'https://x/t.html', type: 'text/html' }, { url: 'https://x/t.srt', type: 'application/x-subrip', lang: 'en' },
    { url: 'https://x/tr.vtt', type: 'text/vtt', lang: 'tr' }, { url: 'ftp://x/t.vtt', type: 'text/vtt' }], 'tr');
  assert.equal(pick.url, 'https://x/tr.vtt');
  assert.equal(D.pickTranscript([], 'tr'), null);
  assert.deepEqual(D.textParagraphs('<p>Bir</p><p>İki&nbsp;üç</p>', true), ['Bir', 'İki üç']);
});
test('RSVP: words, recognition letter and pauses', () => {
  assert.deepEqual(R.rsvpWords('  Bir  iki\nüç\u00ad. '), ['Bir', 'iki', 'üç.']);
  assert.equal(R.orpIndex('a'), 0); assert.equal(R.orpIndex('kitap'), 1); assert.equal(R.orpIndex('“Merhaba,'), 3);
  assert.deepEqual(R.splitAtOrp('okuyucu'), ['ok', 'u', 'yucu']);
  assert.equal(R.wordDelay('kedi', 300), 200);
  assert.ok(R.wordDelay('bitti.', 300) > R.wordDelay('ama,', 300) && R.wordDelay('ama,', 300) > R.wordDelay('ama', 300));
  assert.equal(R.wordDelay('x', 0), 200); assert.equal(R.minutesLeft(601, 300), 3);
});
test('Command palette: Turkish folding and ranking', () => {
  assert.equal(K.fold('İSTANBUL Işık Çağ'), 'istanbul isik cag');
  assert.ok(K.fuzzyScore('gec', 'Geçmiş') > 0);
  assert.ok(K.fuzzyScore('ayar', 'Ayarlar') > K.fuzzyScore('ayar', 'Film ayarları'));
  assert.equal(K.fuzzyScore('xyz', 'Ayarlar'), 0);
  const rows = [{ id: '1', label: 'Müzik: Radyo', group: 'g' }, { id: '2', label: 'Radyo', group: 'g' }, { id: '3', label: 'Kitaplar', keywords: 'books', group: 'g' }];
  assert.deepEqual(K.rankRows(rows, 'radyo').map((r) => r.id), ['2', '1']);
  assert.deepEqual(K.rankRows(rows, 'books').map((r) => r.id), ['3']);
  assert.equal(K.rankRows(rows, '', 2).length, 2);
});
test('User commands: definition, reserved names, expansion and cleaning', () => {
  const reserved = ['/help', '/çevir', 'yeni'];
  assert.deepEqual(U.parseCommandDef('Özet3 = Şunu üç maddede özetle: {metin}', reserved), { name: 'özet3', prompt: 'Şunu üç maddede özetle: {metin}' });
  assert.equal(U.parseCommandDef('özet', reserved), 'format');
  assert.equal(U.parseCommandDef('çevir = x', reserved), 'reserved');
  assert.equal(U.parseCommandDef('a b = x', reserved), 'name');
  assert.equal(U.parseCommandDef('ok = ', reserved), 'prompt');
  const cmds = [{ name: 'özet3', prompt: 'Üç madde: {metin}' }, { name: 'sade', prompt: 'Sadeleştir' }, { name: 'sec', prompt: 'Açıkla: {seçim}' }];
  assert.equal(U.expandCommand('/Özet3 uzun yazı', cmds), 'Üç madde: uzun yazı');
  assert.equal(U.expandCommand('/sade bu metin', cmds), 'Sadeleştir\n\nbu metin');
  assert.equal(U.expandCommand('/sec', cmds, ' seçili '), 'Açıkla: seçili');
  assert.equal(U.expandCommand('/yok x', cmds), null); assert.equal(U.expandCommand('merhaba', cmds), null);
  const clean = U.cleanCommands([{ name: '/A', prompt: '1' }, { name: 'a', prompt: '2' }, { name: 'b c', prompt: 'x' }, null, { name: 'z', prompt: '' }]);
  assert.deepEqual(clean, [{ name: 'a', prompt: '2' }]);
  const md = U.compareMarkdown('Soru?', [{ label: 'Gemini', model: 'g', text: 'Cevap', ms: 1200 }, { label: 'Yerel', model: 'l', error: 'kapalı', ms: 50 }], { took: '{0} sn', failed: 'Hata' });
  assert.ok(md.startsWith('> Soru?') && md.includes('**Gemini** · g · 1.2 sn') && md.includes('_Hata: kapalı_'));
});
test('Trakt: films by TMDB id, episodes by show id + season/number, nothing without an id', () => {
  assert.deepEqual(S.traktTarget({ meta: { id: 27205, kind: 'movie' }, files: [{ path: 'a.mkv' }] }, 'a.mkv'), { kind: 'movie', tmdb: 27205 });
  const show = { meta: { id: 95396, kind: 'tv' }, parsed: { kind: 'tv' }, files: [{ path: 's1e1.mkv', season: 1, episode: 1 }, { path: 's1e2.mkv', season: 1, episode: 2 }] };
  assert.deepEqual(S.traktTarget(show, 's1e2.mkv'), { kind: 'episode', tmdb: 95396, season: 1, episode: 2 });
  assert.equal(S.traktTarget({ meta: null, parsed: { kind: 'movie' } }, 'x'), null);
  assert.equal(S.traktTarget({ meta: { id: 1, kind: 'tv' }, files: [{ path: 'x' }] }, 'x'), null);
  assert.deepEqual(S.traktBody({ kind: 'movie', tmdb: 1 }, 123.456), { movie: { ids: { tmdb: 1 } }, progress: 100 });
  assert.deepEqual(S.traktBody({ kind: 'episode', tmdb: 2, season: 3, episode: 4 }, 41.237), { show: { ids: { tmdb: 2 } }, episode: { season: 3, number: 4 }, progress: 41.24 });
  assert.equal(S.traktBody({ kind: 'movie', tmdb: 1 }, NaN).progress, 0);
});
test('Discord presence: listening/watching, time left only while playing, long titles cut', () => {
  const labels = { film: 'Film', music: 'Music', paused: 'Paused' };
  const a = S.presenceActivity({ mode: 'music', title: 'Gülpembe', artist: 'Barış Manço', paused: false, time: 30, duration: 200, now: 1000000, labels });
  assert.equal(a.type, 2); assert.equal(a.state, 'Barış Manço'); assert.deepEqual(a.timestamps, { start: 970000, end: 1170000 });
  const b = S.presenceActivity({ mode: 'film', title: 'x'.repeat(300), paused: true, time: 30, duration: 200, now: 0, labels });
  assert.equal(b.type, 3); assert.equal(b.state, 'Paused'); assert.equal(b.timestamps, undefined); assert.ok(b.details.length <= 120);
});
test('Source guard: wiring stays in place (runtime, palette, panels, settings, assistant)', () => {
  const app = read('App.tsx'), music = read('Music.tsx'), books = read('Books.tsx'), taste = read('Taste.tsx'), slash = read('Slash.ts'), screens = read('Screens.tsx');
  assert.ok(app.includes('<PlaybackRuntime') && app.includes('<CommandPalette') && app.includes('<SoundPanel'), 'App mounts runtime, palette and sound panel');
  assert.ok(music.includes('<PodcastExtras') && music.includes('<MusicSoundButton'), 'Now playing shows podcast extras and the sound button');
  assert.ok(books.includes('<RsvpReader'), 'the reader offers fast reading');
  assert.ok(taste.includes('expandUserCommand(') && taste.includes('compareModels('), 'assistant expands user commands and compares models');
  assert.ok(slash.includes('"compare"') && slash.includes('"commands"'), 'slash list has /karşılaştır and /komut');
  assert.ok(screens.includes('<ExtrasSettings'), 'settings open the extras settings');
  assert.ok(app.includes('<BarMarks') && music.includes('<BarMarks'), 'SponsorBlock and A-B marks on both seek bars');
  const runtime = read('PlaybackRuntime.tsx');
  assert.ok(runtime.includes('traktScrobble(') && runtime.includes('"discord_presence"'), 'runtime sends Trakt and Discord updates');
  const lib = fs.readFileSync(path.join(base, 'src-tauri/src/lib.rs'), 'utf8');
  assert.ok(/http_send,\s*\n\s*discord_presence,/.test(lib) && lib.includes('SEND_EXTRA_HEADERS'), 'native commands registered, extra headers limited');
  const rt = read('PlaybackExtras.tsx');
  assert.ok(rt.includes('"af", "remove"') && !/set_property",\s*"af"/.test(rt), 'sound filters are added and removed by label, never by replacing the whole chain');
});

let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS', t.name); } catch (e) { failed++; console.log('FAIL', t.name, '\n   ', e && e.message); } }
console.log(JSON.stringify({ total: tests.length, passed: tests.length - failed, failed }));
process.exitCode = failed ? 1 : 0;
