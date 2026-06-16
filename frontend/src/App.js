import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <FunnelProvider>
      <BrowserRouter>
        <Routes>
          {/* Public funnel pages share a persistent shell (fixed houses + tiny footer). */}
          <Route element={<PublicShell />}>
            <Route path="/" element={<Landing />} />
            <Route path="/flow/:step" element={<FunnelStep />} />
            <Route path="/thank-you" element={<ThankYou />} />
          </Route>

          {/* Standalone pages keep their own simple scrollable layout. */}
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
