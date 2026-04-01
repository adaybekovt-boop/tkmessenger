// client/src/context/ThemeContext.tsx

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export type ThemeType = 'sakura' | 'matrix' | 'cyberpunk' | 'aurora' | 'retro' | 'none';

interface Theme {
  id: ThemeType;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    accent: string;
  };
}

const themes: Record<ThemeType, Theme> = {
  sakura: {
    id: 'sakura',
    name: 'Sakura',
    colors: {
      primary: '#ff69b4',
      secondary: '#ffb6c1',
      background: '#fff0f5',
      text: '#4a2e2e',
      accent: '#ff99cc'
    }
  },
  matrix: {
    id: 'matrix',
    name: 'Matrix',
    colors: {
      primary: '#00ff00',
      secondary: '#33ff33',
      background: '#000000',
      text: '#00ff00',
      accent: '#66ff66'
    }
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    colors: {
      primary: '#ff00ff',
      secondary: '#00ffff',
      background: '#0a0a2a',
      text: '#ffffff',
      accent: '#ff00ff'
    }
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    colors: {
      primary: '#00ffaa',
      secondary: '#33ffcc',
      background: '#001133',
      text: '#ccffcc',
      accent: '#00ffaa'
    }
  },
  retro: {
    id: 'retro',
    name: 'Retro Terminal',
    colors: {
      primary: '#ffaa33',
      secondary: '#ffcc66',
      background: '#2a2a2a',
      text: '#ffaa33',
      accent: '#ffcc66'
    }
  },
  none: {
    id: 'none',
    name: 'Default',
    colors: {
      primary: '#2AABEE',
      secondary: '#2b5278',
      background: '#0f0f0f',
      text: '#ffffff',
      accent: '#2AABEE'
    }
  }
};

interface ThemeContextType {
  theme: ThemeType;
  currentTheme: Theme;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType>(() => {
    const saved = localStorage.getItem('theme') as ThemeType;
    return saved && themes[saved] ? saved : 'none';
  });
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const matrixDropsRef = useRef<number[]>([]);

  const currentTheme = themes[theme];

  // Stop current animation
  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, []);

  // Matrix animation
  const startMatrixAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const columns = Math.floor(canvas.width / 20);
      matrixDropsRef.current = new Array(columns).fill(1);
    };
    
    resize();
    window.addEventListener('resize', resize);
    
    const draw = () => {
      if (!canvas || !ctx) return;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0F0';
      ctx.font = '15px monospace';
      
      for (let i = 0; i < matrixDropsRef.current.length; i++) {
        const text = String.fromCharCode(33 + Math.random() * 94);
        ctx.fillText(text, i * 20, matrixDropsRef.current[i] * 20);
        
        if (matrixDropsRef.current[i] * 20 > canvas.height && Math.random() > 0.975) {
          matrixDropsRef.current[i] = 0;
        }
        matrixDropsRef.current[i]++;
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Sakura animation placeholder
  const startSakuraAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let petals: { x: number; y: number; speed: number; size: number }[] = [];
    
    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      petals = Array.from({ length: 50 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 1 + Math.random() * 3,
        size: 5 + Math.random() * 10
      }));
    };
    
    init();
    window.addEventListener('resize', init);
    
    const draw = () => {
      if (!canvas || !ctx) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      petals.forEach(petal => {
        ctx.beginPath();
        ctx.ellipse(petal.x, petal.y, petal.size / 2, petal.size, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 182, 193, 0.6)';
        ctx.fill();
        
        petal.y += petal.speed;
        if (petal.y > canvas.height) {
          petal.y = -20;
          petal.x = Math.random() * canvas.width;
        }
      });
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      window.removeEventListener('resize', init);
    };
  }, []);

  // Apply animation based on theme
  useEffect(() => {
    stopAnimation();
    
    let cleanup: (() => void) | undefined;
    
    switch (theme) {
      case 'matrix':
        cleanup = startMatrixAnimation();
        break;
      case 'sakura':
        cleanup = startSakuraAnimation();
        break;
      // Add other animations as needed
      default:
        break;
    }
    
    return () => {
      stopAnimation();
      if (cleanup) cleanup();
    };
  }, [theme, stopAnimation, startMatrixAnimation, startSakuraAnimation]);

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('theme', theme);
    
    // Apply CSS variables
    const root = document.documentElement;
    Object.entries(currentTheme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--theme-${key}`, value);
    });
  }, [theme, currentTheme]);

  const handleSetTheme = useCallback((newTheme: ThemeType) => {
    setTheme(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, currentTheme, setTheme: handleSetTheme }}>
      <canvas 
        ref={canvasRef} 
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ opacity: theme === 'none' ? 0 : 0.3 }}
      />
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};