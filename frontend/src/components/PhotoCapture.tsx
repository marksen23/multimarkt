import { useEffect, useRef, useState } from 'react';

/**
 * README §3 Schritt 1 "Foto-Erfassung": der gesamte Workflow beginnt mit
 * dem Foto, nicht mit einem Formular. `capture="environment"` öffnet auf
 * Mobilgeräten direkt die Rückkamera (PWA-Nutzung, Schritt 6).
 */
export function PhotoCapture({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    onChange([...files, ...Array.from(list)]);
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
                aria-label="Foto entfernen"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full p-6 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm font-semibold hover:border-gray-400 hover:bg-gray-50 flex flex-col items-center gap-1"
      >
        <span className="text-2xl">📷</span>
        {files.length === 0 ? 'Foto aufnehmen / auswählen' : 'Weiteres Foto hinzufügen'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
