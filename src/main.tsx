import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// HMR is disabled in AI Studio preview. Ignore benign WebSocket connection rejections.
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason &&
    (event.reason.message?.includes('WebSocket') ||
      String(event.reason).includes('WebSocket') ||
      String(event.reason).includes('closed without opened'))
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

