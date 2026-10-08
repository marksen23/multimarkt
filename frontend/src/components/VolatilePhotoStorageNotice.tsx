import { useEffect, useState } from 'react';
import { storageApi } from '../api/storage';

let statusRequest: Promise<boolean> | null = null;

function loadVolatile(): Promise<boolean> {
  statusRequest ??= storageApi
    .status()
    .then((status) => !status.durable)
    .catch(() => false);
  return statusRequest;
}

/**
 * Ohne S3-Bucket liegen Fotos auf der lokalen Platte. Die Dateien
 * verschwinden beim Neustart, die Datenbankzeilen bleiben.
 */
export function VolatilePhotoStorageNotice() {
  const [volatileStorage, setVolatileStorage] = useState(false);

  useEffect(() => {
    let active = true;
    loadVolatile().then((next) => {
      if (active) setVolatileStorage(next);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!volatileStorage) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100"
    >
      <p className="font-bold">Fotos sind nicht dauerhaft gespeichert</p>
      <p className="mt-1 leading-relaxed">
        Es ist kein S3-kompatibler Bucket konfiguriert. Die Fotos liegen nur auf der lokalen
        Festplatte und verschwinden beim Neustart. Die Einträge in der Datenbank bleiben.
      </p>
    </div>
  );
}
