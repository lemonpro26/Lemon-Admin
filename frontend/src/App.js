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
import PresellPA from '@/pages/PresellPA';
import SplitEntry from '@/pages/SplitEntry';
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
          <Route path="/pa" element={<PresellPA />} />
          <Route path="/split" element={<SplitEntry />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/do-not-sell" element={<LegalPage />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </FunnelProvider>
  );
}

export default App;
