export async function fileSha256Buffer(arrayBuffer) {
  const buf = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}