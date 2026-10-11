import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { TokenGate } from './components/TokenGate';
import { ToastProvider } from './components/Toast';
import { ItemsProvider } from './contexts/ItemsContext';
import { HeutePage } from './pages/HeutePage';
import { BestandPage } from './pages/BestandPage';
import { MehrPage } from './pages/MehrPage';
import { NewItemPage } from './pages/NewItemPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { BundlesPage } from './pages/BundlesPage';
import { NewBundlePage } from './pages/NewBundlePage';
import { BundleDetailPage } from './pages/BundleDetailPage';
import { AccountPage } from './pages/AccountPage';
import { NegotiationDemoPage } from './pages/NegotiationDemoPage';
import { ConfidenceCenterDemoPage } from './pages/ConfidenceCenterDemoPage';
import { AnkaufPage } from './pages/AnkaufPage';
import { NotFoundPage } from './pages/NotFoundPage';

function App() {
  return (
    <ToastProvider>
      <TokenGate>
        <ItemsProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<HeutePage />} />
              <Route path="/bestand" element={<BestandPage />} />
              <Route path="/mehr" element={<MehrPage />} />
              <Route path="/new" element={<NewItemPage />} />
              <Route path="/items/:id" element={<ItemDetailPage />} />
              <Route path="/ankauf" element={<AnkaufPage />} />
              <Route path="/bundles" element={<BundlesPage />} />
              <Route path="/bundles/new" element={<NewBundlePage />} />
              <Route path="/bundles/:id" element={<BundleDetailPage />} />
              <Route path="/account" element={<AccountPage />} />
              {import.meta.env.DEV && <Route path="/demo/negotiation" element={<NegotiationDemoPage />} />}
              {import.meta.env.DEV && <Route path="/demo/confidence-center" element={<ConfidenceCenterDemoPage />} />}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppShell>
        </ItemsProvider>
      </TokenGate>
    </ToastProvider>
  );
}

export default App;
