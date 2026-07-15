import '@/App.css';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { FunnelProvider } from '@/context/FunnelContext';
import PublicShell from '@/components/PublicShell';
import Landing from '@/pages/Landing';
import FunnelStep from '@/pages/FunnelStep';
import ThankYou from '@/pages/ThankYou';
import AdminLogin from '@/pages/AdminLogin';
import AdminDashboard from '@/pages/AdminDashboard';
import LegalPage from '@/pages/LegalPage';
import Contact from '@/pages/Contact';
import MockupHome from '@/pages/MockupHome';
import MockupFunnel from '@/pages/MockupFunnel';
import MockupTabs from '@/pages/MockupTabs';
import PresellPA from '@/pages/PresellPA';
import PresellSPA from '@/pages/PresellSPA';
import { TeamOverlay, TeamSplit } from '@/pages/TeamLanding';
import SplitEntry from '@/pages/SplitEntry';
import CreatorPortal from '@/pages/CreatorPortal';
import { trackPageView } from '@/lib/analytics';

// Sends a GA4 page_view on every client-side route change (SPA tracking).
function AnalyticsTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);
  return null;
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
          <Route path="/mockup" element={<MockupHome />} />
          <Route path="/mockup/funnel" element={<MockupFunnel />} />
          <Route path="/mockup/tabs" element={<MockupTabs />} />
          <Route path="/pa" element={<PresellPA />} />
          <Route path="/spa" element={<PresellSPA />} />
          <Route path="/tm" element={<TeamOverlay />} />
          <Route path="/tm2" element={<TeamSplit />} />
          <Route
            path="/dg"
            element={<PresellPA contentPath="/dg-content" sourcePage="ladg" phone="(833) 240-9312" phoneHref="tel:+18332409312" rootTestId="presell-dg-page" />}
          />
          <Route
            path="/dgs"
            element={<PresellSPA contentPath="/dgs-content" sourcePage="ladgs" phone="(833) 868-1802" phoneHref="tel:+18338681802" rootTestId="presell-dgs-page" />}
          />
          <Route path="/split" element={<SplitEntry />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/do-not-sell" element={<LegalPage />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/creator-portal" element={<CreatorPortal />} />
          {/* Split-test entry slugs: /split, /split2, /split3, or custom. Must stay
              last so all explicit routes above take precedence. */}
          <Route path="/:splitSlug" element={<SplitEntry />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </FunnelProvider>
  );
}

export default App;
