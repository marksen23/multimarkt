# Personal Resale OS

Einzelverkäufer-Werkzeug: ein Zugangstoken, ein Nutzer, eine Wahrheit pro Artikel. NestJS-Backend, React/Vite-Frontend, PostgreSQL und Redis. Im Betrieb liefert das Backend das gebaute Frontend mit aus.

Der Code ist der aktuelle Stand. Die kopierten Entwürfe unter `docs/` sind nicht die Quelle, nach der gebaut wird.

## Start

Node.js 20. Zwei Ordner: `backend/` und `frontend/`.

```bash
cd backend
cp .env.example .env
npm install
npm run migration:run
npm run start:dev
```

```bash
cd frontend
npm install
npm run dev
```

Der Vite-Dev-Server leitet `/api` an `http://localhost:3000` weiter. Öffne die Adresse, die Vite ausgibt, und trage den Zugangstoken ein. Alle Variablen stehen kommentiert in `backend/.env.example`.

### Zugangstoken

Es gibt keinen Login. `APP_ACCESS_TOKEN` ist ein statisches Bearer-Token. Die Oberfläche fragt ihn einmal ab und schickt ihn als `Authorization: Bearer …`. Er muss zur einzigen Nutzerzeile passen: `APP_USER_ID` ist fest `00000000-0000-0000-0000-000000000000`. Lokal steht der Token in `backend/.env`. Auf Render liegt er im Dashboard des Webservices.

### Datenbank

PostgreSQL. Entweder `DATABASE_URL` (so liefert Render sie) oder `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` und `DB_NAME`. `DB_SSL=true` nur, wenn der Server TLS verlangt.

Das Schema kommt nur über Migrationen, nicht über Auto-Sync und nicht beim Prozessstart:

```bash
cd backend && npm run migration:run
```

### Redis

`REDIS_URL`, lokal `redis://localhost:6379`. BullMQ hängt daran. Ohne Redis startet der Prozess nicht.

### Welche Variablen Mocks abschalten

Ohne echten Schlüssel, oder mit dem Platzhalter `unused-mock-provider-active`, antwortet ein Mock. Die Oberfläche sieht dann vollständig aus.

| Variable | Mock aus, sobald |
| --- | --- |
| `GEMINI_API_KEY` | ein echter Schlüssel, nicht der Platzhalter. Gilt für Bildanalyse, Titel, Beschreibung, Preisrecherche über Google-Suche, Ankaufsuche und Bildoptimierung. |
| `EBAY_CLIENT_ID` und `EBAY_CLIENT_SECRET` | beide gesetzt und die Client-ID kein Platzhalter. Dann kommen aktive Angebote aus der eBay Browse API. Abgeschlossene Verkäufe liefert diese API nicht. |
| `S3_BUCKET` zusammen mit `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` und `S3_PUBLIC_URL_BASE` | Fotos liegen in einem S3-kompatiblen Bucket, zum Beispiel Cloudflare R2. |

Der Ankaufsanker bleibt ein Mock. Seine Zahl ist kein Marktpreis.

`PUBLIC_BASE_URL` muss für die echte Bildanalyse erreichbar sein, damit relative Foto-URLs abgerufen werden können.

### Kleinanzeigen

Kleinanzeigen lässt sich nicht über eine API veröffentlichen. Es gibt keine erlaubte Dritt-Schnittstelle. Die App bereitet Titel, Text und Preis vor. Du kopierst, stellst selbst ein und bestätigst in der App, dass die Anzeige online ist.

### Fotos ohne Bucket

Ohne `S3_BUCKET` schreibt die App nach `UPLOAD_DIR` auf die lokale Platte. Die Dateien verschwinden beim Neustart oder Deploy. Die Zeilen in der Datenbank bleiben und zeigen dann auf tote Links. Die Foto-Ansicht warnt in diesem Fall.

### Datenbank auf Render

Der kostenlose Render-Postgres-Plan läuft 30 Tage und verlängert sich nicht. Danach ist die Datenbank weg. Das ist kein Dauerlager. Entweder auf den kleinen bezahlten Plan wechseln oder regelmäßig exportieren.

### Sicherung

Die Sicherung ist dieser Export. In der App liegt sie unter **Sicherung** (`/sicherung`): eine Datei mit Artikeln, Einkäufen, Verkäufen und der Fotoliste, plus die Zahlen des Monats. Dieselbe Datei kommt über `GET /api/export/download`. Ein wöchentlicher Download ist der Schutz, solange die Datenbank kein Dauerlager ist.
