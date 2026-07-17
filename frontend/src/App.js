import '@/App.css';
import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { FunnelProvider } from '@/context/FunnelContext';
import PublicShell from '@/components/PublicShell';
import Landing from '@/pages/Landing';
import FunnelStep from '@/pages/FunnelStep';
import ThankYou from '@/pages/ThankYou';
import { trackPageView } from '@/lib/analytics';

// Everything below is lazily loaded so public visitors on mobile don't pay for
// the admin dashboard, creator portal, mockups, and legal-page code just to
// see the landing/funnel. This alone shaves ~100 KiB off the initial bundle.
const AdminLogin = lazy(() => import('@/pages/AdminLogin'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const Contact = lazy(() => import('@/pages/Contact'));
const MockupHome = lazy(() => import('@/pages/MockupHome'));
const MockupFunnel = lazy(() => import('@/pages/MockupFunnel'));
const MockupTabs = lazy(() => import('@/pages/MockupTabs'));
const PresellPA = lazy(() => import('@/pages/PresellPA'));
const PresellSPA = lazy(() => import('@/pages/PresellSPA'));
const TeamLandingPages = lazy(() => import('@/pages/TeamLanding'));
const SplitEntry = lazy(() => import('@/pages/SplitEntry'));
const CreatorPortal = lazy(() => import('@/pages/CreatorPortal'));

// Wrap each lazy route in Suspense with a bare-bones fallback (blank screen)
// — no spinners on the critical path.
const L = (el) => <Suspense fallback={null}>{el}</Suspense>;

// Sends a GA4 page_view on every client-side route change (SPA tracking).
function AnalyticsTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);
  return null;
}

// Team-landing bundles TeamOverlay + TeamSplit; small wrapper reads the right
// export per route while keeping both in one chunk.
function TeamRoute({ variant }) {
  return (
    <Suspense fallback={null}>
      <TeamLandingPages variant={variant} />
    </Suspense>
  );
}

function App() {
  return (
    <FunnelProvider>
      <BrowserRouter>
        <AnalyticsTracker />
        <Routes>
          {/* Public funnel pages share a persistent shell (fixed houses + tiny footer). */}
          <Route element={<PublicShell />}>
            <Route path="/" element={<Landing />} />
            <Route path="/sp" element={<Landing sourcePage="sp" pageLang="es" />} />
            <Route path="/flow/:step" element={<FunnelStep />} />
            <Route path="/thank-you" element={<ThankYou />} />
          </Route>

          {/* Standalone pages keep their own simple scrollable layout. */}
          <Route path="/mockup" element={L(<MockupHome />)} />
          <Route path="/mockup/funnel" element={L(<MockupFunnel />)} />
          <Route path="/mockup/tabs" element={L(<MockupTabs />)} />
          <Route path="/pa" element={L(<PresellPA />)} />
          <Route path="/spa" element={L(<PresellSPA />)} />
          <Route path="/tm" element={<TeamRoute variant="overlay" />} />
          <Route path="/tm2" element={<TeamRoute variant="split" />} />
          <Route
            path="/dg"
            element={L(<PresellPA contentPath="/dg-content" sourcePage="ladg" phone="(833) 240-9312" phoneHref="tel:+18332409312" rootTestId="presell-dg-page" />)}
          />
          <Route
            path="/dgs"
            element={L(<PresellSPA contentPath="/dgs-content" sourcePage="ladgs" phone="(833) 868-1802" phoneHref="tel:+18338681802" rootTestId="presell-dgs-page" />)}
          />
          <Route path="/split" element={L(<SplitEntry />)} />
          <Route path="/contact" element={L(<Contact />)} />
          <Route path="/terms" element={L(<LegalPage />)} />
          <Route path="/privacy" element={L(<LegalPage />)} />
          <Route path="/do-not-sell" element={L(<LegalPage />)} />
          <Route path="/admin" element={L(<AdminLogin />)} />
          <Route path="/admin/dashboard" element={L(<AdminDashboard />)} />
          <Route path="/creator-portal" element={L(<CreatorPortal />)} />
          {/* Split-test entry slugs: /split, /split2, /split3, or custom. Must stay
              last so all explicit routes above take precedence. */}
          <Route path="/:splitSlug" element={L(<SplitEntry />)} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </FunnelProvider>
  );
}

export default App;
