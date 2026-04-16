// Platform detection adapter.
//
// Provides runtime checks for Tauri, Capacitor, and plain Web.
// Every platform-specific call in the app must go through this
// module to prevent crashes like `window.__TAURI__ is not defined`.

const isTauri = () => typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined';
const isCapacitor = () => typeof window !== 'undefined' && typeof window.Capacitor !== 'undefined';

export const platform = {
  isTauri: isTauri(),
  isCapacitor: isCapacitor(),
  isWeb: !isTauri() && !isCapacitor(),
};

export { isTauri, isCapacitor };

export async function getIdentity() {
  if (platform.isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('get_identity');
  }
  const { loadIdentity } = await import('./idbStore.js');
  return loadIdentity();
}
