import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// vite.config.js sets registerType: 'autoUpdate', but that only takes effect
// if something actually calls registerSW() — without this, the previously
// auto-injected registration script installs updates in the background but
// never tells the open tab to reload, so users kept seeing the old build
// until they refreshed several times. This closes the loop: check for
// updates immediately and reload as soon as a new version activates.
registerSW({ immediate: true })

// Self-heal stale code-split chunks after a deploy. When an already-open client
// tries to lazy-load a chunk whose hashed filename no longer exists on the
// server, the SPA rewrite returns index.html (text/html) → "not a valid
// JavaScript MIME type". Reload once (guarded) to fetch the fresh index + chunks.
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('cl_chunk_reloaded')) {
    sessionStorage.setItem('cl_chunk_reloaded', '1');
    window.location.reload();
  }
});
// Clear the guard once a navigation succeeds so future deploys can self-heal too.
window.addEventListener('load', () => {
  setTimeout(() => sessionStorage.removeItem('cl_chunk_reloaded'), 4000);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
