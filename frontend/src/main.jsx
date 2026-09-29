import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { I18nProvider } from './i18n';
import ErrorBoundary from './components/ErrorBoundary';
import { registerServiceWorker } from './utils/push';
import './styles/global.css';
// Area stylesheets (one per feature area, owned by that area)
import './styles/site.css';
import './styles/provider.css';
import './styles/admin.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      {/* Last line of defence (e.g. a crash in the navbar); pages have their own boundary in App. */}
      <ErrorBoundary>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>
);

// PWA (offline shell, notifications). Production only, so the dev server is never cached.
if (import.meta.env.PROD) registerServiceWorker();
