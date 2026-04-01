import React, { createContext, useContext, useState, useEffect } from 'react';

interface PowerSettings {
  isEnabled: boolean;
  mediaAutoLoad: boolean;
  imageQuality: 'low' | 'medium' | 'high';
  animationsEnabled: boolean;
  fpsLimit: number;
}

const BatterySaverContext = createContext<{
  settings: PowerSettings;
  setSettings: (settings: Partial<PowerSettings>) => void;
} | null>(null);

export const BatterySaverProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettingsState] = useState<PowerSettings>({
    isEnabled: false,
    mediaAutoLoad: true,
    imageQuality: 'high',
    animationsEnabled: true,
    fpsLimit: 60
  });

  const setSettings = (newSettings: Partial<PowerSettings>) => {
    setSettingsState(prev => ({ ...prev, ...newSettings }));
  };

  useEffect(() => {
    // Auto-detect battery status
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBattery = () => {
          if (battery.level < 0.2 && !battery.charging) {
            setSettings({ 
              isEnabled: true, 
              animationsEnabled: false, 
              fpsLimit: 30,
              imageQuality: 'low'
            });
          }
        };
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
        updateBattery();
      });
    }
  }, []);

  return (
    <BatterySaverContext.Provider value={{ settings, setSettings }}>
      <div className={settings.isEnabled ? 'low-power-mode' : ''}>
        {children}
      </div>
    </BatterySaverContext.Provider>
  );
};

export const useBatterySaver = () => {
  const context = useContext(BatterySaverContext);
  if (!context) throw new Error('useBatterySaver must be used within BatterySaverProvider');
  return context;
};
