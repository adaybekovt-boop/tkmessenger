// Maps a file's MIME type or extension to a Lucide icon component. Used by
// Drop for file previews and by Chats for incoming attachments. Falls back to
// a generic `File` icon for anything we don't recognise.

import {
  File as FileIcon,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
} from 'lucide-react';

const EXT_MAP = {
  // images
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage,
  webp: FileImage, svg: FileImage, heic: FileImage, bmp: FileImage, tiff: FileImage,
  // video
  mp4: FileVideo, mov: FileVideo, webm: FileVideo, mkv: FileVideo,
  avi: FileVideo, m4v: FileVideo,
  // audio
  mp3: FileAudio, wav: FileAudio, ogg: FileAudio, flac: FileAudio,
  m4a: FileAudio, aac: FileAudio, opus: FileAudio,
  // archives
  zip: FileArchive, rar: FileArchive, '7z': FileArchive, tar: FileArchive,
  gz: FileArchive, bz2: FileArchive, xz: FileArchive,
  // code
  js: FileCode, ts: FileCode, jsx: FileCode, tsx: FileCode,
  py: FileCode, rb: FileCode, go: FileCode, rs: FileCode, java: FileCode,
  c: FileCode, cpp: FileCode, h: FileCode, hpp: FileCode,
  cs: FileCode, php: FileCode, sh: FileCode, html: FileCode, css: FileCode,
  json: FileCode, xml: FileCode, yaml: FileCode, yml: FileCode, toml: FileCode,
  // spreadsheets
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
  ods: FileSpreadsheet,
  // docs / text
  pdf: FileText, doc: FileText, docx: FileText, odt: FileText,
  rtf: FileText, txt: FileText, md: FileText,
};

const MIME_PREFIX_MAP = [
  ['image/', FileImage],
  ['video/', FileVideo],
  ['audio/', FileAudio],
  ['text/', FileText],
  ['application/pdf', FileText],
  ['application/zip', FileArchive],
  ['application/x-tar', FileArchive],
  ['application/x-rar', FileArchive],
  ['application/x-7z', FileArchive],
  ['application/gzip', FileArchive],
  ['application/vnd.ms-excel', FileSpreadsheet],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml', FileSpreadsheet],
  ['application/vnd.ms-word', FileText],
  ['application/msword', FileText],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml', FileText],
  ['application/json', FileCode],
  ['application/xml', FileCode],
];

/**
 * Pick a Lucide icon component for a file based on its MIME and/or filename.
 * Both args are optional — pass whichever you have. Returns the generic
 * `File` icon as a safe fallback.
 */
export function getFileIcon({ mime, name } = {}) {
  if (typeof name === 'string' && name) {
    const dot = name.lastIndexOf('.');
    if (dot > -1) {
      const ext = name.slice(dot + 1).toLowerCase();
      const match = EXT_MAP[ext];
      if (match) return match;
    }
  }
  if (typeof mime === 'string' && mime) {
    const lower = mime.toLowerCase();
    for (const [prefix, Icon] of MIME_PREFIX_MAP) {
      if (lower.startsWith(prefix)) return Icon;
    }
  }
  return FileIcon;
}
