import { createContext, useMemo, useState } from 'react';

export const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [selectedPeerId, setSelectedPeerId] = useState('ORBIT-ALPHA');

  const value = useMemo(() => {
    return {
      selectedPeerId,
      setSelectedPeerId
    };
  }, [selectedPeerId]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

