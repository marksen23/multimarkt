import { Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ItemPage } from './pages/ItemPage';
import { NegotiationDemoPage } from './pages/NegotiationDemoPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/items/:id" element={<ItemPage />} />
      <Route path="/demo/negotiation" element={<NegotiationDemoPage />} />
    </Routes>
  );
}

export default App;
