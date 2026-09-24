// ─── NUTZERSTEUERUNG ──────────────────────────────────────────────────────────
// Nach dem Bausatz aus dem DAKO (Dako/docs/NUTZERSTEUERUNG-BAUSATZ-2026-09-24.md),
// übertragen auf Express + express-session. Die Regeln kurz:
//   - Kein Admin kennt ein fremdes Passwort: Anlegen verschickt eine Einladung,
//     der Nutzer setzt sein Passwort über einen Einmal-Link selbst.
//   - Einmal-Links: 32 Zufallsbytes, in der DB nur der SHA-256-Hash, 7 Tage,
//     einmal einlösbar. Basis-URL nur aus APP_URL, nie aus dem Host-Header.
//   - Login-Bremse in der DB: 5 Fehlversuche → 15 Minuten Sperre.
//   - Jeder API-Aufruf liest den Nutzer frisch aus der DB: Deaktivieren und
//     Rollenwechsel wirken beim nächsten Klick, ein neues Passwort beendet
//     alle älteren Sitzungen.
//   - Kein Löschen: Nutzer werden deaktiviert.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const dns = require('dns').promises;
const net = require('net');

const ROLLEN = ['admin', 'user'];
const PASSWORT_MINDESTLAENGE = 10;
const PASSWORT_MAXLAENGE = 200;
const TOKEN_GUELTIGKEIT_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_MUSTER = /^[A-Za-z0-9_-]{40,50}$/;
const MAX_VERSUCHE = 5;
const SPERRE_MS = 15 * 60 * 1000;
const AUFBEWAHRUNG_MS = 60 * 60 * 1000;
const AUFRAEUM_ABSTAND_MS = 10 * 60 * 1000;
const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Bcrypt-Hash (Kosten 12) eines Fantasie-Passworts. Bei unbekannter Adresse
// wird dagegen verglichen, damit die Antwort so lange dauert wie bei einem
// echten Konto (kein Timing-Orakel).
const DUMMY_HASH = '$2b$12$KAw7H4ltoW1bIOBDqmlNK.g.cZrXXRWBsVdTxAeCbJZLyHi//BL6S';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const normEmail = v => String(v || '').trim().toLowerCase();

// ─── Einmal-Links ─────────────────────────────────────────────────────────────

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function neuesToken(now = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + TOKEN_GUELTIGKEIT_MS) };
}

// Basis-URL NUR aus der Umgebung — sonst könnte ein gefälschter Host-Header
// einem echten Nutzer einen gültigen Link auf eine fremde Seite schicken.
function appBaseUrl() {
  const env = (process.env.APP_URL || '').trim();
  if (!env) throw new ApiError(503, 'APP_URL ist nicht gesetzt – ohne sie wären Links in Mails nicht vertrauenswürdig.');
  return env.replace(/\/+$/, '');
}

// ─── Mail ─────────────────────────────────────────────────────────────────────

function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function mailSandboxTo() {
  const v = (process.env.MAIL_SANDBOX_TO || '').trim();
  return v || null;
}

function describeMailError(error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code || '') : '';
  switch (code) {
    case 'EAUTH':
      return 'Der Mailserver hat die Anmeldung abgelehnt – SMTP_USER und SMTP_PASS prüfen.';
    case 'ETIMEDOUT':
    case 'ECONNECTION':
    case 'ESOCKET':
    case 'EDNS':
      return `Der Mailserver ist nicht erreichbar (${code}) – SMTP_HOST, SMTP_PORT und Netzwerk prüfen.`;
    case 'EENVELOPE':
      return 'Der Mailserver hat Absender oder Empfänger abgelehnt – Adressen prüfen.';
    default:
      return 'Der Mailserver hat den Versand abgelehnt – SMTP-Zugangsdaten und Empfängeradresse prüfen.';
  }
}

// Railway kann nach draußen kein IPv6 — deshalb per IPv4 verbinden.
async function resolveIPv4(host) {
  if (net.isIP(host)) return host;
  try {
    const [a] = await dns.resolve4(host);
    return a || host;
  } catch {
    return host;
  }
}

async function sendMail({ to, subject, text }) {
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);
  const hostname = process.env.SMTP_HOST || '';
  const transport = nodemailer.createTransport({
    host: await resolveIPv4(hostname),
    port,
    secure: port === 465,
    requireTLS: true,              // nie Klartext
    tls: { servername: hostname }, // Zertifikat trotz IP auf den Namen prüfen
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const sandboxTo = mailSandboxTo();
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: sandboxTo || to,
    subject: sandboxTo ? `[Sandbox an ${to}] ${subject}` : subject,
    text,
  });
}

const anrede = name => (name ? `Hallo ${name},` : 'Hallo,');
const bis = d => d.toLocaleString('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function einladungsMail({ name, link, gueltigBis }) {
  return {
    subject: 'Dein Zugang zum Inventarsystem',
    text: [
      anrede(name), '',
      'für dich wurde ein Zugang zum Inventarsystem angelegt.',
      'Über den folgenden Link richtest du dein Passwort ein und kannst dich danach anmelden:', '',
      link, '',
      `Der Link ist einmalig gültig, bis zum ${bis(gueltigBis)} Uhr.`,
      'Ist er abgelaufen, kann dir ein Administrator eine neue Einladung schicken.', '',
      'Falls du diese Mail nicht erwartet hast, kannst du sie einfach ignorieren.', '',
      'Viele Grüße', 'dachbleche24 · Inventarsystem',
    ].join('\n'),
  };
}

function passwortResetMail({ name, link, gueltigBis }) {
  return {
    subject: 'Inventarsystem – neues Passwort setzen',
    text: [
      anrede(name), '',
      'für dein Konto im Inventarsystem wurde ein neues Passwort angefordert.',
      'Über den folgenden Link legst du es fest:', '',
      link, '',
      `Der Link ist einmalig gültig, bis zum ${bis(gueltigBis)} Uhr.`, '',
      'Hast du kein neues Passwort angefordert, ignoriere diese Mail – dein bisheriges Passwort bleibt gültig.', '',
      'Viele Grüße', 'dachbleche24 · Inventarsystem',
    ].join('\n'),
  };
}

// ─── Speicher: PostgreSQL oder JSON-Datei ────────────────────────────────────

const USER_SPALTEN = 'id, username, email, name, role, is_active, password_hash, password_changed_at, created_at';

function pgStore(pool) {
  const eine = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;
  return {
    async init() {
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
        ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
        UPDATE users SET email = lower(trim(username)) WHERE email IS NULL AND username LIKE '%@%';
        CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
        CREATE TABLE IF NOT EXISTS user_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          purpose TEXT NOT NULL CHECK (purpose IN ('INVITE', 'PASSWORD_RESET')),
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS user_tokens_user_idx ON user_tokens (user_id);
        CREATE TABLE IF NOT EXISTS login_throttle (
          key TEXT PRIMARY KEY,
          failures INTEGER NOT NULL DEFAULT 0,
          locked_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    },
    // Anmeldung per E-Mail; Altkonten ohne E-Mail weiter per Benutzername.
    findByLogin: key => eine(
      `SELECT ${USER_SPALTEN} FROM users WHERE lower(email) = $1 OR (email IS NULL AND lower(username) = $1) ORDER BY email NULLS LAST LIMIT 1`,
      [key]),
    findById: id => eine(`SELECT ${USER_SPALTEN} FROM users WHERE id = $1`, [id]),
    emailVergeben: async (email, ohneId) => !!(await eine(
      'SELECT id FROM users WHERE lower(email) = $1 AND id <> $2', [email, ohneId || 0])),
    list: async () => (await pool.query(`SELECT ${USER_SPALTEN} FROM users`)).rows,
    create: ({ email, name, role }) => eine(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING ${USER_SPALTEN}`, [email, name, role]),
    async update(id, f) {
      const sets = [], params = [];
      for (const [spalte, wert] of Object.entries(f)) { params.push(wert); sets.push(`${spalte} = $${params.length}`); }
      if (!sets.length) return this.findById(id);
      params.push(id);
      return eine(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${USER_SPALTEN}`, params);
    },
    setPassword: (id, hash, now) => pool.query(
      'UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3', [hash, now, id]),

    async replaceToken(userId, purpose, tokenHash, expiresAt) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
        await client.query('INSERT INTO user_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)',
          [userId, tokenHash, purpose, expiresAt]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    },
    async findToken(tokenHash) {
      const r = await eine(`
        SELECT t.id, t.purpose, t.expires_at, t.used_at, u.id AS user_id, u.email, u.name, u.is_active
          FROM user_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1`, [tokenHash]);
      return r && { id: r.id, purpose: r.purpose, expires_at: r.expires_at, used_at: r.used_at,
        user: { id: r.user_id, email: r.email, name: r.name, is_active: r.is_active } };
    },
    // Einlösen mit der Bedingung used_at IS NULL: ein Doppelklick geht nicht doppelt durch.
    async redeemToken(tokenId, userId, passwordHash, now) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rowCount } = await client.query(
          'UPDATE user_tokens SET used_at = $1 WHERE id = $2 AND used_at IS NULL AND expires_at > $1', [now, tokenId]);
        if (rowCount !== 1) { await client.query('ROLLBACK'); return false; }
        await client.query('UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3', [passwordHash, now, userId]);
        await client.query('UPDATE user_tokens SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL', [now, userId]);
        await client.query('COMMIT');
        return true;
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    },

    async throttleGet(key) {
      const r = await eine('SELECT failures, locked_until FROM login_throttle WHERE key = $1', [key]);
      return r && { failures: r.failures, lockedUntil: r.locked_until ? r.locked_until.getTime() : 0 };
    },
    throttleSet: (key, e) => pool.query(`
      INSERT INTO login_throttle (key, failures, locked_until, updated_at) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (key) DO UPDATE SET failures = EXCLUDED.failures, locked_until = EXCLUDED.locked_until, updated_at = NOW()`,
      [key, e.failures, e.lockedUntil ? new Date(e.lockedUntil) : null]),
    throttleRemove: key => pool.query('DELETE FROM login_throttle WHERE key = $1', [key]),
    throttleCleanup: aelterAls => pool.query('DELETE FROM login_throttle WHERE updated_at < $1', [aelterAls]),
  };
}

function jsonStore({ loadDB, saveDB, nextId }) {
  const iso = d => (d instanceof Date ? d.toISOString() : d);
  const datum = v => (v ? new Date(v) : null);
  const mitDaten = u => u && { ...u, password_changed_at: datum(u.password_changed_at), is_active: u.is_active !== false };
  const db = () => {
    const d = loadDB();
    if (!d.user_tokens) d.user_tokens = [];
    if (!d.login_throttle) d.login_throttle = {};
    return d;
  };
  return {
    async init() {
      const d = db();
      for (const u of d.users) {
        if (u.email === undefined) u.email = u.username && u.username.includes('@') ? normEmail(u.username) : null;
        if (u.is_active === undefined) u.is_active = true;
      }
      saveDB(d);
    },
    async findByLogin(key) {
      const us = db().users;
      return mitDaten(us.find(u => u.email && normEmail(u.email) === key)
        || us.find(u => !u.email && u.username && u.username.toLowerCase() === key));
    },
    findById: async id => mitDaten(db().users.find(u => u.id === id)),
    emailVergeben: async (email, ohneId) => db().users.some(u => u.email && normEmail(u.email) === email && u.id !== ohneId),
    list: async () => db().users.map(mitDaten),
    async create({ email, name, role }) {
      const d = db();
      const u = { id: nextId(d, 'u'), username: null, email, name, role, is_active: true,
        password_hash: null, password_changed_at: null, created_at: new Date().toISOString() };
      d.users.push(u);
      saveDB(d);
      return mitDaten(u);
    },
    async update(id, f) {
      const d = db();
      const u = d.users.find(x => x.id === id);
      if (!u) return null;
      Object.assign(u, f);
      saveDB(d);
      return mitDaten(u);
    },
    async setPassword(id, hash, now) {
      const d = db();
      const u = d.users.find(x => x.id === id);
      if (u) { u.password_hash = hash; u.password_changed_at = iso(now); saveDB(d); }
    },
    async replaceToken(userId, purpose, tokenHash, expiresAt) {
      const d = db();
      d.user_tokens = d.user_tokens.filter(t => !(t.user_id === userId && t.purpose === purpose && !t.used_at));
      d.user_tokens.push({ id: nextId(d, 'tok'), user_id: userId, token_hash: tokenHash, purpose,
        expires_at: iso(expiresAt), used_at: null, created_at: new Date().toISOString() });
      saveDB(d);
    },
    async findToken(tokenHash) {
      const d = db();
      const t = d.user_tokens.find(x => x.token_hash === tokenHash);
      const u = t && d.users.find(x => x.id === t.user_id);
      return t && u && { id: t.id, purpose: t.purpose, expires_at: datum(t.expires_at), used_at: datum(t.used_at),
        user: { id: u.id, email: u.email, name: u.name, is_active: u.is_active !== false } };
    },
    async redeemToken(tokenId, userId, passwordHash, now) {
      const d = db();
      const t = d.user_tokens.find(x => x.id === tokenId);
      if (!t || t.used_at || new Date(t.expires_at) <= now) return false;
      for (const x of d.user_tokens) if (x.user_id === userId && !x.used_at) x.used_at = iso(now);
      const u = d.users.find(x => x.id === userId);
      u.password_hash = passwordHash;
      u.password_changed_at = iso(now);
      saveDB(d);
      return true;
    },
    throttleGet: async key => db().login_throttle[key] || null,
    async throttleSet(key, e) { const d = db(); d.login_throttle[key] = { ...e, updatedAt: Date.now() }; saveDB(d); },
    async throttleRemove(key) { const d = db(); delete d.login_throttle[key]; saveDB(d); },
    async throttleCleanup(aelterAls) {
      const d = db();
      for (const [k, e] of Object.entries(d.login_throttle)) if (e.updatedAt < aelterAls.getTime()) delete d.login_throttle[k];
      saveDB(d);
    },
  };
}

// ─── Einbau ───────────────────────────────────────────────────────────────────

module.exports = function nutzersteuerung({ app, pool, usePostgres, loadDB, saveDB, nextId }) {
  let _store;
  const store = () => (_store ||= usePostgres() ? pgStore(pool) : jsonStore({ loadDB, saveDB, nextId }));

  // Bremse: Zähler in der DB, damit mehrere Instanzen denselben Stand sehen.
  let zuletztAufgeraeumt = 0;
  async function isLocked(key) {
    const e = await store().throttleGet(normEmail(key));
    return !!e && e.lockedUntil > Date.now();
  }
  async function registerFailure(key, maxVersuche = MAX_VERSUCHE) {
    const k = normEmail(key), now = Date.now();
    const e = (await store().throttleGet(k)) || { failures: 0, lockedUntil: 0 };
    if (e.lockedUntil !== 0 && e.lockedUntil <= now) { e.failures = 0; e.lockedUntil = 0; } // abgelaufene Sperre zählt von vorn
    e.failures += 1;
    if (e.failures >= maxVersuche) e.lockedUntil = now + SPERRE_MS;
    await store().throttleSet(k, e);
    if (now - zuletztAufgeraeumt >= AUFRAEUM_ABSTAND_MS) {
      zuletztAufgeraeumt = now;
      store().throttleCleanup(new Date(now - AUFBEWAHRUNG_MS)).catch(err => console.error('Bremse aufräumen fehlgeschlagen:', err));
    }
  }
  const registerSuccess = key => store().throttleRemove(normEmail(key));

  // Was die Oberfläche sieht. Der Passwort-Hash verlässt den Server nie.
  const ohneHash = u => ({
    id: u.id, username: u.username, email: u.email, name: u.name, role: u.role,
    is_active: u.is_active, created_at: u.created_at, zugang_eingerichtet: !!u.password_hash,
  });
  // Name für Anzeige und „gebucht von“: bei Altkonten bleibt es der Benutzername.
  const kennung = u => u.username || u.email;

  async function sendeZugangsLink(user, purpose, baseUrl) {
    if (!mailConfigured()) throw new ApiError(503, 'Der Mailversand ist nicht eingerichtet (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    if (!user.email) throw new ApiError(400, 'Für diesen Zugang ist keine E-Mail-Adresse hinterlegt.');
    const t = neuesToken();
    await store().replaceToken(user.id, purpose, t.tokenHash, t.expiresAt);
    const link = `${baseUrl}/einrichten/${t.token}`;
    const mail = purpose === 'INVITE'
      ? einladungsMail({ name: user.name, link, gueltigBis: t.expiresAt })
      : passwortResetMail({ name: user.name, link, gueltigBis: t.expiresAt });
    await sendMail({ to: user.email, subject: mail.subject, text: mail.text });
    return { expiresAt: t.expiresAt };
  }
  const zugangsMailFehler = e => (e instanceof ApiError ? e.message : describeMailError(e));

  // null bei unbekannt, verbraucht, abgelaufen oder deaktiviert — nach außen gleich.
  async function findeGueltigesToken(token) {
    if (typeof token !== 'string' || !TOKEN_MUSTER.test(token)) return null;
    const row = await store().findToken(hashToken(token));
    if (!row || row.used_at || row.expires_at.getTime() <= Date.now() || !row.user.is_active) return null;
    return row;
  }

  const fehler = (res, e) => {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Interner Serverfehler' });
  };
  const neuesPasswortFehler = p => (typeof p !== 'string' || p.length < PASSWORT_MINDESTLAENGE || p.length > PASSWORT_MAXLAENGE
    ? `Das Passwort braucht mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.` : null);
  // Nur die genannten Felder sind erlaubt — ein mitgeschicktes `password` ist ein Fehler, kein stilles Nichts.
  const fremdeFelder = (body, erlaubt) => Object.keys(body || {}).filter(k => !erlaubt.includes(k));

  // ─── Middleware ───────────────────────────────────────────────────────────

  // CSRF-Schranke zusätzlich zu SameSite=Lax.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: 'Seitenfremde Anfrage abgewiesen' });
    }
    next();
  });

  // Prüft GEGEN DIE DATENBANK: Rolle und Aktiv-Status kommen frisch aus der DB,
  // eine Sitzung von vor der letzten Passwortänderung gilt nicht mehr.
  async function requireAuth(req, res, next) {
    try {
      const id = req.session && req.session.userId;
      const user = id ? await store().findById(id) : null;
      const veraltet = user && user.password_changed_at && (req.session.loginAt || 0) < user.password_changed_at.getTime();
      if (!user || !user.is_active || veraltet) {
        if (req.session) req.session.destroy(() => {});
        return res.status(401).json({ error: 'Nicht angemeldet' });
      }
      req.user = user;
      req.session.userRole = user.role;
      req.session.username = kennung(user);
      next();
    } catch (e) { fehler(res, e); }
  }

  function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') return next();
    res.status(403).json({ error: 'Keine Berechtigung' });
  }

  // ─── Öffentliche Routen ───────────────────────────────────────────────────

  app.post('/api/auth/login', async (req, res) => {
    const key = normEmail(req.body && (req.body.email ?? req.body.username));
    const password = req.body && req.body.password;
    if (!key || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
    }
    const abgelehnt = () => res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
    try {
      // Gesperrt ist gesperrt — auch mit richtigem Passwort.
      if (await isLocked(key)) return abgelehnt();
      // Sofort zählen, vor dem langsamen bcrypt — sonst kommen parallele Anfragen an der Sperre vorbei.
      await registerFailure(key);
      const user = await store().findByLogin(key);
      if (!user || !user.is_active || !user.password_hash) {
        await bcrypt.compare(password, DUMMY_HASH);
        return abgelehnt();
      }
      if (!(await bcrypt.compare(password, user.password_hash))) return abgelehnt();
      await registerSuccess(key);
      req.session.regenerate(err => {
        if (err) return fehler(res, err);
        req.session.userId = user.id;
        req.session.loginAt = Date.now();
        req.session.userRole = user.role;
        req.session.username = kennung(user);
        res.json({ id: user.id, username: kennung(user), role: user.role });
      });
    } catch (e) { fehler(res, e); }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  // Antwortet IMMER gleich — verrät nicht, ob es das Konto gibt.
  app.post('/api/passwort-vergessen', async (req, res) => {
    const email = normEmail(req.body && req.body.email);
    if (!EMAIL_MUSTER.test(email)) return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
    const neutral = () => res.json({ ok: true });
    try {
      let basis;
      try { basis = appBaseUrl(); } catch (fehlt) {
        console.error('Passwort vergessen: Links nicht baubar:', fehlt.message);
        return neutral();
      }
      // Eigene Schlüssel, damit diese Bremsen nicht die Login-Sperre auslösen. req.ip nur für die Bremse, nie für Rechte.
      const proAdresse = `pwvergessen:${email}`, proAbsender = `pwvergessen-ip:${req.ip || 'unbekannt'}`;
      if ((await isLocked(proAdresse)) || (await isLocked(proAbsender))) return neutral();
      await registerFailure(proAdresse);
      await registerFailure(proAbsender, 20);

      const user = await store().findByLogin(email);
      if (!user || !user.is_active || !user.email) return neutral();
      neutral();
      // Versand NACH der Antwort — sonst verrät die Dauer das Konto. Ohne Passwort kommt die Einladung erneut.
      sendeZugangsLink(user, user.password_hash ? 'PASSWORD_RESET' : 'INVITE', basis)
        .catch(e => console.error('Passwort-vergessen-Mail fehlgeschlagen:', e.message));
    } catch (e) { fehler(res, e); }
  });

  app.get('/api/einrichten/:token', async (req, res) => {
    try {
      const g = await findeGueltigesToken(req.params.token);
      if (!g) return res.status(410).json({ error: 'Der Link ist ungültig oder abgelaufen.' });
      res.json({ purpose: g.purpose, email: g.user.email, name: g.user.name });
    } catch (e) { fehler(res, e); }
  });

  app.post('/api/einrichten/:token', async (req, res) => {
    try {
      const password = req.body && req.body.password;
      const f = neuesPasswortFehler(password);
      if (f) return res.status(400).json({ error: f });
      const g = await findeGueltigesToken(req.params.token);
      if (!g) return res.status(410).json({ error: 'Der Link ist ungültig oder abgelaufen.' });
      const ok = await store().redeemToken(g.id, g.user.id, await bcrypt.hash(password, 12), new Date());
      if (!ok) return res.status(410).json({ error: 'Der Link ist nicht mehr gültig.' });
      res.json({ ok: true, email: g.user.email });
    } catch (e) { fehler(res, e); }
  });

  // Ab hier nur mit Anmeldung.
  app.use('/api', requireAuth);

  app.get('/api/auth/me', (req, res) => {
    const u = req.user;
    res.json({ id: u.id, username: kennung(u), name: u.name, email: u.email, role: u.role });
  });

  app.patch('/api/profile/password', async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      const user = req.user;
      const bremse = user.email || user.username;
      if (await isLocked(bremse)) return res.status(429).json({ error: 'Zu viele Fehlversuche – bitte 15 Minuten warten.' });
      if (!user.password_hash) return res.status(409).json({ error: 'Für dieses Konto ist noch kein Passwort gesetzt.' });
      const f = neuesPasswortFehler(newPassword);
      if (f) return res.status(400).json({ error: f });
      if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        await registerFailure(bremse);
        return res.status(400).json({ error: 'Das aktuelle Passwort ist falsch.' });
      }
      // Meldet alle bestehenden Sitzungen ab — auch diese.
      await store().setPassword(user.id, await bcrypt.hash(newPassword, 12), new Date());
      await registerSuccess(bremse);
      req.session.destroy(() => res.json({ ok: true }));
    } catch (e) { fehler(res, e); }
  });

  // ─── Benutzerverwaltung (nur Admin) ───────────────────────────────────────

  app.get('/api/users', requireAdmin, async (req, res) => {
    try {
      res.json({ nutzer: (await store().list()).map(ohneHash), mailSandboxAn: mailSandboxTo() });
    } catch (e) { fehler(res, e); }
  });

  // BEWUSST ohne Passwort: der Nutzer bekommt eine Einladung.
  app.post('/api/users', requireAdmin, async (req, res) => {
    try {
      const fremd = fremdeFelder(req.body, ['email', 'name', 'role']);
      if (fremd.length) return res.status(400).json({ error: `Unbekanntes Feld: ${fremd.join(', ')}` });
      const email = normEmail(req.body.email);
      const name = String(req.body.name || '').trim().slice(0, 100) || null;
      const role = req.body.role || 'user';
      if (!EMAIL_MUSTER.test(email) || email.length > 254) return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
      if (!ROLLEN.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
      if (await store().emailVergeben(email)) return res.status(409).json({ error: 'E-Mail bereits vergeben' });

      const user = await store().create({ email, name, role });
      // Scheitert die Mail, bleibt der Nutzer angelegt — die Einladung lässt sich neu senden.
      let einladung = { gesendet: false };
      try {
        await sendeZugangsLink(user, 'INVITE', appBaseUrl());
        einladung = { gesendet: true };
      } catch (e) {
        console.error('Einladung nach Anlage konnte nicht gesendet werden:', e.message);
        einladung = { gesendet: false, hinweis: zugangsMailFehler(e) };
      }
      res.status(201).json({ ...ohneHash(user), einladung });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'E-Mail bereits vergeben' });
      fehler(res, e);
    }
  });

  app.put('/api/users/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const fremd = fremdeFelder(req.body, ['name', 'email', 'role', 'is_active']);
      if (fremd.length) return res.status(400).json({ error: `Unbekanntes Feld: ${fremd.join(', ')}` });
      const { role, is_active } = req.body;
      if (role !== undefined && !ROLLEN.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
      if (is_active !== undefined && typeof is_active !== 'boolean') return res.status(400).json({ error: 'Ungültiger Status' });
      if (id === req.user.id && (role === 'user' || is_active === false)) {
        return res.status(400).json({ error: 'Du kannst dich nicht selbst herabstufen oder deaktivieren.' });
      }
      const felder = {};
      if (role !== undefined) felder.role = role;
      if (is_active !== undefined) felder.is_active = is_active;
      if (req.body.name !== undefined) felder.name = String(req.body.name || '').trim().slice(0, 100) || null;
      // Die E-Mail darf gesetzt werden — Altkonten mit Benutzername brauchen eine für Einladung und Passwort-Link.
      if (req.body.email !== undefined) {
        const email = normEmail(req.body.email);
        if (!EMAIL_MUSTER.test(email) || email.length > 254) return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
        if (await store().emailVergeben(email, id)) return res.status(409).json({ error: 'E-Mail bereits vergeben' });
        felder.email = email;
      }
      const user = await store().update(id, felder);
      if (!user) return res.status(404).json({ error: 'Nicht gefunden' });
      res.json(ohneHash(user));
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'E-Mail bereits vergeben' });
      fehler(res, e);
    }
  });

  // Einladung (erneut) — nur ohne Passwort. Passwort-Link — nur mit Passwort;
  // das alte gilt weiter, bis der Link eingelöst ist.
  for (const [pfad, purpose] of [['einladung', 'INVITE'], ['passwort-link', 'PASSWORD_RESET']]) {
    app.post(`/api/users/:id/${pfad}`, requireAdmin, async (req, res) => {
      try {
        const user = await store().findById(parseInt(req.params.id));
        if (!user) return res.status(404).json({ error: 'Nicht gefunden' });
        if (purpose === 'INVITE' && user.password_hash) {
          return res.status(400).json({ error: 'Der Zugang ist schon eingerichtet – bitte „Passwort-Link“ verwenden.' });
        }
        if (purpose === 'PASSWORD_RESET' && !user.password_hash) {
          return res.status(400).json({ error: 'Der Zugang ist noch nicht eingerichtet – bitte „Einladung senden“ verwenden.' });
        }
        if (!user.is_active) return res.status(400).json({ error: 'Der Zugang ist deaktiviert.' });
        try {
          const { expiresAt } = await sendeZugangsLink(user, purpose, appBaseUrl());
          res.json({ ok: true, gueltigBis: expiresAt });
        } catch (e) {
          console.error(`${pfad} konnte nicht gesendet werden:`, e.message);
          res.status(e instanceof ApiError ? e.status : 502).json({ error: zugangsMailFehler(e) });
        }
      } catch (e) { fehler(res, e); }
    });
  }

  // Der allererste Admin braucht ein Passwort aus der Umgebung. Nur ANLEGEN,
  // nie überschreiben — sonst setzte jeder Neustart ein geändertes Passwort zurück.
  async function seedAdmin() {
    const kennwort = process.env.ADMIN_PASS;
    const login = normEmail(process.env.ADMIN_USER || 'admin');
    if (!kennwort) return;
    if (await store().findByLogin(login)) return;
    const hash = await bcrypt.hash(kennwort, 12);
    const istMail = login.includes('@');
    if (usePostgres()) {
      // findByLogin sucht den Benutzernamen nur bei Konten ohne E-Mail. Hat der
      // alte Admin inzwischen eine E-Mail, ist sein Name trotzdem vergeben —
      // dann nichts anlegen statt beim Start am Unique-Index abzustuerzen.
      const { rowCount } = await pool.query('INSERT INTO users (username, email, name, password_hash, role) VALUES ($1, $2, $3, $4, \'admin\') ON CONFLICT (username) DO NOTHING',
        [istMail ? null : login, istMail ? login : null, 'Admin', hash]);
      if (!rowCount) return;
    } else {
      const d = loadDB();
      if (!istMail && d.users.some(u => u.username && u.username.toLowerCase() === login)) return;
      d.users.push({ id: nextId(d, 'u'), username: istMail ? null : login, email: istMail ? login : null, name: 'Admin',
        password_hash: hash, role: 'admin', is_active: true, password_changed_at: null, created_at: new Date().toISOString() });
      saveDB(d);
    }
    console.log(`✅ Admin-Zugang „${login}“ angelegt`);
  }

  return {
    requireAuth,
    requireAdmin,
    // Fuer andere Mails der Anwendung (z. B. die Eintritts-Erinnerung in server.js).
    mail: { sendMail, mailConfigured, describeMailError, appBaseUrl },
    async init() { await store().init(); await seedAdmin(); },
  };
};
