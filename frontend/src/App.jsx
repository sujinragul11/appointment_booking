import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { useT } from './i18n';
import NotFound from './pages/NotFound';
// Each area owns its route module (routes + page titles).
import { siteRoutes, siteTitles } from './routes/site';
import { providerRoutes, providerTitles } from './routes/provider';
import { adminRoutes, adminTitles } from './routes/admin';

const BASE_TITLE = 'Sloto — Find & book appointments anywhere';

// WCAG 2.4.2: every page gets its own document title. First match wins.
const PAGE_TITLES = [
  ...adminTitles,
  ...providerTitles,
  ...siteTitles,
  [/^\/404/, 'Page not found']
];

function usePageTitle(pathname) {
  useEffect(() => {
    const match = PAGE_TITLES.find(([pattern]) => pattern.test(pathname));
    document.title = match ? `${match[1]} · Sloto` : BASE_TITLE;
  }, [pathname]);
}

export default function App() {
  const t = useT();
  const { pathname } = useLocation();
  usePageTitle(pathname);

  const skipToMain = (e) => {
    e.preventDefault();
    document.getElementById('main')?.focus();
  };

  return (
    <ToastProvider>
      <a href="#main" className="skip-link" onClick={skipToMain}>{t('common.skipToContent')}</a>
      <Navbar />
      <main id="main" tabIndex={-1}>
        {/* A crash in one page shows a friendly error; navigating elsewhere clears it. */}
        <ErrorBoundary resetKey={pathname}>
          <Routes>
            {siteRoutes}
            {providerRoutes}
            {adminRoutes}

            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </ToastProvider>
  );
}
