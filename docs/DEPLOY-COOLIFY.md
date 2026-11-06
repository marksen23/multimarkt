# Deploy mit Coolify

Der gleiche Stand läuft weiter über Render (`render.yaml`). Coolify ist ein zweiter Weg, kein Ersatz. Die Blueprint-Datei bleibt unverändert.

## Dateien

- `Dockerfile` baut Frontend und Backend und startet Nest als Nutzer `appuser` (UID 1001) auf `$PORT` (Standard 3000).
- `.dockerignore` hält `node_modules`, Build-Artefakte und Env-Dateien aus dem Build-Kontext.
- `docker-compose.coolify.yml` startet die App, PostgreSQL 16 (`postgres:16-alpine`) und Redis 7 (`redis:7-alpine`).

Beim Containerstart läuft `npm run migration:run` (TypeORM-CLI auf den `.ts`-Migrationen), danach `node dist/main`. Es gibt kein `synchronize` und kein stilles `migrationsRun` im Nest-Prozess.

## In Coolify anlegen

1. Neue Ressource aus dem Git-Repository, Build Pack **Docker Compose**.
2. Docker Compose Location: `docker-compose.coolify.yml`.
3. Compose-Deployment auf dem normalen Weg lassen, nicht auf **Raw**. Coolify hängt den Proxy selbst an. Eigene Traefik-Labels sind dann nicht nötig.
4. Domain der App mit internem Port, zum Beispiel `https://resale.example.com:3000`. Der Zusatz `:3000` ist der Container-Port, nicht der öffentliche Port. Die Variable `SERVICE_URL_APP_3000` in der Compose-Datei macht dasselbe.
5. Deploy starten. In den Logs der App muss die Migrationszeile von TypeORM erscheinen, danach lauscht Nest.

Die App hat kein `ports:`-Mapping auf `0.0.0.0`. Postgres und Redis ebenfalls nicht. Alle drei Dienste hängen nur am Compose-Netzwerk `internal`. Coolify erreicht die App über dieses Netz.

## Variablen

Coolify erzeugt die Werte zu den `SERVICE_*`-Namen beim Laden der Compose-Datei. Sie stehen nicht im Git.

| Name in Coolify | Verwendung |
| --- | --- |
| `SERVICE_USER_POSTGRES` | Datenbankbenutzer |
| `SERVICE_PASSWORD_64_POSTGRES` | Datenbankpasswort, ohne Sonderzeichen, damit die URL gültig bleibt |
| `SERVICE_PASSWORD_64_APPTOKEN` | `APP_ACCESS_TOKEN` |
| `SERVICE_REALBASE64_64_JWT` | `JWT_SECRET` (der Prozess liest den Wert derzeit nicht; Zugang ist das Access-Token) |
| `SERVICE_PASSWORD_64_INTERNAL` | `INTERNAL_SERVICE_TOKEN` |
| `SERVICE_PASSWORD_64_WEBHOOK` | `WEBHOOK_SECRET_KLEINANZEIGEN` |

`APP_USER_ID` ist fest `00000000-0000-0000-0000-000000000000` und muss zur Zeile aus der Migration `SeedSingleUser` passen.

`PUBLIC_BASE_URL` übernimmt die von Coolify erzeugte URL. Für Foto-Links, die ein externer Dienst abruft, muss diese URL von außen erreichbar sein.

Leer lassen, solange die Mocks reichen: `GEMINI_API_KEY`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL_BASE`. Ein echter Wert wird nur im Coolify-UI eingetragen. Der Platzhalter `unused-mock-provider-active` lässt den Mock ebenfalls an. Welche Namen der Code liest, steht in `backend/.env.example`.

## Daten

Benannte Volumes: `db-data` (Postgres), `redis-data` (AOF), `uploads` (liegt auf `UPLOAD_DIR`, im Container `/app/backend/uploads`). Ohne `S3_BUCKET` bleiben Fotos in diesem Volume. Redis läuft mit `maxmemory-policy noeviction`, weil BullMQ das braucht, und ohne eigenes Passwort, weil der Port nicht am Host hängt.

## Prüfungen

- `GET /healthz` ist die Liveness-Prüfung (Docker-`HEALTHCHECK` und Render nutzen denselben Pfad). Antwort 200, sobald der Prozess lauscht.
- `GET /ready` prüft Postgres (`SELECT 1`) und Redis (`PING`). Beide in Ordnung: 200 und `{ "status": "ready", ... }`. Sonst 503.
- Der BullMQ-Consumer für `sale-conflict-evaluation` läuft im selben Prozess wie die HTTP-API.

## Lokal gegen diese Compose-Datei

Nur Platzhalter, keine echten Schlüssel. Die Namen müssen dieselben sein, die Coolify sonst füllt:

```bash
export SERVICE_USER_POSTGRES=resale
export SERVICE_PASSWORD_64_POSTGRES=local-only-change-me
export SERVICE_PASSWORD_64_APPTOKEN=local-only-access-token
export SERVICE_REALBASE64_64_JWT=local-only-jwt-secret
export SERVICE_PASSWORD_64_INTERNAL=local-only-internal-token
export SERVICE_PASSWORD_64_WEBHOOK=local-only-webhook-secret
docker compose -f docker-compose.coolify.yml up --build
```

Die App ist dabei absichtlich nicht auf dem Host veröffentlicht. Aus dem App-Container heraus: `http://127.0.0.1:3000/healthz`, `/ready` und `/`.
