import { createContext, useContext } from 'react';
import { usePeer } from '../hooks/usePeer.js';
import { useAuth } from './AuthContext.jsx';
import { getOrCreateIdentity } from '../core/identity.js';

const PeerContext = createContext(null);

export function PeerProvider({ children }) {
  const auth = useAuth();
  const identity = getOrCreateIdentity();
  const value = usePeer({
    enabled: auth.authState === 'authed',
    desiredPeerId: identity.peerId,
    localProfile: auth.user
      ? {
          peerId: identity.peerId,
          nickname: auth.user.displayName,
          displayName: auth.user.displayName,
          bio: auth.user.bio,
          avatarDataUrl: auth.user.avatarDataUrl
        }
      : null
  });
  return <PeerContext.Provider value={value}>{children}</PeerContext.Provider>;
}

export function usePeerContext() {
  const value = useContext(PeerContext);
  if (!value) {
    throw new Error('PeerContext is missing');
  }
  return value;
}
