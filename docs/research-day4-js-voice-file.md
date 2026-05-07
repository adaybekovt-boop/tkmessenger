# Day 4 — JS voice + file reference

Paths are absolute, from the JS peer at `C:\Users\windo\Desktop\cursor-antigravity\git_push\`.
Line numbers from the current working tree. Both voice and file payloads
travel inside `sendEncrypted(peerId, {type:'msg', ..., voice, attachment})`
on the ratchet-encrypted reliable channel (`useMessaging.js:376-387`). From
the app's point of view, the inner JSON object below is plaintext.

---

## Voice send path

- Recorder UI:    `src/components/VoiceRecorder.jsx:15-131`
- Recorder core:  `src/core/audioRecorder.js:86-196` (`createVoiceRecorder`)
- Send handler:   `src/pages/Chats.jsx:794-802` (`handleVoiceSend`)
- Envelope build: `src/hooks/useMessaging.js:291-330, 376-387` (`sendMessage`)
- IDB persist:    `src/core/db.js:203-213` (`saveVoiceBlob`, store `voice_blobs`)

### MediaRecorder config — `audioRecorder.js:6-21, 94-99`

```js
const candidates = ['audio/webm;codecs=opus', 'audio/webm',
                    'audio/ogg;codecs=opus', 'audio/mp4']; // first supported wins
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
});
const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
recorder.start(100); // 100ms timeslice
```

Chromium → `audio/webm;codecs=opus`. Safari/iOS → `audio/mp4`. Chosen
mime stamps onto `Blob.type` and surfaces as `voice.mime` on the wire.

### Duration cap

- **No hard upper bound on duration.** Recording runs until the user taps
  send/cancel. Effective cap is the 8 MB base64 payload ceiling — roughly
  3–5 minutes at WebM/Opus.
- **Minimum 0.2 s** — below that `handleSend` silently cancels
  (`VoiceRecorder.jsx:66-69`).

### Waveform capture — `audioRecorder.js:110-134, 198-213`

```js
analyser = ctx.createAnalyser();
analyser.fftSize = 512;
// each rAF tick:
analyser.getByteTimeDomainData(data);
let sum = 0;
for (let i = 0; i < data.length; i++) {
  const v = (data[i] - 128) / 128;
  sum += v * v;
}
samples.push(Math.min(1, Math.sqrt(sum / data.length) * 2.2));
if (samples.length > 120) samples.shift();
```

On stop, `compressSamples(samples, 48)` produces a fixed-length array of
**up to 48 normalized amplitudes `0.0..1.0` (Number)**. May be shorter for
very brief recordings.

### Wire envelope — voice

`useMessaging.js:293-330, 376-387`. After `blobToBase64`:

```json
{
  "type": "msg",
  "id": "<peerId>:<ts>:<uuid>",
  "text": "",
  "ts": 1735000000000,
  "from": "<localPeerId>",
  "msgType": "voice",
  "sticker": null,
  "replyTo": null,
  "voice": {
    "duration": 3.7,
    "mime": "audio/webm",
    "waveform": [0.11, 0.42, 0.88, "..."],
    "transcript": "",
    "b64": "GkXfo59ChoEBQveBAU..."
  },
  "attachment": null
}
```

Field notes:
- `voice.duration` — **SECONDS, Number, 1-decimal precision** (not ms).
  From `Math.round((Date.now()-startedAt)/100)/10` (`audioRecorder.js:172`).
- `voice.mime` — `Blob.type` verbatim (`"audio/webm"` / `"audio/mp4"`).
- `voice.waveform` — `number[]`, ≤48 entries, each `0..1`.
- `voice.transcript` — Web Speech API output, **string, ≤2000 chars**
  (`audioRecorder.js:78`, `messageProtocol.js:311`). Empty on non-Chromium.
- `voice.b64` — **raw base64, no `data:` prefix.** `blobToBase64` strips
  the header (`audioRecorder.js:215-227`).

### Size caps — `useMessaging.js:53-58`

```js
const MAX_VOICE_B64_LEN = 8 * 1024 * 1024; // 8 MB base64 (~6 MB raw)
```

Oversize → `voice.b64` dropped (`wireVoice` stays `null`). Receiver's
`clampChatMessage` also nukes `voice` for oversize b64
(`useMessaging.js:75-78`). Raw Blob still stored in IDB under
`voice_blobs/<msgId>` with `{blob, mime, duration, waveform, createdAt}`.

---

## Voice inbound / render

- Decoder:  `src/messaging/messageProtocol.js:311-335`
- Player:   `src/components/VoicePlayer.jsx:10-158`
- UI mount: `src/pages/Chats.jsx:347-348`

### Decode — `messageProtocol.js:311-335`

```js
if (voiceMeta && typeof voiceMeta.b64 === 'string') {
  const blob = base64ToBlob(voiceMeta.b64, voiceMeta.mime || 'audio/webm');
  await ctx.saveVoiceBlob(msgId, blob, {
    mime: voiceMeta.mime,
    duration: Number(voiceMeta.duration) || 0,
    waveform: Array.isArray(voiceMeta.waveform) ? voiceMeta.waveform : []
  });
  voiceRef = { duration, mime, waveform, transcript }; // b64 stripped
}
```

`b64` is stripped before attaching to `msg.voice` — the UI message carries
only `{duration, mime, waveform, transcript}`. Blob lazy-loaded on play.

### Player UI — `VoicePlayer.jsx:106-157`

- Round 40×40 play/pause button (accent-tinted when `mine`).
- 40-bar `ProgressWaveform` (`:160-180`) — heights from resampled
  `voice.waveform`; bars left of progress cursor accent-coloured, right
  muted.
- Duration counter in `MM:SS`, **counts DOWN** from total
  (`shownSeconds = duration - duration*progress`, `:101-103`).
- Transcript toggle (only shown when non-empty) collapses/expands a
  secondary bubble underneath (`:130-155`).

### Fields read

```js
Number(voice?.duration || 0)                    // seconds
Array.isArray(voice?.waveform) ? voice.waveform : []
typeof voice?.transcript === 'string' ? voice.transcript.trim() : ''
// mime is implicit in the persisted Blob; not read directly from voice here
```

Blob loaded on first play via `getVoiceBlob(msgId)` → `URL.createObjectURL` →
`new Audio().src` (`VoicePlayer.jsx:43-79`).

### Edge cases

- `voice = null` — renders as text bubble (`Chats.jsx:347`, `isVoice` false).
- `waveform = []` — 40 bars at min 14% height, progress still animates.
- `duration = 0` — counter shows `00:00` initially; actual Audio element
  `a.duration` takes over on play (`VoicePlayer.jsx:69`).
- IDB blob missing (fresh reload + race) — play is silent no-op, no
  error UI.
- Unmount race guarded: object URL creation aborts if component unmounted
  during async IDB read (`:51-57`).

---

## File send path

- Paperclip button: `src/pages/Chats.jsx:1334-1343`
- Hidden file input: `src/pages/Chats.jsx:1321-1327`
- Click handler:    `src/pages/Chats.jsx:806-814` (`handleAttachClick`)
- Pick handler:     `src/pages/Chats.jsx:816-848` (`handleFilePicked`)
- Public API:       `src/hooks/useMessaging.js:421-456` (`sendFile`)
- Envelope build:   `src/hooks/useMessaging.js:251-288, 376-387`
- Preview builder:  `src/core/attachmentPreview.js:58-171`
- IDB persist:      `src/core/db.js:228-243` (`saveFileBlob`, store `file_blobs`)

### Picker

Native `<input type="file">`, **single file** (no `multiple`):

```html
accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z,application/*"
```

`application/*` catches all binaries. UI resets `input.value = ''` before
each click so re-picking same file refires change (`:812, :819`).

### UI-level gate — `Chats.jsx:822-826`

```js
const MAX_BYTES = 12 * 1024 * 1024;
if (file.size > MAX_BYTES) {
  setAttachError(`Файл больше 12 МБ — отправка невозможна (${Math.ceil(file.size/1024/1024)} МБ).`);
  return;
}
```

### Kind + preview — `attachmentPreview.js:14-20, 58-171`

```js
classifyFile: image/* → 'image' | video/* → 'video' | audio/* → 'audio' | else 'file'
```

For `image` / `video`, `buildAttachmentPreview` generates a thumbnail:
- Image: `<img>` + `<canvas>`, `MAX_THUMB_SIDE=320 px`,
  `canvas.toDataURL('image/jpeg', 0.72)`, quality steps down to ≥0.35
  until data URL fits `~33.6 KB` (`MAX_THUMB_BYTES*1.4`).
- Video: `<video preload="metadata">` + seek to `min(0.1, duration)` +
  canvas `drawImage` first frame; also returns `duration` (seconds).
- Result: `thumb` is a **full `data:image/jpeg;base64,...` URL**.

### Wire envelope — file

`useMessaging.js:251-288, 376-387`:

```json
{
  "type": "msg",
  "id": "<peerId>:<ts>:<uuid>",
  "text": "",
  "ts": 1735000000000,
  "from": "<localPeerId>",
  "msgType": "file",
  "sticker": null,
  "replyTo": null,
  "voice": null,
  "attachment": {
    "name": "photo.jpg",
    "size": 184320,
    "mime": "image/jpeg",
    "kind": "image",
    "thumb": "data:image/jpeg;base64,/9j/4AAQSkZJR...",
    "width": 3024,
    "height": 4032,
    "duration": 0,
    "b64": "iVBORw0KGgoAAAA..."
  }
}
```

Field notes:
- `name` — UTF-8, truncated to **200 chars**.
- `size` — original raw-byte size.
- `mime` — fallback `application/octet-stream`.
- `kind` — `"image" | "video" | "audio" | "file"`.
- `thumb` — **full `data:...` URL** (not raw base64), ≤48 KB or gets
  nulled by `clampChatMessage`. May be `null`.
- `width`/`height` — px for image/video, else `0`.
- `duration` — seconds for video, else `0`.
- `b64` — **raw base64, no `data:` prefix** (same as voice).

### Size caps — `useMessaging.js:56-58`

```js
const MAX_FILE_B64_LEN   = 16 * 1024 * 1024; // 16 MB base64
const MAX_FILE_RAW       = 12 * 1024 * 1024; // 12 MB raw
const MAX_FILE_THUMB_LEN = 48 * 1024;        // 48 KB thumb data URL
```

Raw checked pre-encode (`:255-261`), b64 checked post-encode
(`:263-269`). Both caps fire `options.onError(new Error('file-too-large'))`
which the Russian error banner in `Chats.jsx:833-839` surfaces. **No
chunking** — single-shot envelope. (`src/drop/` contains a chunked
`sendFile`, but that's the Drop feature, unrelated to chat attachments.)

---

## File inbound / render

- Decoder:  `src/messaging/messageProtocol.js:341-363`
- Bubble:   `src/components/AttachmentBubble.jsx:19-263`
- UI mount: `src/pages/Chats.jsx:349-355`
- Icon map: `src/utils/fileIcon.jsx:16-84`

### Decode — `messageProtocol.js:341-363`

```js
if (typeof attachmentMeta.b64 === 'string') {
  const blob = base64ToBlob(attachmentMeta.b64, mime);
  await ctx.saveFileBlob(msgId, blob, { mime, name, size, kind, thumb, width, height, duration });
  attachmentRef = { name, size, mime, kind, thumb, width, height, duration };
} else {
  attachmentRef = { ...metadata, missing: true };
}
```

`b64` stripped before attaching to `msg.attachment`. Missing `b64` →
`missing: true` bubble: preview still shows (from `thumb`), download
disabled.

### Rendering

`AttachmentBubble.jsx`:

- **image**: 260 px bubble with JPEG thumb; click → `ensureBlob` →
  `window.open(objectUrl, '_blank')` (`:100`). Download button runs
  `<a download>` dance (`:69-78`).
- **video**: 260 px bubble, thumb + centered play overlay until first
  play; click play → `ensureBlob`, set `<video>.src`, `v.play()` (`:151-162`).
- **file**: 220–320 px horizontal pill with icon + truncated `name` +
  `size` + download chevron; whole pill is the download button (`:229-259`).

### Icon selection — `getFileIcon({mime, name})`

Extension match beats MIME. Ext buckets (see `fileIcon.jsx:16-41`):
image (png/jpg/gif/webp/svg/heic/bmp/tiff), video (mp4/mov/webm/mkv/avi/m4v),
audio (mp3/wav/ogg/flac/m4a/aac/opus), archive (zip/rar/7z/tar/gz/bz2/xz),
code (js/ts/jsx/tsx/py/rb/go/rs/java/c/cpp/h/hpp/cs/php/sh/html/css/json/xml/yaml/yml/toml),
spreadsheet (xls/xlsx/csv/ods), text (pdf/doc/docx/odt/rtf/txt/md).
MIME prefix fallback: `image/*`, `video/*`, `audio/*`, `text/*`,
`application/pdf` → text, archive mimes → archive, Excel/OOXML-sheet →
spreadsheet, `application/msword`/Word-OOXML → text, `application/json|xml`
→ code. Final fallback: generic `File`.

### Download — `AttachmentBubble.jsx:69-78`

```js
const url = await ensureBlob();   // IDB lookup → objectURL
const a = document.createElement('a');
a.href = url; a.download = attachment?.name || 'file';
document.body.appendChild(a); a.click(); document.body.removeChild(a);
```

No service worker, no streaming, no Save-As. Object URLs revoked in
unmount cleanup (`:28-37`). `<img src={fullUrl || thumb}>` swaps from
data-URL thumb to object URL once the full blob loads (`:107-112`).

---

## Wire-format gotchas for Flutter port

1. **`voice.duration` / `attachment.duration` are SECONDS (float), not
   milliseconds.** The recorder's `elapsed()` returns ms
   (`audioRecorder.js:149`) — don't confuse with the wire field.
2. **`voice.waveform` values are `0.0..1.0` doubles, up to 48 entries.**
   May be empty (legacy / no audio context). Always guard.
3. **`voice.b64` and `attachment.b64` are RAW base64 — NO `data:` prefix.**
   The decoder calls `base64ToBlob(b64, mime)` with mime passed separately.
   Flutter must mirror: do not prepend the `data:` header on outbound
   `b64`.
4. **`attachment.thumb`, however, IS a full `data:image/jpeg;base64,...`
   URL.** Same object, opposite encoding convention. This is the exact
   sticker `dataUrl`-vs-`url` trap from Day 3, repeating. Do not confuse.
5. **`attachment.kind` is trusted verbatim.** Receiver does not re-run
   `classifyFile` (`messageProtocol.js:345`). A peer sending
   `kind: 'image'` with `mime: 'application/pdf'` renders an image bubble
   with a broken `<img>`. Harmless but weird.
6. **No chunking, no resume for chat attachments.** One 16 MB-base64
   payload through the ratchet. `src/drop/` has chunked transfer, but
   that's the separate Drop feature.
7. **Missing `b64` is legal.** `{..., missing: true}` bubbles disable
   download, still show thumb. Flutter should match (e.g. outbound
   rehydration after reload synthesises `missing:true` for own messages
   whose IDB blob got purged).
8. **Outbox does NOT resend voice/file on reconnect.** `flushOutboxForPeer`
   only replays rows whose `payload.text` is a string
   (`useMessaging.js:187-201`). Voice/file that failed initial send are
   marked `queued` but never retransmitted. Flutter can match or improve.
9. **Asymmetric size enforcement:**
   - Sender: raw ≤ 12 MB AND b64 ≤ 16 MB (file); b64 ≤ 8 MB (voice).
   - Receiver `clampChatMessage` only rechecks voice b64 ≤ 8 MB and
     attachment thumb ≤ 48 KB — file b64 is already a Blob by then.
   Flutter should enforce the sender-side caps on encode.
10. **Transcript is best-effort Chromium-only.** Empty string normal.
    Cap 2000 chars on both send and receive.
11. **`voice.mime` varies per browser.** WebM/Opus on desktop Chromium;
    AAC/mp4 on Safari/iOS. Flutter playback must honour whatever
    `voice.mime` says — don't assume WebM.
12. **Top-level fields `replyTo | sticker | voice | attachment` are
    independent.** In practice only one of `voice` / `sticker` /
    `attachment` is non-null per message. Captions for files could ride
    in `text`, and `AttachmentBubble` already renders it
    (`Chats.jsx:351-354`) — but the current sender doesn't populate
    caption text.

---

## Open questions for Flutter team

- **File picker UX.** `<input accept="...">` is single-file permissive.
  On mobile: split camera/gallery/file sheet, or one `file_picker`
  list? `FileType.any` is the closest accept-list equivalent.
- **Voice recorder backend.** No `MediaRecorder` in Flutter. Use
  `flutter_sound` / `record`; AAC (m4a) on iOS, Opus/Ogg on Android.
  JS receiver accepts any `voice.mime` — just set it honestly.
- **Live transcript.** JS uses Web Speech API (Chromium-only). Ship
  `transcript: ""` for v1; revisit with `speech_to_text` later.
- **Waveform sampling.** JS samples at rAF (~60 Hz), compresses to 48 on
  stop. Flutter `record` exposes `onAmplitudeChanged` — match the
  48-bar shape so JS `ProgressWaveform` renders it unchanged.
- **Outbox retry policy.** Match JS (no retry for voice/file) vs retry
  from stored Blob. Re-encoding base64 from the Blob is cheap.
- **Video first-frame capture.** JS uses `<video>`+canvas seek. Flutter
  needs `video_thumbnail`. Reliable for mp4/mov; flaky for webm.
- **Thumbnail format.** JS writes JPEG data URLs ≤ 48 KB. Flutter can
  keep JPEG or switch to WebP — stay under 48 KB or receiver nukes it.
