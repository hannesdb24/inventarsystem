# Inventarsystem – Projektübersicht für Claude Code

## Was ist das?
Ein internes Web-Inventarsystem für ein mittelständisches Unternehmen (~20–100 Mitarbeiter, ~100–500 Geräte). Mitarbeiter können Geräte (Laptops, Monitore etc.) verwalten und einander zuweisen.

## Tech Stack
- **Backend**: Node.js + Express
- **Datenbank**: PostgreSQL (Cloud) / JSON-Datei (lokal als Fallback)
- **Frontend**: Vanilla HTML/CSS/JS (Single Page App, keine Frameworks)
- **Hosting**: Railway (https://inventarsystem-production.up.railway.app)
- **Repo**: https://github.com/hannesdb24/inventarsystem

## Projektstruktur
```
/
├── server.js          # Express-Backend mit allen API-Routen
├── auth.js            # Nutzersteuerung (Anmeldung, Einladung, Passwort, Benutzer)
├── public/
│   └── index.html     # Single-Page Frontend
├── design/            # Hausgestaltung aus dem DAKO (Tokens + Regelwerk)
├── package.json
├── render.yaml        # (veraltet, wird nicht mehr genutzt)
└── inventar.json      # Lokale Datenbank-Datei (nur lokal, nicht in Git)
```

## Datenbank-Schema (PostgreSQL)
- `users` – Systembenutzer (Login per E-Mail; Altkonten ohne E-Mail per Benutzername)
- `user_tokens` – Einmal-Links (Einladung, Passwort), nur SHA-256-Hash
- `login_throttle` – Login-Bremse (5 Fehlversuche → 15 Min. Sperre)
- `employees` – Mitarbeiter des Unternehmens (Inventarempfänger)
- `devices` – Geräte mit Status (verfügbar / vergeben / defekt)
- `assignments` – Zuweisungen Gerät ↔ Mitarbeiter mit Verlauf
- `misc_items` / `misc_movements` – Sonstige Artikel (z. B. Gin, Gin im Geschenkkarton): je Bezeichnung + Art ein Artikel; Bestand wird aus den Buchungen (Zugang, Ausgabe, Ausbuchung) gerechnet. Eine Ausgabe hat Datum, „ausgegeben von“ (Mitarbeiter) und Empfänger (Mitarbeiter oder Freitext für Externe); keine Rückgabe

## API-Endpunkte
- `GET/POST /api/employees` – Mitarbeiter
- `PUT/DELETE /api/employees/:id`
- `GET/POST /api/devices` – Geräte
- `PUT/DELETE /api/devices/:id`
- `GET/POST /api/assignments` – Zuweisungen
- `PUT /api/assignments/:id/return` – Rückgabe
- `GET /api/stats` – Dashboard-Kennzahlen
- `GET/POST /api/misc/items`, `PUT/DELETE /api/misc/items/:id`, `GET /api/misc/items/:id/details` – Sonstige Artikel (Anlegen/Ändern/Archivieren nur Admin)
- `POST /api/misc/movements` – Buchung (Ausgabe: alle; Zugang/Ausbuchung: Admin), `GET /api/misc/ausgaben` – alle Ausgaben
- `POST /api/auth/login|logout`, `GET /api/auth/me`, `PATCH /api/profile/password`
- `POST /api/passwort-vergessen`, `GET/POST /api/einrichten/:token` (öffentlich)
- `GET/POST /api/users`, `PUT /api/users/:id`, `POST /api/users/:id/einladung|passwort-link` (Admin; kein Löschen, nur Deaktivieren)

## Umgebungsvariablen (Railway)
- `DATABASE_URL` – PostgreSQL-Verbindung (automatisch von Railway gesetzt)
- `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASS` – gesetzt. Der Admin wird nur **angelegt**, wenn es ihn noch nicht gibt; ADMIN_PASS überschreibt kein Passwort mehr
- `APP_URL` – Basis für Links in Mails (Pflicht für Einladungen), z. B. https://inventarsystem-production.up.railway.app
- `SMTP_HOST`, `SMTP_PORT` (587/465), `SMTP_USER`, `SMTP_PASS` – Postfach inventarsystem@dachbleche24.de
- `MAIL_FROM` – z. B. `Inventarsystem <inventarsystem@dachbleche24.de>`
- `MAIL_SANDBOX_TO` – gesetzt = alle Mails gehen an diese Adresse (zum Testen)

## Was bereits erledigt ist
- ✅ Vollständiges Backend mit allen CRUD-Endpunkten
- ✅ Vollständiges Frontend (Dashboard, Geräte, Mitarbeiter, Verlauf)
- ✅ PostgreSQL-Integration mit JSON-Fallback für lokale Entwicklung
- ✅ Deployment auf Railway läuft
- ✅ Nutzersteuerung nach dem DAKO-Bausatz (`Dako/docs/NUTZERSTEUERUNG-BAUSATZ-2026-09-24.md`): Einladung per Mail, Passwort vergessen, Passwort ändern, Login-Bremse, Deaktivieren statt Löschen

## Was noch zu tun ist
- [ ] APP_URL, SMTP_*, MAIL_FROM in Railway setzen (erst mit MAIL_SANDBOX_TO testen)
- [ ] Nach Implementierung: `npm install` (für neue Packages), dann `git add . && git commit && git push`

## Gestaltung
Die Oberfläche folgt der Hausgestaltung aus dem DAKO. Sie liegt in `design/`:

- `design/tokens.css` – Farben (hell und dunkel), Radien, Höhen, Schatten und
  die Grundregeln; wird über `/design/tokens.css` ausgeliefert
- `design/DESIGN.md` – das Regelwerk (Ein-Orange-Regel, Tinten-Regel,
  Radien-Leiter, Schriftleiter, Do's and Don'ts)
- `design/UX-LEITLINIEN.md` – die zehn Bedienregeln

**Vor jeder Änderung an der Oberfläche `design/DESIGN.md` lesen.** Kurzfassung:
keine Hex-Werte in Komponenten, höchstens eine orange Fläche je Seite, keine
Pillenform, nichts unter 11 px, kein grauer Rahmen um eine Fläche.

## Lokale Entwicklung
```bash
npm install
npm start
# → http://localhost:3000
```
Ohne DATABASE_URL läuft die App mit lokaler JSON-Datei (inventar.json).

## Deployment
Jeder `git push` auf `main` löst automatisch ein Redeploy auf Railway aus.
