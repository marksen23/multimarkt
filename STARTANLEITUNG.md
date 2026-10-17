# Resale OS starten (Windows, eigener Rechner)

So läuft die App auf dem eigenen Windows-Rechner und ist vom Handy aus erreichbar, per WLAN oder Tailscale. Alles hier beruht auf `setup.ps1`, `start.ps1` und `scripts/resale-env.ps1`.

## 1. Was du brauchst

| Programm | Wofür | Woher |
|---|---|---|
| Node.js 20 oder neuer | Backend und Frontend bauen und ausführen | https://nodejs.org |
| Docker Desktop | Datenbank (PostgreSQL) und Redis | https://www.docker.com/products/docker-desktop |
| Git | Code holen und aktualisieren | https://git-scm.com |
| Tailscale (optional) | Zugriff vom Handy auch unterwegs | https://tailscale.com |
| Gemini-API-Schlüssel (optional) | echte KI-Fotoanalyse | Google AI Studio |

Ohne Gemini-Schlüssel läuft die App auch, die Analyse liefert dann aber nur Platzhalterwerte.

Hol den Code mit Git, nicht als ZIP. `start.ps1` merkt sich den gebauten Git-Stand und baut nur nach einem Update neu. Ohne Git baut es bei jedem Start neu.

```powershell
git clone https://github.com/marksen23/multimarkt.git
cd multimarkt
```

## 2. Einmalig einrichten

1. Starte **Docker Desktop** und warte, bis es läuft.
2. Öffne PowerShell im Ordner `multimarkt` und führe aus:

   ```powershell
   .\setup.ps1
   ```

3. Das Setup fragt nach dem **Gemini-API-Schlüssel**. Gib ihn ein oder drücke Enter, wenn du ohne KI starten willst.

Das Setup macht danach Folgendes:

- Es prüft Node.js (Version 20 oder neuer) und Docker.
- Es legt die Konfiguration unter `%USERPROFILE%\.resale-os-secrets\.env` an. Dort liegen auch die Fotos (`uploads`). Der Ordner liegt bewusst außerhalb des Repos, damit nichts in Git oder OneDrive landet. Eine vorhandene Datei wird nicht überschrieben.
- Es startet PostgreSQL und Redis in Docker, baut Backend und Frontend und richtet die Datenbank ein (Migrationen).
- Zum Schluss zeigt es dein **App-Passwort** (Zugriffstoken) an. Das brauchst du beim ersten Öffnen der App.

> Meldet Windows, dass das Ausführen von Skripten deaktiviert ist, starte das Skript so:
> `powershell -ExecutionPolicy Bypass -File .\setup.ps1` (für `start.ps1` genauso).

## 3. Starten

```powershell
.\start.ps1
```

- Datenbanken starten. Hat sich der Code seit dem letzten Start geändert, baut das Skript neu. Danach laufen die Datenbank-Migrationen.
- Das Skript zeigt die Adressen für diesen Rechner und das Handy sowie das App-Passwort an.
- Der Browser öffnet sich von selbst unter `http://127.0.0.1:3000`, sobald der Server antwortet.
- Beim ersten Öffnen fragt die App nach dem Zugriffstoken. Gib das App-Passwort ein.

Das PowerShell-Fenster muss offen bleiben, solange du die App nutzt.

> **Achtung, Port 3000:** `start.ps1` beendet jedes Programm, das schon auf Port 3000 lauscht. Nutzt eine andere App (zum Beispiel Loria) denselben Port, wird sie dabei gestoppt.

## 4. Am Handy öffnen

`start.ps1` zeigt die passenden Adressen unter „Handy:“ an:

- **Im selben WLAN:** `http://<IP-des-Rechners>:3000`, zum Beispiel `http://192.168.178.20:3000`.
- **Über Tailscale (auch unterwegs):** `http://<rechnername>.<tailnet>.ts.net:3000`. Dazu muss Tailscale auf Rechner und Handy laufen, mit demselben Konto angemeldet.

Fragt die Windows-Firewall beim ersten Start, ob Node.js Netzwerkzugriff bekommen soll, erlaube den Zugriff für **private Netzwerke**. Sonst erreicht das Handy den Rechner nicht.

## 5. Als App aufs Handy (optional, HTTPS)

Über `http://` läuft die App im Handy-Browser. Zum Installieren als App („Zum Startbildschirm hinzufügen“ / „App installieren“) verlangen die Browser eine HTTPS-Adresse. Die liefert Tailscale:

1. In der Tailscale-Verwaltung unter **DNS** die **HTTPS Certificates** einschalten.
2. Starten mit:

   ```powershell
   .\start.ps1 -Https
   ```

3. Am Handy die Adresse unter „Handy (HTTPS)“ öffnen, `https://<rechnername>.<tailnet>.ts.net` (ohne `:3000`), und dort über das Browser-Menü die App installieren.

## 6. Aktualisieren

```powershell
git pull
.\start.ps1
```

`start.ps1` merkt, dass sich der Code geändert hat. Es baut neu und spielt neue Datenbank-Migrationen ein.

## 7. Beenden

- Mit **Strg + C** im PowerShell-Fenster stoppst du die App.
- Datenbank und Redis laufen in Docker weiter und starten mit Docker Desktop von selbst wieder. Beim nächsten `.\start.ps1` geht es nahtlos weiter.

## 8. Wo deine Daten liegen

| Was | Wo |
|---|---|
| Artikel, Verkäufe, Einkäufe | Docker-Volume `resale-os-pg` (PostgreSQL) |
| Warteschlangen | Docker-Volume `resale-os-redis` |
| Fotos | `%USERPROFILE%\.resale-os-secrets\uploads` |
| Konfiguration und App-Passwort | `%USERPROFILE%\.resale-os-secrets\.env` |

Die Daten bleiben bei Neustarts erhalten. **Sicherung:** In der App unter **Mehr → Sicherung** lädst du eine Exportdatei herunter. Mach das regelmäßig.

Gemini-Schlüssel nachtragen oder ändern: In der `.env`-Datei die Zeile `GEMINI_API_KEY=…` anpassen und die App neu starten (Strg + C, dann `.\start.ps1`).

## 9. Wenn etwas nicht klappt

| Meldung / Problem | Lösung |
|---|---|
| `Docker laeuft nicht` oder `Fehlgeschlagen: Datenbanken starten (Docker)` | Docker Desktop starten, warten, bis es bereit ist, dann erneut starten. |
| `Keine Konfiguration gefunden` | Zuerst `.\setup.ps1` ausführen. |
| `Node.js … ist zu alt` | Node.js 20 oder neuer installieren, PowerShell neu öffnen. |
| Handy erreicht die Adresse nicht | Gleiches WLAN oder Tailscale auf beiden Geräten aktiv? Windows-Firewall-Zugriff für Node.js erlaubt? |
| App-Passwort vergessen | Wird bei jedem `.\start.ps1` angezeigt. Es steht auch als `APP_ACCESS_TOKEN` in der `.env`. |
| KI liefert nur Platzhalter | Es ist kein echter Gemini-Schlüssel eingetragen, siehe Abschnitt 8. |
| Ein Schritt bricht mit `Fehlgeschlagen: …` ab | Die Ausgabe darüber zeigt die Ursache. Danach `.\start.ps1` erneut ausführen. |
