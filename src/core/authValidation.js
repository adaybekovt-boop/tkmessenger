export function validateUsername(username) {
  const v = String(username || '').trim();
  if (!v) return { ok: false, code: 'required' };
  if (v.length < 3) return { ok: false, code: 'min_len' };
  if (v.length > 30) return { ok: false, code: 'max_len' };
  if (!/^[\p{L}\p{N}_]+$/u.test(v)) return { ok: false, code: 'pattern' };
  return { ok: true, value: v };
}

export function passwordStrength(password) {
  const p = String(password || '');
  let score = 0;
  if (p.length >= 8) score += 1;
  if (p.length >= 12) score += 1;
  if (/[a-z]/.test(p)) score += 1;
  if (/[A-Z]/.test(p)) score += 1;
  if (/[0-9]/.test(p)) score += 1;
  if (/[^a-zA-Z0-9]/.test(p)) score += 1;
  if (/(.)\1\1/.test(p)) score = Math.max(0, score - 1);
  return Math.min(5, score);
}

export function validatePassword(password) {
  const p = String(password || '');
  if (!p) return { ok: false, code: 'required' };
  if (p.length < 8) return { ok: false, code: 'min_len' };
  return { ok: true, value: p };
}

export function validatePasswordConfirm(password, confirm) {
  if (String(password || '') !== String(confirm || '')) return { ok: false, code: 'mismatch' };
  return { ok: true };
}

