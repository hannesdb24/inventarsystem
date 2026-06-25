# Inventarsystem – Deployment auf Render.com

## Schritt 1: Code auf GitHub hochladen

1. Geh auf **https://github.com** und melde dich an
2. Klicke oben rechts auf **+** → **New repository**
3. Name: `inventarsystem`, Sichtbarkeit: **Private**, dann **Create repository**
4. Öffne ein Terminal im Ordner `Inventarsystem` und führe aus:

```
git init
git add .
git commit -m "Inventarsystem"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/inventarsystem.git
git push -u origin main
```

> `DEIN-USERNAME` durch deinen GitHub-Benutzernamen ersetzen.

---

## Schritt 2: Auf Render deployen

1. Geh auf **https://render.com** und melde dich an
2. Klicke auf **New** → **Blueprint**
3. Verbinde dein GitHub-Konto und wähle das Repository `inventarsystem`
4. Render erkennt die `render.yaml` automatisch und richtet alles ein
5. Klicke auf **Apply** — Render erstellt jetzt:
   - Deinen Web-Server
   - Eine PostgreSQL-Datenbank
   - Die Verbindung zwischen beiden

Das Deployment dauert ca. 2–3 Minuten.

---

## Schritt 3: App öffnen

Nach dem Deployment siehst du unter **Web Service** eine URL wie:

```
https://inventarsystem-xxxx.onrender.com
```

Diese URL kannst du mit deiner Kollegin teilen — sie kann direkt darauf zugreifen.

---

## Hinweise

- **Kostenlos**: Der Free-Tier von Render reicht aus. Die App „schläft" nach 15 Minuten Inaktivität und braucht beim ersten Aufruf ~30 Sekunden zum Aufwachen.
- **Lokal weiternutzen**: `npm start` funktioniert weiterhin lokal mit der JSON-Datei.
- **Updates**: Sobald du Änderungen pushst (`git push`), deployed Render automatisch neu.
