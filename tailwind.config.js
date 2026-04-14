export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#05050A',
          surface: '#0B0B12',
          panel: '#111122',
          border: '#1F2233',
          text: '#E7E9FF',
          muted: '#A5A8C7',
          accent: '#3b82f6',
          danger: '#f43f5e',
          success: '#22c55e',
          warning: '#f59e0b'
        }
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace']
      },
      transitionDuration: {
        300: '300ms'
      },
      keyframes: {
        softPulse: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(0.98)' },
          '50%': { opacity: '1', transform: 'scale(1)' }
        },
        radarSweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        softPulse: 'softPulse 1.6s ease-in-out infinite',
        radarSweep: 'radarSweep 1.8s linear infinite'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(59,130,246,0.25), 0 0 28px rgba(59,130,246,0.18)'
      }
    }
  },
  plugins: []
};
