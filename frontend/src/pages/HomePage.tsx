import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { itemsApi } from '../api/items';
import { ApiRequestError } from '../api/client';

export function HomePage() {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const createItem = async () => {
    setCreating(true);
    setError(null);
    try {
      const item = await itemsApi.create(title || undefined);
      navigate(`/items/${item.id}`);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.body.message : 'Unbekannter Fehler');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Personal Resale OS</h1>
        <p className="text-sm text-gray-500">
          Fotografieren statt Formulare ausfüllen. Starte mit einem neuen Gegenstand.
        </p>
        <input
          type="text"
          placeholder="Titel (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-black"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="button"
          disabled={creating}
          onClick={createItem}
          className="w-full p-3 rounded-lg font-bold bg-black text-white disabled:bg-gray-300"
        >
          {creating ? 'Wird erstellt…' : 'Neuer Artikel'}
        </button>
        <a
          href="/demo/negotiation"
          className="block text-center text-xs text-gray-400 hover:text-gray-600"
        >
          Chat-Assistent-Demo ansehen
        </a>
      </div>
    </div>
  );
}
