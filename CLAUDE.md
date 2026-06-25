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
├── public/
│   └── index.html     # Single-Page Frontend
├── package.json
├── render.yaml        # (veraltet, wird nicht mehr genutzt)
└── inventar.json      # Lokale Datenbank-Datei (nur lokal, nicht in Git)
```

## Datenbank-Schema (PostgreSQL)
- `users` – Systembenutzer (Login)
- `employees` – Mitarbeiter des Unternehmens (Inventarempfänger)
- `devices` – Geräte mit Status (verfügbar / vergeben / defekt)
- `assignments` – Zuweisungen Gerät ↔ Mitarbeiter mit Verlauf

## API-Endpunkte
- `GET/POST /api/employees` – Mitarbeiter
- `PUT/DELETE /api/employees/:id`
- `GET/POST /api/devices` – Geräte
- `PUT/DELETE /api/devices/:id`
- `GET/POST /api/assignments` – Zuweisungen
- `PUT /api/assignments/:id/return` – Rückgabe
- `GET /api/stats` – Dashboard-Kennzahlen

## Umgebungsvariablen (Railway)
- `DATABASE_URL` – PostgreSQL-Verbindung (automatisch von Railway gesetzt)
- `SESSION_SECRET` – noch nicht gesetzt, muss hinzugefügt werden
- `ADMIN_USER` – noch nicht gesetzt
- `ADMIN_PASS` – noch nicht gesetzt

## Was bereits erledigt ist
- ✅ Vollständiges Backend mit allen CRUD-Endpunkten
- ✅ Vollständiges Frontend (Dashboard, Geräte, Mitarbeiter, Verlauf)
- ✅ PostgreSQL-Integration mit JSON-Fallback für lokale Entwicklung
- ✅ Deployment auf Railway läuft
- ✅ server.js wurde bereits um Session- und Auth-Grundstruktur erweitert (express-session, bcrypt, connect-pg-simple, users-Tabelle, requireAuth-Middleware, seedAdminUser)

## Was noch zu tun ist
- [ ] **Userbereich / Login-System fertigstellen**
  - Login-Seite im Frontend (index.html)
  - API-Routen: POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
  - `requireAuth` Middleware auf alle /api/* Routen anwenden
  - Benutzerverwaltung (Admin kann User anlegen/löschen/Rollen vergeben)
  - Rollen: `admin` (voller Zugriff) und `user` (nur lesen / zuweisen)
- [ ] SESSION_SECRET, ADMIN_USER, ADMIN_PASS als Umgebungsvariablen in Railway setzen
- [ ] Nach Implementierung: `npm install` (für neue Packages), dann `git add . && git commit && git push`

## Lokale Entwicklung
```bash
npm install
npm start
# → http://localhost:3000
```
Ohne DATABASE_URL läuft die App mit lokaler JSON-Datei (inventar.json).

## Deployment
Jeder `git push` auf `main` löst automatisch ein Redeploy auf Railway aus.
