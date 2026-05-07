# Day 4 — Flutter-side inventory

Scope: voice messages + file attachments, end-to-end. All paths absolute under
`C:\Users\windo\Desktop\cursor-antigravity\git_push_flutter\`.

## MessagingNotifier
File: `lib/state/messaging_notifier.dart`

- **sendVoice**: absent. Header comment at `:15-20` calls out "sticker / voice /
  file sends are out of scope for this slice. `sendText` is the 90% path".
- **sendFile**: absent. Same comment.
- **Size caps** (`:36-39`):
  - `_maxTextLen = 32 * 1024` (`:36`)
  - `_maxStickerLen = 512 * 1024` (`:37`)
  - `_maxVoiceB64Len = 8 * 1024 * 1024` (`:38`) — already present, used only in
    inbound `_clampChatMessage` (`:617-623`).
  - `_maxFileThumbLen = 48 * 1024` (`:39`) — file thumbnail cap, already used
    in `_clampChatMessage` (`:631-639`).
  - No `_maxFileLen` / `_maxFileNameLen` — need to add for outbound send-path
    validation.
- **`_sanitizeReplyTo`** (`:568-589`): YES, already whitelists
  `attachmentKind` (24 chars, `:584-585`) and `attachmentName` (120 chars,
  `:586-587`) alongside `stickerEmoji`. No code currently produces those
  fields — consumer-ready for Day 4 sends.
- **Flusher** `flushOutboxForPeer` (`:335-368`): text-only. Explicit filter at
  `:354-355` `if ((row['type'] ?? 'text') != 'text') continue;` with inline
  comment "Outbox currently only handles text. Voice/sticker/file will join
  when their senders land in this notifier." Sends plain `{type:'msg',...}`
  envelopes — no `msgType`, no sticker/voice/attachment fields.
- **sendSticker** exists (`:481-558`) as reference shape — wire envelope uses
  `msgType:'sticker'`, `text:''`, sticker blob under `payload.sticker`.
  Pending-flush path for stickers explicitly noted as unfinished at `:478-480`.

## Message protocol decoder
File: `lib/messaging/message_protocol.dart` (`dispatchReliablePlaintext`,
`:256-666`).

- **voice branch**: integrated into the unified `msg/text` handler at
  `:452-666`. `voiceMeta` extracted from `data['voice']` at `:472-474`; inline
  `b64` payloads decoded + persisted via `db.saveVoiceBlob` at `:520-535`;
  metadata-only rows handled at `:543-550`. Fields consumed: `b64`, `mime`
  (default `audio/webm`), `duration`, `waveform`, `transcript` (clipped
  2000 chars at `:517-519`). Result stored as `voiceRef` in `payload.voice`
  on the saved message (`:614` + `:633`).
- **file branch**: same handler, `attachmentMeta` extracted at `:475-477`;
  decode + persist via `db.saveFileBlob` at `:577-595`; metadata-only +
  `missing:true` fallback at `:599-601`. Fields consumed: `name` (clipped 200
  chars, `:555`), `mime` (default `application/octet-stream`), `kind`, `size`,
  `width`, `height`, `duration`, `thumb`, `b64`. Result stored as
  `attachmentRef` in `payload.attachment` (`:615` + `:634`).
- Notification preview helper `_previewFor` (`:699-718`) already covers
  `voice` (`🎤 Голосовое`) and `file` (`🖼 Фото` / `🎬 Видео` / `📎 <name>`).
- Gap: no outbound wire-envelope builder — `MessagingNotifier.sendSticker`
  shows the shape for stickers; voice/file sender must mirror it.

## DB schema
File: `lib/storage/tables.dart`.

`VoiceBlobsTable` (`:193-211`):
- `id` TEXT PK, `mime` TEXT (default `audio/webm`), `duration` INT,
  `createdAt` INT, `blob` BLOB (raw bytes), `data` BLOB (JSON metadata —
  holds `waveform`).

`FileBlobsTable` (`:214-241`):
- `id` TEXT PK, `mime` TEXT (default `application/octet-stream`),
  `name` TEXT, `kind` TEXT (default `file`), `size` INT, `width` INT,
  `height` INT, `duration` INT, `createdAt` INT, `blob` BLOB, `thumb` BLOB
  nullable, `data` BLOB (JSON spare).

`MessagesTable` (`:143-157`): no voice/file-specific columns. The media
metadata rides inside the JSON `data` blob via `payload.voice` /
`payload.attachment`. No schema change needed for Day 4.

DB API (`lib/storage/db.dart`):
- `saveVoiceBlob(id, bytes, mime, duration, waveform)` (`:185-209`)
- `getVoiceBlob(id)` (`:211-227`)
- `deleteVoiceBlob(id)` (`:229-234`)
- `saveFileBlob(id, bytes, mime, name, size, kind, thumb, width, height, duration)` (`:238-272`)
- `getFileBlob(id)` (`:274-294`)
- `deleteFileBlob(id)` (`:296-301`)

## MessageBubble UI
File: `lib/ui/chat/message_bubble.dart`.

- **voice branch**: absent. `build` (`:68-218`) branches only on
  `sticker != null` (`:103-150`) vs. text (`:154-217`). Voice payloads fall
  through to the text branch with `text == ''` → empty bubble showing only
  meta row. Header comment at `:4` labels it as Day 4.
- **file branch**: absent (same path). Attachment metadata in
  `payload.attachment` is never read by the bubble today.
- No `_VoicePlayer` / `_FileTile` widget yet — only `_StickerImage`
  (`:267-316`), `_ReplyQuote` (`:323-405`), `_MetaRow` (`:457-490`),
  `_DeliveryIcon` (`:492-514`).
- `_quotePreview` already renders the reply-preview strings for
  `voice` / `file` replies (`:436-444`) — consumes `attachmentKind` /
  `attachmentName` / `stickerEmoji` correctly.

## ChatComposer
File: `lib/ui/chat/chat_composer.dart`.

- **attach_file stub**: confirmed at `:193-198` — disabled `IconButton(
  icon: Icons.attach_file, color: scheme.onSurface.withValues(alpha: 0.4),
  tooltip: 'Файл (скоро)', onPressed: null)`. Greyed out, no handler. Header
  comment at `:5-7` explicitly calls out "Attachment (file/image) and voice
  entry points are still disabled stubs; they'll wire up on Day 4".
- **voice button**: ABSENT. No mic icon, no record button in the input row
  (`:188-264`). Only attach_file + sticker (`:199-208`) + TextField + send.
  The `ComposerActions` class (`:32-52`) has no `onRecordVoice` / `onPickFile`
  hook — those need to be added.

## pubspec.yaml
File: `pubspec.yaml`.

- **Audio**: none. No `flutter_sound`, `record`, `just_audio`, `audioplayers`.
- **File picker**: none. No `file_picker`, `image_picker`.
- **Mime**: none (no `mime` package). Manual MIME inference would be needed.
- **Path**: `path_provider: ^2.1.4` already present (`:32`). No bare `path`
  package — fine, `path_provider` is enough for tmp files.
- **Crypto + Drift etc.** already in place.

## Platform config
- **Android**: `android/` folder DOES NOT EXIST under `git_push_flutter/` —
  `flutter create .` has not been run yet for native targets. No
  `AndroidManifest.xml`, no `RECORD_AUDIO` declared.
- **iOS**: `ios/` folder DOES NOT EXIST. No `Info.plist`, no
  `NSMicrophoneUsageDescription`.
- Project root (`git_push_flutter/`) contains only `lib/`, `test/`,
  `pubspec.yaml`, `README.md`, `.gitignore`. Platform scaffolding is a
  prerequisite Day 4 item.

## Gaps — to add on Day 4
- **Platform scaffolding**: run `flutter create . --platforms=android,ios`
  (or equivalent) to materialize `android/` + `ios/`; then add
  `RECORD_AUDIO` to `AndroidManifest.xml` and `NSMicrophoneUsageDescription`
  (+ potentially `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`
  for file picker) to `Info.plist`.
- **pubspec deps**: add an audio recorder (`record` is leanest, or
  `flutter_sound`), an audio player (`just_audio` or `audioplayers`), and a
  file picker (`file_picker`; `image_picker` optional for camera roll).
  Consider `mime` for content-type inference.
- **Size caps**: add `_maxVoiceLen` (decoded-bytes variant of
  `_maxVoiceB64Len`), `_maxFileLen`, `_maxFileNameLen` to
  `messaging_notifier.dart`. Current 8 MiB b64 cap → ~6 MiB raw.
- **`MessagingNotifier.sendVoice(targetId, bytes, {mime, duration, waveform, replyTo})`**:
  mirror `sendSticker` shape — persist row with `type:'voice'`,
  `payload.voice = {duration, mime, waveform, transcript}`, write blob via
  `db.saveVoiceBlob`, ship envelope with `msgType:'voice'` + inline `b64`.
- **`MessagingNotifier.sendFile(targetId, bytes, {name, mime, kind, size, thumb, width, height, duration, replyTo})`**:
  same pattern, write blob via `db.saveFileBlob`, ship envelope with
  `msgType:'file'` + inline `b64` + metadata.
- **Flusher**: extend `flushOutboxForPeer` (`:335-368`) to rehydrate
  voice/sticker/file blobs from DB on retry. Currently the guard at `:354-355`
  silently skips them. Needs `getVoiceBlob` / `getFileBlob` lookups to rebuild
  the wire envelope.
- **`MessageBubble`**: add voice branch (player widget with play/pause +
  waveform + duration) and file branch (tile with icon/thumb + name + size
  + tap-to-open). Both should honour `replyTo` quote column.
- **`ChatComposer`**: wire `attach_file` button to a file picker; add a mic
  IconButton (toggleable — press-to-record or tap-to-toggle). Extend
  `ComposerActions` with `onPickAttachment` + `onRecordVoice` callbacks.
- **Voice player**: new widget (probably `lib/ui/chat/voice_player.dart`)
  reading bytes from `db.getVoiceBlob` and feeding them into the chosen
  audio player.
- **File tile**: new widget (probably `lib/ui/chat/file_tile.dart`) with
  thumbnail fallback + MIME-based icon selection.
- **Preview helper**: inbound notification preview (`_previewFor` in
  `message_protocol.dart:699-718`) is already ready; chat-list preview
  helper in `chat_list_provider` needs checking for parity (not in scope
  of this inventory).

## Already-done — to keep/extend
- `_sanitizeReplyTo` whitelist already covers `attachmentKind` +
  `attachmentName` (`messaging_notifier.dart:568-589`).
- Inbound clamp `_clampChatMessage` already enforces
  `_maxVoiceB64Len` + `_maxFileThumbLen` (`messaging_notifier.dart:612-641`).
- Inbound decoder for voice + file envelopes is complete
  (`message_protocol.dart:452-666`) — decodes `b64`, persists blob, stores
  `voiceRef` / `attachmentRef` in `payload.voice` / `payload.attachment`,
  surfaces notification preview. No changes needed.
- DB tables `voice_blobs` + `file_blobs` and their CRUD helpers already in
  production (`tables.dart:193-241`, `db.dart:183-301`).
- `_quotePreview` in `message_bubble.dart:428-455` already renders reply
  previews for voice + file — no change needed when voice/file bubbles land.
- Notification-preview helper `_previewFor` in `message_protocol.dart:699-718`
  returns the correct strings for voice + file today.
- `path_provider` dependency already present.
- `sendSticker` in `messaging_notifier.dart:481-558` is the best structural
  template — `sendVoice` and `sendFile` should mirror its wire-envelope +
  persist-first + bail-on-closed-channel pattern exactly.
