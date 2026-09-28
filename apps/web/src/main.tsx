import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import '@fontsource-variable/instrument-sans/wdth.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/noto-serif-sc/400.css';
import './styles.css';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { router } from './app/router';

// After a new version is deployed, an open tab asks for code chunks that no longer exist. Reload once to
// pick up the new version; work is saved as it's made, and the flag stops a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem('folio.reloaded')) return;
  event.preventDefault();
  sessionStorage.setItem('folio.reloaded', '1');
  window.location.reload();
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('folio.reloaded'), 10_000));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
