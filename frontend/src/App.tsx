import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { TokenGate } from './components/TokenGate';
import { DashboardPage } from './pages/DashboardPage';
import { NewItemPage } from './pages/NewItemPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { BundlesPage } from './pages/BundlesPage';
import { NewBundlePage } from './pages/NewBundlePage';
import { BundleDetailPage } from './pages/BundleDetailPage';
import { AccountPage } from './pages/AccountPage';
import { NegotiationDemoPage } from './pages/NegotiationDemoPage';
import { ConfidenceCenterDemoPage } from './pages/ConfidenceCenterDemoPage';

function App() {
  return (
    <TokenGate>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/new" element={<NewItemPage />} />
          <Route path="/items/:id" element={<ItemDetailPage />} />
          <Route path="/bundles" element={<BundlesPage />} />
          <Route path="/bundles/new" element={<NewBundlePage />} />
          <Route path="/bundles/:id" element={<BundleDetailPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/demo/negotiation" element={<NegotiationDemoPage />} />
          <Route path="/demo/confidence-center" element={<ConfidenceCenterDemoPage />} />
        </Routes>
      </AppShell>
    </TokenGate>
  );
}

export default App;
