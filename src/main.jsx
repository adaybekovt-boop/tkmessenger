import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.jsx';
import './styles/index.css';
import './styles/theme-skins.css';
import { AuthProvider } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ThemeProvider } from './themes/ThemeProvider.jsx';
import { installGlobalHandlers } from './core/errorReporter.js';

installGlobalHandlers();

// reducedMotion="user" — when the OS is in Low Power / battery saver mode,
// iOS and Android automatically flip `prefers-reduced-motion: reduce`.
// MotionConfig picks that up and drops every Framer Motion transition in
// the tree to 0ms. Animations still play normally in standard mode, but
// stop eating frame time when the OS is already throttling the browser.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  </React.StrictMode>
);
