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
import { loadCatalog } from './i18n';
import { usePrefs } from './state/prefs';

// Chinese copy is its own chunk: fetch it before the first paint so the page never flashes English.
void loadCatalog(usePrefs.getState().uiLanguage)
  .catch(() => {})
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    ),
  );
