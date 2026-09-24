const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── SESSION ──────────────────────────────────────────────────────────────────

const sessionStore = (() => {
  if (process.env.DATABASE_URL) {
    const pgSession = require('connect-pg-simple')(session);
    return new pgSession({ conString: process.env.DATABASE_URL, tableName: 'sessions', createTableIfMissing: true });
  }
  return undefined; // MemoryStore (lokal ok)
})();

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 }, // 8h
}));

app.use(express.static(path.join(__dirname, 'public')));
// Gemeinsame Designgrundlagen (design/tokens.css) — bewusst ausserhalb von
// public/, damit sie eine Quelle bleiben und nicht ins Projekt kopiert wird.
app.use('/design', express.static(path.join(__dirname, 'design')));

// ─── DATENBANK ────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Lokal ohne DATABASE_URL: SQLite-Fallback über JSON-Datei
const fs = require('fs');
const DB_FILE = path.join(__dirname, 'inventar.json');

function usePostgres() {
  return !!process.env.DATABASE_URL;
}

// ?archiviert=1 zeigt das Archiv statt des laufenden Bestands.
function zeigeArchiv(req) {
  return req.query.archiviert === '1';
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'Nicht angemeldet' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userRole === 'admin') return next();
  res.status(403).json({ error: 'Keine Berechtigung' });
}

// ─── AUTH ROUTEN ──────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  try {
    let user;
    if (usePostgres()) {
      const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
      user = rows[0];
    } else {
      const db = loadDB();
      user = (db.users || []).find(u => u.username === username);
    }
    if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.userRole = user.role;
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Nicht angemeldet' });
  res.json({ id: req.session.userId, username: req.session.username, role: req.session.userRole });
});

// Alle folgenden /api/* Routen erfordern Authentifizierung
app.use('/api', requireAuth);

// ─── DATENBANK INITIALISIEREN ─────────────────────────────────────────────────

async function initDB() {
  if (usePostgres()) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT,
        email TEXT,
        start_date TEXT,
        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT,
        serial_number TEXT UNIQUE,
        purchase_date TEXT,
        purchase_price NUMERIC,
        status TEXT DEFAULT 'verfügbar',
        notes TEXT,
        storage_note TEXT,
        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        device_id INTEGER REFERENCES devices(id),
        employee_id INTEGER REFERENCES employees(id),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        returned_at TIMESTAMPTZ,
        notes TEXT
      );
      -- Arbeitskleidung: ein Artikel je Groesse und Farbe. Den Bestand gibt es
      -- nicht als Spalte, er ergibt sich aus den Buchungen.
      CREATE TABLE IF NOT EXISTS apparel_items (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        size TEXT NOT NULL,
        color TEXT,
        supplier TEXT,
        article_number TEXT,
        min_stock INTEGER,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS apparel_movements (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES apparel_items(id),
        kind TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        employee_id INTEGER REFERENCES employees(id),
        note TEXT,
        booked_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Spalten nachrüsten falls DB schon existierte
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name TEXT');
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_name TEXT');
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date TEXT');
    await pool.query(`UPDATE employees SET first_name = SPLIT_PART(name, ' ', 1), last_name = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1)), '') WHERE first_name IS NULL AND name IS NOT NULL`);
    await pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS inventory_number TEXT UNIQUE');
    // Aufbewahrungsort eines zurueckgenommenen Geraets, z. B. "Safe Nadine".
    await pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_note TEXT');
    // Archivieren statt Loeschen (design/DESIGN.md). Ohne DEFAULT, damit
    // bestehende Zeilen NULL bleiben und weiterhin in den Listen erscheinen.
    await pool.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE locations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ');
    // Standorte einmalig seeden falls noch keine vorhanden
    const { rows: locCount } = await pool.query('SELECT COUNT(*)::int AS c FROM locations');
    if (locCount[0].c === 0) {
      const locs = [
        ['Wriezen',                'Mahlerstraße 23a, 16269 Wriezen',               'Tel: +49 33456 1516 0'],
        ['Meßkirch',               'Unterm Ablaß 4, 88605 Meßkirch',                'Tel: +49 7575 927829 0'],
        ['Straufhain / Eishausen', 'Straße in der Neustadt 107, 98646 Straufhain',  'Tel: +49 3685 40914 0'],
        ['Gera',                   'Naulitzer Straße 35b, 07546 Gera',              'Tel: +49 365 7302366'],
        ['Laußnitz',               'Dresdner Straße 30, 01936 Laußnitz',            'Tel: +49 351 889613 0'],
        ['Pocking',                'Gewerbering 4a, 94060 Pocking',                 'Tel: +49 8531 97834 0'],
        ['Perleberg',              'Hamburger Chaussee 5, 19348 Perleberg',         'Tel: +49 3876 3000 290'],
        ['Egeln',                  'Feld am Bruche 18, 39435 Egeln',                'Tel: +49 39268 9869 0'],
      ];
      for (const [name, address, notes] of locs) {
        await pool.query('INSERT INTO locations (name, address, notes) VALUES ($1,$2,$3)', [name, address, notes]);
      }
      console.log('✅ 8 Standorte importiert');
    }
    console.log('✅ PostgreSQL verbunden');
  } else {
    console.log('ℹ️  Kein DATABASE_URL – nutze lokale JSON-Datei');
  }
  await seedAdminUser();
}

async function seedAdminUser() {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS;
  if (!adminPass) return;

  const hash = await bcrypt.hash(adminPass, 12);
  if (usePostgres()) {
    await pool.query(`
      INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
    `, [adminUser, hash]);
  } else {
    const db = loadDB();
    if (!db.users) db.users = [];
    const idx = db.users.findIndex(u => u.username === adminUser);
    if (idx >= 0) {
      db.users[idx].password_hash = hash;
      db.users[idx].role = 'admin';
    } else {
      db.users.push({ id: nextId(db, 'u'), username: adminUser, password_hash: hash, role: 'admin', created_at: now() });
    }
    saveDB(db);
    console.log(`✅ Admin-Nutzer "${adminUser}" bereit`);
  }
}

// ─── LOKALE DB (JSON-Fallback) ────────────────────────────────────────────────

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = { users: [], locations: [], employees: [], devices: [], assignments: [], _seq: { u: 0, l: 0, e: 0, d: 0, a: 0 } };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!db.users) db.users = [];
  if (!db.locations) db.locations = [];
  if (!db.apparel_items) db.apparel_items = [];
  if (!db.apparel_movements) db.apparel_movements = [];
  if (!db._seq.u) db._seq.u = 0;
  if (!db._seq.l) db._seq.l = 0;
  return db;
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function nextId(db, key) {
  db._seq[key] = (db._seq[key] || 0) + 1;
  return db._seq[key];
}

function now() { return new Date().toISOString(); }

// ─── MITARBEITER ──────────────────────────────────────────────────────────────

app.get('/api/employees', async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`
        SELECT e.*, l.name AS location_name, COUNT(a.id)::int AS device_count
        FROM employees e
        LEFT JOIN locations l ON l.id = e.location_id
        LEFT JOIN assignments a ON a.employee_id = e.id AND a.returned_at IS NULL
        WHERE e.archived_at IS ${zeigeArchiv(req) ? 'NOT NULL' : 'NULL'}
        GROUP BY e.id, l.name ORDER BY e.name
      `);
      return res.json(rows);
    }
    const db = loadDB();
    res.json(db.employees.filter(e => zeigeArchiv(req) ? e.archived_at : !e.archived_at).map(e => ({
      ...e,
      location_name: db.locations.find(l => l.id === e.location_id)?.name || null,
      device_count: db.assignments.filter(a => a.employee_id === e.id && !a.returned_at).length
    })).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Detailansicht eines Mitarbeiters: laufende Geräte plus Rückgabeverlauf.
app.get('/api/employees/:id/details', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const emp = (await pool.query(`
        SELECT e.*, l.name AS location_name
        FROM employees e LEFT JOIN locations l ON l.id = e.location_id
        WHERE e.id = $1
      `, [id])).rows[0];
      if (!emp) return res.status(404).json({ error: 'Nicht gefunden' });
      const devices = (await pool.query(`
        SELECT d.id, d.name, d.type, d.serial_number, d.inventory_number, d.status,
          a.id AS assignment_id, a.assigned_at
        FROM assignments a JOIN devices d ON d.id = a.device_id
        WHERE a.employee_id = $1 AND a.returned_at IS NULL
        ORDER BY d.name
      `, [id])).rows;
      const history = (await pool.query(`
        SELECT d.name, d.serial_number, d.inventory_number, a.assigned_at, a.returned_at
        FROM assignments a JOIN devices d ON d.id = a.device_id
        WHERE a.employee_id = $1 AND a.returned_at IS NOT NULL
        ORDER BY a.returned_at DESC
      `, [id])).rows;
      return res.json({ ...emp, devices, history });
    }
    const db = loadDB();
    const emp = db.employees.find(e => e.id === id);
    if (!emp) return res.status(404).json({ error: 'Nicht gefunden' });
    const geraet = (a) => db.devices.find(d => d.id === a.device_id) || {};
    const devices = db.assignments.filter(a => a.employee_id === id && !a.returned_at).map(a => {
      const d = geraet(a);
      return { id: d.id, name: d.name, type: d.type, serial_number: d.serial_number, inventory_number: d.inventory_number, status: d.status, assignment_id: a.id, assigned_at: a.assigned_at };
    });
    const history = db.assignments.filter(a => a.employee_id === id && a.returned_at)
      .sort((x, y) => new Date(y.returned_at) - new Date(x.returned_at))
      .map(a => {
        const d = geraet(a);
        return { name: d.name, serial_number: d.serial_number, inventory_number: d.inventory_number, assigned_at: a.assigned_at, returned_at: a.returned_at };
      });
    res.json({ ...emp, location_name: db.locations.find(l => l.id === emp.location_id)?.name || null, devices, history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', requireAdmin, async (req, res) => {
  const { first_name, last_name, department, email, start_date, location_id } = req.body;
  if (!first_name) return res.status(400).json({ error: 'Vorname erforderlich' });
  const fullName = [first_name, last_name].filter(Boolean).join(' ');
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'INSERT INTO employees (name, first_name, last_name, department, email, start_date, location_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [fullName, first_name, last_name || null, department || null, email || null, start_date || null, location_id || null]
      );
      const loc = location_id ? (await pool.query('SELECT name FROM locations WHERE id=$1', [location_id])).rows[0] : null;
      return res.status(201).json({ ...rows[0], device_count: 0, location_name: loc?.name || null });
    }
    const db = loadDB();
    const employee = { id: nextId(db, 'e'), name: fullName, first_name, last_name: last_name || null, department: department || null, email: email || null, start_date: start_date || null, location_id: location_id || null, created_at: now() };
    db.employees.push(employee);
    saveDB(db);
    res.status(201).json({ ...employee, device_count: 0, location_name: db.locations.find(l => l.id === location_id)?.name || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/employees/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { first_name, last_name, department, email, start_date, location_id } = req.body;
  if (!first_name) return res.status(400).json({ error: 'Vorname erforderlich' });
  const fullName = [first_name, last_name].filter(Boolean).join(' ');
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'UPDATE employees SET name=$1, first_name=$2, last_name=$3, department=$4, email=$5, start_date=$6, location_id=$7 WHERE id=$8 RETURNING *',
        [fullName, first_name, last_name || null, department || null, email || null, start_date || null, location_id || null, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
      const cnt = await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE employee_id=$1 AND returned_at IS NULL', [id]);
      const loc = rows[0].location_id ? (await pool.query('SELECT name FROM locations WHERE id=$1', [rows[0].location_id])).rows[0] : null;
      return res.json({ ...rows[0], device_count: cnt.rows[0].c, location_name: loc?.name || null });
    }
    const db = loadDB();
    const idx = db.employees.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    db.employees[idx] = { ...db.employees[idx], name: fullName, first_name, last_name: last_name || null, department: department || null, email: email || null, start_date: start_date || null, location_id: location_id || null };
    saveDB(db);
    res.json({ ...db.employees[idx], device_count: db.assignments.filter(a => a.employee_id === id && !a.returned_at).length, location_name: db.locations.find(l => l.id === location_id)?.name || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/employees/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE employee_id=$1 AND returned_at IS NULL', [id]);
      if (rows[0].c > 0) return res.status(400).json({ error: 'Mitarbeiter hat noch zugewiesene Geräte' });
      await pool.query('UPDATE employees SET archived_at = NOW() WHERE id=$1', [id]);
      return res.json({ success: true });
    }
    const db = loadDB();
    if (db.assignments.some(a => a.employee_id === id && !a.returned_at))
      return res.status(400).json({ error: 'Mitarbeiter hat noch zugewiesene Geräte' });
    const emp = db.employees.find(e => e.id === id);
    if (emp) emp.archived_at = now();
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GERÄTE ───────────────────────────────────────────────────────────────────

async function generateInventoryNumber() {
  const year = new Date().getFullYear();
  if (usePostgres()) {
    const { rows } = await pool.query(
      `SELECT inventory_number FROM devices WHERE inventory_number LIKE $1 ORDER BY inventory_number DESC LIMIT 1`,
      [`INV-${year}-%`]
    );
    const last = rows[0]?.inventory_number;
    const seq = last ? parseInt(last.split('-')[2]) + 1 : 1;
    return `INV-${year}-${String(seq).padStart(4, '0')}`;
  }
  const db = loadDB();
  const prefix = `INV-${year}-`;
  const nums = db.devices
    .map(d => d.inventory_number)
    .filter(n => n && n.startsWith(prefix))
    .map(n => parseInt(n.split('-')[2]))
    .filter(n => !isNaN(n));
  const seq = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

app.get('/api/devices', async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`
        SELECT d.*, l.name AS location_name, e.name AS assigned_to_name, e.id AS assigned_to_id,
          a.assigned_at, a.id AS assignment_id,
          frueher.name AS last_employee_name, frueher.returned_at AS last_returned_at
        FROM devices d
        LEFT JOIN locations l ON l.id = d.location_id
        LEFT JOIN assignments a ON a.device_id = d.id AND a.returned_at IS NULL
        LEFT JOIN employees e ON e.id = a.employee_id
        LEFT JOIN LATERAL (
          SELECT e2.name, a2.returned_at
          FROM assignments a2 JOIN employees e2 ON e2.id = a2.employee_id
          WHERE a2.device_id = d.id AND a2.returned_at IS NOT NULL
          ORDER BY a2.returned_at DESC LIMIT 1
        ) frueher ON TRUE
        WHERE d.archived_at IS ${zeigeArchiv(req) ? 'NOT NULL' : 'NULL'}
        ORDER BY d.name
      `);
      return res.json(rows);
    }
    const db = loadDB();
    res.json(db.devices.filter(d => zeigeArchiv(req) ? d.archived_at : !d.archived_at).map(d => {
      const a = db.assignments.find(x => x.device_id === d.id && !x.returned_at);
      const e = a ? db.employees.find(x => x.id === a.employee_id) : null;
      const frueher = db.assignments
        .filter(x => x.device_id === d.id && x.returned_at)
        .sort((x, y) => new Date(y.returned_at) - new Date(x.returned_at))[0];
      const frueherEmp = frueher ? db.employees.find(x => x.id === frueher.employee_id) : null;
      return { ...d, location_name: db.locations.find(l => l.id === d.location_id)?.name || null, assigned_to_name: e?.name || null, assigned_to_id: e?.id || null, assigned_at: a?.assigned_at || null, assignment_id: a?.id || null, last_employee_name: frueherEmp?.name || null, last_returned_at: frueher?.returned_at || null };
    }).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Detailansicht eines Geräts: die vollständige Besitzhistorie, neueste zuerst.
// Bewusst ohne Filter auf archived_at — sonst wäre die Historie eines
// archivierten Geräts leer, und gerade dort will man nachsehen können.
app.get('/api/devices/:id/details', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const dev = (await pool.query(`
        SELECT d.*, l.name AS location_name
        FROM devices d LEFT JOIN locations l ON l.id = d.location_id
        WHERE d.id = $1
      `, [id])).rows[0];
      if (!dev) return res.status(404).json({ error: 'Nicht gefunden' });
      const history = (await pool.query(`
        SELECT a.id, a.assigned_at, a.returned_at, a.notes,
          e.id AS employee_id, e.name AS employee_name, e.department
        FROM assignments a JOIN employees e ON e.id = a.employee_id
        WHERE a.device_id = $1
        ORDER BY a.assigned_at DESC, a.id DESC
      `, [id])).rows;
      return res.json({ ...dev, history });
    }
    const db = loadDB();
    const dev = db.devices.find(d => d.id === id);
    if (!dev) return res.status(404).json({ error: 'Nicht gefunden' });
    const history = db.assignments.filter(a => a.device_id === id)
      .sort((x, y) => new Date(y.assigned_at) - new Date(x.assigned_at) || y.id - x.id)
      .map(a => {
        const e = db.employees.find(x => x.id === a.employee_id) || {};
        return { id: a.id, assigned_at: a.assigned_at, returned_at: a.returned_at, notes: a.notes, employee_id: e.id, employee_name: e.name, department: e.department };
      });
    res.json({ ...dev, location_name: db.locations.find(l => l.id === dev.location_id)?.name || null, history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/devices', requireAdmin, async (req, res) => {
  const { name, type, serial_number, purchase_date, purchase_price, notes, location_id, inventory_number } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  try {
    const invNr = inventory_number?.trim() || await generateInventoryNumber();
    if (usePostgres()) {
      const { rows } = await pool.query(
        'INSERT INTO devices (name, type, serial_number, purchase_date, purchase_price, notes, location_id, inventory_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [name, type || null, serial_number || null, purchase_date || null, purchase_price || null, notes || null, location_id || null, invNr]
      );
      const loc = location_id ? (await pool.query('SELECT name FROM locations WHERE id=$1', [location_id])).rows[0] : null;
      return res.status(201).json({ ...rows[0], location_name: loc?.name || null, assigned_to_name: null, assigned_to_id: null, assigned_at: null, assignment_id: null });
    }
    const db = loadDB();
    if (serial_number && db.devices.some(d => d.serial_number === serial_number))
      return res.status(400).json({ error: 'Seriennummer bereits vorhanden' });
    if (db.devices.some(d => d.inventory_number === invNr))
      return res.status(400).json({ error: 'Inventarnummer bereits vorhanden' });
    const device = { id: nextId(db, 'd'), name, type: type || null, serial_number: serial_number || null, purchase_date: purchase_date || null, purchase_price: purchase_price ? parseFloat(purchase_price) : null, notes: notes || null, location_id: location_id || null, inventory_number: invNr, status: 'verfügbar', created_at: now() };
    db.devices.push(device);
    saveDB(db);
    res.status(201).json({ ...device, location_name: db.locations.find(l => l.id === location_id)?.name || null, assigned_to_name: null, assigned_to_id: null, assigned_at: null, assignment_id: null });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Seriennummer oder Inventarnummer bereits vorhanden' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/devices/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, type, serial_number, purchase_date, purchase_price, notes, status, location_id, inventory_number, storage_note } = req.body;
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'UPDATE devices SET name=$1, type=$2, serial_number=$3, purchase_date=$4, purchase_price=$5, notes=$6, status=$7, location_id=$8, inventory_number=$9, storage_note=$10 WHERE id=$11 RETURNING *',
        [name, type || null, serial_number || null, purchase_date || null, purchase_price || null, notes || null, status || 'verfügbar', location_id || null, inventory_number || null, storage_note || null, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
      const a = (await pool.query('SELECT a.*, e.name AS employee_name FROM assignments a JOIN employees e ON e.id=a.employee_id WHERE a.device_id=$1 AND a.returned_at IS NULL', [id])).rows[0];
      const loc = rows[0].location_id ? (await pool.query('SELECT name FROM locations WHERE id=$1', [rows[0].location_id])).rows[0] : null;
      return res.json({ ...rows[0], location_name: loc?.name || null, assigned_to_name: a?.employee_name || null, assigned_to_id: a?.employee_id || null, assigned_at: a?.assigned_at || null, assignment_id: a?.id || null });
    }
    const db = loadDB();
    const idx = db.devices.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    if (serial_number && db.devices.some(d => d.serial_number === serial_number && d.id !== id))
      return res.status(400).json({ error: 'Seriennummer bereits vorhanden' });
    if (inventory_number && db.devices.some(d => d.inventory_number === inventory_number && d.id !== id))
      return res.status(400).json({ error: 'Inventarnummer bereits vorhanden' });
    db.devices[idx] = { ...db.devices[idx], name, type: type || null, serial_number: serial_number || null, purchase_date: purchase_date || null, purchase_price: purchase_price ? parseFloat(purchase_price) : null, notes: notes || null, status: status || 'verfügbar', location_id: location_id || null, inventory_number: inventory_number || null, storage_note: storage_note || null };
    saveDB(db);
    const a = db.assignments.find(x => x.device_id === id && !x.returned_at);
    const e = a ? db.employees.find(x => x.id === a.employee_id) : null;
    res.json({ ...db.devices[idx], location_name: db.locations.find(l => l.id === location_id)?.name || null, assigned_to_name: e?.name || null, assigned_to_id: e?.id || null, assigned_at: a?.assigned_at || null, assignment_id: a?.id || null });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Seriennummer oder Inventarnummer bereits vorhanden' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/devices/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE device_id=$1 AND returned_at IS NULL', [id]);
      if (rows[0].c > 0) return res.status(400).json({ error: 'Gerät ist gerade zugewiesen' });
      // Zuweisungen bleiben stehen: der Verlauf ist das Protokoll.
      await pool.query('UPDATE devices SET archived_at = NOW() WHERE id=$1', [id]);
      return res.json({ success: true });
    }
    const db = loadDB();
    if (db.assignments.some(a => a.device_id === id && !a.returned_at))
      return res.status(400).json({ error: 'Gerät ist gerade zugewiesen' });
    const dev = db.devices.find(d => d.id === id);
    if (dev) dev.archived_at = now();
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ZUWEISUNGEN ──────────────────────────────────────────────────────────────

app.get('/api/assignments', async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`
        SELECT a.*, d.name AS device_name, d.serial_number, d.type AS device_type,
          e.name AS employee_name, e.department
        FROM assignments a
        JOIN devices d ON d.id = a.device_id
        JOIN employees e ON e.id = a.employee_id
        ORDER BY a.assigned_at DESC
      `);
      return res.json(rows);
    }
    const db = loadDB();
    res.json(db.assignments.map(a => {
      const d = db.devices.find(x => x.id === a.device_id) || {};
      const e = db.employees.find(x => x.id === a.employee_id) || {};
      return { ...a, device_name: d.name, serial_number: d.serial_number, device_type: d.type, employee_name: e.name, department: e.department };
    }).sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assignments', async (req, res) => {
  const { device_id, employee_id, notes } = req.body;
  if (!device_id || !employee_id) return res.status(400).json({ error: 'Gerät und Mitarbeiter erforderlich' });
  try {
    if (usePostgres()) {
      const dev = (await pool.query('SELECT * FROM devices WHERE id=$1', [device_id])).rows[0];
      if (!dev) return res.status(404).json({ error: 'Gerät nicht gefunden' });
      if (dev.status === 'defekt') return res.status(400).json({ error: 'Gerät ist defekt' });
      const existing = (await pool.query('SELECT id FROM assignments WHERE device_id=$1 AND returned_at IS NULL', [device_id])).rows;
      if (existing.length) return res.status(400).json({ error: 'Gerät ist bereits zugewiesen' });
      const { rows } = await pool.query(
        'INSERT INTO assignments (device_id, employee_id, notes) VALUES ($1,$2,$3) RETURNING *',
        [device_id, employee_id, notes || null]
      );
      await pool.query("UPDATE devices SET status='vergeben' WHERE id=$1", [device_id]);
      const emp = (await pool.query('SELECT name FROM employees WHERE id=$1', [employee_id])).rows[0];
      return res.status(201).json({ ...rows[0], device_name: dev.name, employee_name: emp.name });
    }
    const db = loadDB();
    const device = db.devices.find(d => d.id === device_id);
    if (!device) return res.status(404).json({ error: 'Gerät nicht gefunden' });
    if (device.status === 'defekt') return res.status(400).json({ error: 'Gerät ist defekt' });
    if (db.assignments.some(a => a.device_id === device_id && !a.returned_at))
      return res.status(400).json({ error: 'Gerät ist bereits zugewiesen' });
    const assignment = { id: nextId(db, 'a'), device_id, employee_id, notes: notes || null, assigned_at: now(), returned_at: null };
    db.assignments.push(assignment);
    device.status = 'vergeben';
    saveDB(db);
    const emp = db.employees.find(e => e.id === employee_id) || {};
    res.status(201).json({ ...assignment, device_name: device.name, employee_name: emp.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bei der Rücknahme wird festgehalten, wo das Gerät ab jetzt liegt. Standort
// und Aufbewahrungsnotiz (z. B. „Safe Nadine") sind beide Pflicht.
app.put('/api/assignments/:id/return', async (req, res) => {
  const id = parseInt(req.params.id);
  const { location_id, storage_note } = req.body || {};
  if (!location_id) return res.status(400).json({ error: 'Standort erforderlich' });
  if (!storage_note || !String(storage_note).trim()) return res.status(400).json({ error: 'Aufbewahrung erforderlich' });
  try {
    if (usePostgres()) {
      const { rows } = await pool.query('UPDATE assignments SET returned_at=NOW() WHERE id=$1 AND returned_at IS NULL RETURNING *', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden oder bereits zurückgegeben' });
      await pool.query(
        "UPDATE devices SET status='verfügbar', location_id=$1, storage_note=$2 WHERE id=$3",
        [location_id, String(storage_note).trim(), rows[0].device_id]
      );
      return res.json({ success: true });
    }
    const db = loadDB();
    const assignment = db.assignments.find(a => a.id === id);
    if (!assignment || assignment.returned_at) return res.status(404).json({ error: 'Nicht gefunden' });
    assignment.returned_at = now();
    const device = db.devices.find(d => d.id === assignment.device_id);
    if (device) {
      device.status = 'verfügbar';
      device.location_id = location_id;
      device.storage_note = String(storage_note).trim();
    }
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STANDORTE ────────────────────────────────────────────────────────────────

app.get('/api/locations', async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`
        SELECT l.*,
          COUNT(DISTINCT e.id)::int AS employee_count,
          COUNT(DISTINCT d.id)::int AS device_count
        FROM locations l
        LEFT JOIN employees e ON e.location_id = l.id AND e.archived_at IS NULL
        LEFT JOIN devices d ON d.location_id = l.id AND d.archived_at IS NULL
        WHERE l.archived_at IS ${zeigeArchiv(req) ? 'NOT NULL' : 'NULL'}
        GROUP BY l.id ORDER BY l.name
      `);
      return res.json(rows);
    }
    const db = loadDB();
    res.json(db.locations.map(l => ({
      ...l,
      employee_count: db.employees.filter(e => e.location_id === l.id).length,
      device_count: db.devices.filter(d => d.location_id === l.id).length,
    })).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/locations/:id/details', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const loc = (await pool.query('SELECT * FROM locations WHERE id=$1', [id])).rows[0];
      if (!loc) return res.status(404).json({ error: 'Nicht gefunden' });
      const employees = (await pool.query(`
        SELECT e.*, COUNT(a.id)::int AS device_count
        FROM employees e
        LEFT JOIN assignments a ON a.employee_id = e.id AND a.returned_at IS NULL
        WHERE e.location_id = $1
        GROUP BY e.id ORDER BY e.name
      `, [id])).rows;
      const devices = (await pool.query(`
        SELECT d.*, e.name AS assigned_to_name
        FROM devices d
        LEFT JOIN assignments a ON a.device_id = d.id AND a.returned_at IS NULL
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE d.location_id = $1
        ORDER BY d.name
      `, [id])).rows;
      return res.json({ ...loc, employees, devices });
    }
    const db = loadDB();
    const loc = db.locations.find(l => l.id === id);
    if (!loc) return res.status(404).json({ error: 'Nicht gefunden' });
    const employees = db.employees.filter(e => e.location_id === id).map(e => ({
      ...e,
      device_count: db.assignments.filter(a => a.employee_id === e.id && !a.returned_at).length,
    }));
    const devices = db.devices.filter(d => d.location_id === id).map(d => {
      const a = db.assignments.find(x => x.device_id === d.id && !x.returned_at);
      const e = a ? db.employees.find(x => x.id === a.employee_id) : null;
      return { ...d, assigned_to_name: e?.name || null };
    });
    res.json({ ...loc, employees, devices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/locations', requireAdmin, async (req, res) => {
  const { name, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'INSERT INTO locations (name, address, notes) VALUES ($1,$2,$3) RETURNING *',
        [name, address || null, notes || null]
      );
      return res.status(201).json({ ...rows[0], employee_count: 0, device_count: 0 });
    }
    const db = loadDB();
    const location = { id: nextId(db, 'l'), name, address: address || null, notes: notes || null, created_at: now() };
    db.locations.push(location);
    saveDB(db);
    res.status(201).json({ ...location, employee_count: 0, device_count: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/locations/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'UPDATE locations SET name=$1, address=$2, notes=$3 WHERE id=$4 RETURNING *',
        [name, address || null, notes || null, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
      const ec = (await pool.query('SELECT COUNT(*)::int AS c FROM employees WHERE location_id=$1', [id])).rows[0].c;
      const dc = (await pool.query('SELECT COUNT(*)::int AS c FROM devices WHERE location_id=$1', [id])).rows[0].c;
      return res.json({ ...rows[0], employee_count: ec, device_count: dc });
    }
    const db = loadDB();
    const idx = db.locations.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    db.locations[idx] = { ...db.locations[idx], name, address: address || null, notes: notes || null };
    saveDB(db);
    res.json({ ...db.locations[idx], employee_count: db.employees.filter(e => e.location_id === id).length, device_count: db.devices.filter(d => d.location_id === id).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/locations/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      // Zuordnungen bleiben bestehen; ein archivierter Standort wird nur nicht
      // mehr gelistet. Nichts an fremden Datensaetzen wird stillschweigend
      // umgeschrieben.
      await pool.query('UPDATE locations SET archived_at = NOW() WHERE id=$1', [id]);
      return res.json({ success: true });
    }
    const db = loadDB();
    const loc = db.locations.find(l => l.id === id);
    if (loc) loc.archived_at = now();
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── WIEDERHERSTELLEN ─────────────────────────────────────────────────────────

const ARCHIVIERBAR = { devices: 'devices', employees: 'employees', locations: 'locations', 'apparel/items': 'apparel_items' };

for (const [pfad, tabelle] of Object.entries(ARCHIVIERBAR)) {
  app.put(`/api/${pfad}/:id/restore`, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      if (usePostgres()) {
        await pool.query(`UPDATE ${tabelle} SET archived_at = NULL WHERE id=$1`, [id]);
        return res.json({ success: true });
      }
      const db = loadDB();
      const eintrag = db[tabelle].find(x => x.id === id);
      if (!eintrag) return res.status(404).json({ error: 'Nicht gefunden' });
      delete eintrag.archived_at;
      saveDB(db);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

// ─── ARBEITSKLEIDUNG ──────────────────────────────────────────────────────────
// Kleidung ist Mengenware im Lager Wriezen. Jede Veraenderung ist eine Buchung;
// Lagerbestand und "ausgegeben" werden daraus gerechnet, nie gespeichert. So
// laesst sich jede Zahl bis auf die Buchung zurueckverfolgen.

const BUCHUNGSARTEN = ['zugang', 'ausgabe', 'rueckgabe_lager', 'rueckgabe_entsorgt', 'ausbuchung'];
// Nur Admins buchen Ware ins Lager oder aus dem Lager heraus.
const NUR_ADMIN = ['zugang', 'ausbuchung'];
// Wie eine Buchung auf das Lager und auf den Mitarbeiter wirkt.
const WIRKUNG_LAGER = { zugang: 1, rueckgabe_lager: 1, ausgabe: -1, ausbuchung: -1 };
const WIRKUNG_MITARBEITER = { ausgabe: 1, rueckgabe_lager: -1, rueckgabe_entsorgt: -1 };

// Dieselbe Wirkung als SQL-Ausdruck, damit sie nur an einer Stelle steht.
function summeSql(wirkung, alias = 'm') {
  const faelle = Object.entries(wirkung).map(([art, v]) => `WHEN '${art}' THEN ${v} * ${alias}.quantity`).join(' ');
  return `COALESCE(SUM(CASE ${alias}.kind ${faelle} ELSE 0 END), 0)::int`;
}
function summeJs(bewegungen, wirkung) {
  return bewegungen.reduce((s, m) => s + (wirkung[m.kind] || 0) * m.quantity, 0);
}

function kleidungFelder(body) {
  const text = v => (v == null || String(v).trim() === '') ? null : String(v).trim();
  const min = body.min_stock === '' || body.min_stock == null ? null : parseInt(body.min_stock);
  return {
    name: text(body.name), category: text(body.category), size: text(body.size), color: text(body.color),
    supplier: text(body.supplier), article_number: text(body.article_number),
    min_stock: Number.isInteger(min) && min >= 0 ? min : null,
  };
}

app.get('/api/apparel/items', async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`
        SELECT i.*, ${summeSql(WIRKUNG_LAGER)} AS stock, ${summeSql(WIRKUNG_MITARBEITER)} AS issued
        FROM apparel_items i LEFT JOIN apparel_movements m ON m.item_id = i.id
        WHERE i.archived_at IS ${zeigeArchiv(req) ? 'NOT NULL' : 'NULL'}
        GROUP BY i.id ORDER BY i.name, i.id
      `);
      return res.json(rows);
    }
    const db = loadDB();
    res.json(db.apparel_items.filter(i => zeigeArchiv(req) ? i.archived_at : !i.archived_at).map(i => {
      const bew = db.apparel_movements.filter(m => m.item_id === i.id);
      return { ...i, stock: summeJs(bew, WIRKUNG_LAGER), issued: summeJs(bew, WIRKUNG_MITARBEITER) };
    }).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Artikel mit Bestand, wer ihn gerade hat, und allen Buchungen, neueste zuerst.
app.get('/api/apparel/items/:id/details', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const item = (await pool.query(`
        SELECT i.*, ${summeSql(WIRKUNG_LAGER)} AS stock, ${summeSql(WIRKUNG_MITARBEITER)} AS issued
        FROM apparel_items i LEFT JOIN apparel_movements m ON m.item_id = i.id
        WHERE i.id = $1 GROUP BY i.id
      `, [id])).rows[0];
      if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
      const holders = (await pool.query(`
        SELECT e.id AS employee_id, e.name AS employee_name, e.department, ${summeSql(WIRKUNG_MITARBEITER)} AS quantity
        FROM apparel_movements m JOIN employees e ON e.id = m.employee_id
        WHERE m.item_id = $1
        GROUP BY e.id HAVING ${summeSql(WIRKUNG_MITARBEITER)} > 0 ORDER BY e.name
      `, [id])).rows;
      const movements = (await pool.query(`
        SELECT m.*, e.name AS employee_name
        FROM apparel_movements m LEFT JOIN employees e ON e.id = m.employee_id
        WHERE m.item_id = $1 ORDER BY m.created_at DESC, m.id DESC
      `, [id])).rows;
      return res.json({ ...item, holders, movements });
    }
    const db = loadDB();
    const item = db.apparel_items.find(i => i.id === id);
    if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
    const bew = db.apparel_movements.filter(m => m.item_id === id);
    const name = eid => db.employees.find(e => e.id === eid)?.name || null;
    const holders = [...new Set(bew.filter(m => m.employee_id).map(m => m.employee_id))]
      .map(eid => {
        const e = db.employees.find(x => x.id === eid) || {};
        return { employee_id: eid, employee_name: e.name, department: e.department, quantity: summeJs(bew.filter(m => m.employee_id === eid), WIRKUNG_MITARBEITER) };
      })
      .filter(h => h.quantity > 0).sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''));
    const movements = [...bew].sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id)
      .map(m => ({ ...m, employee_name: name(m.employee_id) }));
    res.json({ ...item, stock: summeJs(bew, WIRKUNG_LAGER), issued: summeJs(bew, WIRKUNG_MITARBEITER), holders, movements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Neuer Artikel; ein Anfangsbestand wird gleich als Zugang gebucht.
app.post('/api/apparel/items', requireAdmin, async (req, res) => {
  const f = kleidungFelder(req.body);
  if (!f.name) return res.status(400).json({ error: 'Bezeichnung erforderlich' });
  if (!f.size) return res.status(400).json({ error: 'Größe erforderlich' });
  const anfang = parseInt(req.body.initial_quantity) || 0;
  if (anfang < 0) return res.status(400).json({ error: 'Anfangsbestand darf nicht negativ sein' });
  try {
    if (usePostgres()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const item = (await client.query(
          'INSERT INTO apparel_items (name, category, size, color, supplier, article_number, min_stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [f.name, f.category, f.size, f.color, f.supplier, f.article_number, f.min_stock]
        )).rows[0];
        if (anfang > 0) await client.query(
          "INSERT INTO apparel_movements (item_id, kind, quantity, note, booked_by) VALUES ($1, 'zugang', $2, 'Anfangsbestand', $3)",
          [item.id, anfang, req.session.username]
        );
        await client.query('COMMIT');
        return res.status(201).json({ ...item, stock: anfang, issued: 0 });
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }
    const db = loadDB();
    const item = { id: nextId(db, 'ai'), ...f, created_at: now() };
    db.apparel_items.push(item);
    if (anfang > 0) db.apparel_movements.push({ id: nextId(db, 'am'), item_id: item.id, kind: 'zugang', quantity: anfang, employee_id: null, note: 'Anfangsbestand', booked_by: req.session.username, created_at: now() });
    saveDB(db);
    res.status(201).json({ ...item, stock: anfang, issued: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/apparel/items/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const f = kleidungFelder(req.body);
  if (!f.name) return res.status(400).json({ error: 'Bezeichnung erforderlich' });
  if (!f.size) return res.status(400).json({ error: 'Größe erforderlich' });
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'UPDATE apparel_items SET name=$1, category=$2, size=$3, color=$4, supplier=$5, article_number=$6, min_stock=$7 WHERE id=$8 RETURNING *',
        [f.name, f.category, f.size, f.color, f.supplier, f.article_number, f.min_stock, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
      return res.json(rows[0]);
    }
    const db = loadDB();
    const item = db.apparel_items.find(i => i.id === id);
    if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
    Object.assign(item, f);
    saveDB(db);
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Archivieren geht erst, wenn nichts mehr im Lager liegt - sonst verschwaende
// Ware still aus dem Bestand. Ausgegebene Teile bleiben beim Mitarbeiter sichtbar.
app.delete('/api/apparel/items/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`SELECT ${summeSql(WIRKUNG_LAGER)} AS stock FROM apparel_movements m WHERE m.item_id=$1`, [id]);
      if (rows[0].stock > 0) return res.status(400).json({ error: `Noch ${rows[0].stock} Stück im Lager – erst ausgeben oder ausbuchen` });
      await pool.query('UPDATE apparel_items SET archived_at = NOW() WHERE id=$1', [id]);
      return res.json({ success: true });
    }
    const db = loadDB();
    const stock = summeJs(db.apparel_movements.filter(m => m.item_id === id), WIRKUNG_LAGER);
    if (stock > 0) return res.status(400).json({ error: `Noch ${stock} Stück im Lager – erst ausgeben oder ausbuchen` });
    const item = db.apparel_items.find(i => i.id === id);
    if (item) item.archived_at = now();
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eine Buchung. Geprueft wird gegen den aktuellen Stand: Ausgeben nur, was im
// Lager liegt, zuruecknehmen nur, was der Mitarbeiter tatsaechlich hat.
app.post('/api/apparel/movements', async (req, res) => {
  const { kind } = req.body;
  const item_id = parseInt(req.body.item_id);
  const quantity = Number(req.body.quantity);
  const employee_id = req.body.employee_id ? parseInt(req.body.employee_id) : null;
  const note = req.body.note ? String(req.body.note).trim() || null : null;

  if (!BUCHUNGSARTEN.includes(kind)) return res.status(400).json({ error: 'Unbekannte Buchungsart' });
  if (NUR_ADMIN.includes(kind) && req.session.userRole !== 'admin') return res.status(403).json({ error: 'Keine Berechtigung' });
  if (!item_id) return res.status(400).json({ error: 'Artikel erforderlich' });
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Menge muss eine ganze Zahl ab 1 sein' });
  const mitMitarbeiter = kind in WIRKUNG_MITARBEITER;
  if (mitMitarbeiter && !employee_id) return res.status(400).json({ error: 'Mitarbeiter erforderlich' });
  if (kind === 'ausbuchung' && !note) return res.status(400).json({ error: 'Grund erforderlich' });

  // Gemeinsame Pruefung fuer beide Speicher; liefert eine Fehlermeldung oder null.
  function pruefe(item, stock, beimMitarbeiter, mitarbeiter) {
    if (!item) return 'Artikel nicht gefunden';
    if (item.archived_at && kind !== 'rueckgabe_lager' && kind !== 'rueckgabe_entsorgt') return 'Artikel ist archiviert';
    if (mitMitarbeiter && !mitarbeiter) return 'Mitarbeiter nicht gefunden';
    if (kind === 'ausgabe' && mitarbeiter.archived_at) return 'Mitarbeiter ist archiviert';
    if ((kind === 'ausgabe' || kind === 'ausbuchung') && quantity > stock)
      return `Nur ${stock} Stück im Lager`;
    if ((kind === 'rueckgabe_lager' || kind === 'rueckgabe_entsorgt') && quantity > beimMitarbeiter)
      return `Der Mitarbeiter hat nur ${beimMitarbeiter} Stück davon`;
    return null;
  }

  try {
    if (usePostgres()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Die Zeilensperre reiht gleichzeitige Buchungen auf denselben Artikel
        // hintereinander, damit zwei Ausgaben nicht dasselbe letzte Stueck nehmen.
        const item = (await client.query('SELECT * FROM apparel_items WHERE id=$1 FOR UPDATE', [item_id])).rows[0];
        const stock = (await client.query(`SELECT ${summeSql(WIRKUNG_LAGER)} AS s FROM apparel_movements m WHERE m.item_id=$1`, [item_id])).rows[0].s;
        let beimMitarbeiter = 0, mitarbeiter = null;
        if (mitMitarbeiter) {
          mitarbeiter = (await client.query('SELECT * FROM employees WHERE id=$1', [employee_id])).rows[0] || null;
          beimMitarbeiter = (await client.query(`SELECT ${summeSql(WIRKUNG_MITARBEITER)} AS s FROM apparel_movements m WHERE m.item_id=$1 AND m.employee_id=$2`, [item_id, employee_id])).rows[0].s;
        }
        const fehler = pruefe(item, stock, beimMitarbeiter, mitarbeiter);
        if (fehler) { await client.query('ROLLBACK'); return res.status(400).json({ error: fehler }); }
        const { rows } = await client.query(
          'INSERT INTO apparel_movements (item_id, kind, quantity, employee_id, note, booked_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [item_id, kind, quantity, mitMitarbeiter ? employee_id : null, note, req.session.username]
        );
        await client.query('COMMIT');
        return res.status(201).json(rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    }
    const db = loadDB();
    const item = db.apparel_items.find(i => i.id === item_id);
    const bew = db.apparel_movements.filter(m => m.item_id === item_id);
    const mitarbeiter = mitMitarbeiter ? db.employees.find(e => e.id === employee_id) || null : null;
    const beimMitarbeiter = mitMitarbeiter ? summeJs(bew.filter(m => m.employee_id === employee_id), WIRKUNG_MITARBEITER) : 0;
    const fehler = pruefe(item, summeJs(bew, WIRKUNG_LAGER), beimMitarbeiter, mitarbeiter);
    if (fehler) return res.status(400).json({ error: fehler });
    const buchung = { id: nextId(db, 'am'), item_id, kind, quantity, employee_id: mitMitarbeiter ? employee_id : null, note, booked_by: req.session.username, created_at: now() };
    db.apparel_movements.push(buchung);
    saveDB(db);
    res.status(201).json(buchung);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kleidung eines Mitarbeiters: was er gerade hat, und jede Ausgabe und
// Rueckgabe als Nachweis.
app.get('/api/employees/:id/apparel', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const held = (await pool.query(`
        SELECT i.id AS item_id, i.name, i.size, i.color, i.category, ${summeSql(WIRKUNG_MITARBEITER)} AS quantity
        FROM apparel_movements m JOIN apparel_items i ON i.id = m.item_id
        WHERE m.employee_id = $1
        GROUP BY i.id HAVING ${summeSql(WIRKUNG_MITARBEITER)} > 0 ORDER BY i.name, i.size
      `, [id])).rows;
      const movements = (await pool.query(`
        SELECT m.*, i.name, i.size, i.color
        FROM apparel_movements m JOIN apparel_items i ON i.id = m.item_id
        WHERE m.employee_id = $1 ORDER BY m.created_at DESC, m.id DESC
      `, [id])).rows;
      return res.json({ held, movements });
    }
    const db = loadDB();
    const bew = db.apparel_movements.filter(m => m.employee_id === id);
    const artikel = iid => db.apparel_items.find(i => i.id === iid) || {};
    const held = [...new Set(bew.map(m => m.item_id))].map(iid => {
      const i = artikel(iid);
      return { item_id: iid, name: i.name, size: i.size, color: i.color, category: i.category, quantity: summeJs(bew.filter(m => m.item_id === iid), WIRKUNG_MITARBEITER) };
    }).filter(h => h.quantity > 0).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const movements = [...bew].sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id)
      .map(m => { const i = artikel(m.item_id); return { ...m, name: i.name, size: i.size, color: i.color }; });
    res.json({ held, movements });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CSV IMPORT ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const first = lines[0].replace(/^﻿/, '');
  const delim = first.includes(';') && !first.includes(',') ? ';' : ',';
  const parseRow = line => {
    const fields = []; let field = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { field += '"'; i++; } else inQ = !inQ; }
      else if (c === delim && !inQ) { fields.push(field.trim()); field = ''; }
      else field += c;
    }
    fields.push(field.trim());
    return fields;
  };
  const headers = parseRow(first).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
    return obj;
  });
}

app.post('/api/devices/import', requireAdmin, async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'Keine CSV-Daten' });
  const rows = parseCSV(csv);
  let imported = 0, skipped = 0;
  const errors = [];
  if (usePostgres()) {
    for (const [i, r] of rows.entries()) {
      const name = r.name || '';
      if (!name) { skipped++; errors.push(`Zeile ${i + 2}: Name fehlt`); continue; }
      const type = r.typ || r.type || null;
      const serial = r.seriennummer || r.serial_number || null;
      const pd = r.kaufdatum || r.purchase_date || null;
      const pp = r.kaufpreis || r.purchase_price || null;
      const notes = r.notizen || r.notes || null;
      try {
        await pool.query(
          'INSERT INTO devices (name, type, serial_number, purchase_date, purchase_price, notes) VALUES ($1,$2,$3,$4,$5,$6)',
          [name, type || null, serial || null, pd || null, pp ? parseFloat(pp) : null, notes || null]
        );
        imported++;
      } catch (e) {
        skipped++;
        errors.push(`Zeile ${i + 2} („${name}"): ${e.code === '23505' ? 'Seriennummer bereits vorhanden' : e.message}`);
      }
    }
  } else {
    const db = loadDB();
    for (const [i, r] of rows.entries()) {
      const name = r.name || '';
      if (!name) { skipped++; errors.push(`Zeile ${i + 2}: Name fehlt`); continue; }
      const serial = r.seriennummer || r.serial_number || null;
      if (serial && db.devices.some(d => d.serial_number === serial)) {
        skipped++; errors.push(`Zeile ${i + 2} („${name}"): Seriennummer bereits vorhanden`); continue;
      }
      db.devices.push({ id: nextId(db, 'd'), name, type: r.typ || r.type || null, serial_number: serial, purchase_date: r.kaufdatum || r.purchase_date || null, purchase_price: (r.kaufpreis || r.purchase_price) ? parseFloat(r.kaufpreis || r.purchase_price) : null, notes: r.notizen || r.notes || null, status: 'verfügbar', created_at: now() });
      imported++;
    }
    saveDB(db);
  }
  res.json({ imported, skipped, errors });
});

app.post('/api/employees/import', requireAdmin, async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'Keine CSV-Daten' });
  const rows = parseCSV(csv);
  let imported = 0, skipped = 0;
  const errors = [];
  if (usePostgres()) {
    for (const [i, r] of rows.entries()) {
      const first_name = r.vorname || r.first_name || r.name || '';
      const last_name = r.nachname || r.last_name || '';
      if (!first_name) { skipped++; errors.push(`Zeile ${i + 2}: Vorname fehlt`); continue; }
      const fullName = [first_name, last_name].filter(Boolean).join(' ');
      try {
        await pool.query('INSERT INTO employees (name, first_name, last_name, department, email, start_date) VALUES ($1,$2,$3,$4,$5,$6)',
          [fullName, first_name, last_name || null, r.abteilung || r.department || null, r.e_mail || r.email || null, r.eintrittsdatum || r.start_date || null]);
        imported++;
      } catch (e) { skipped++; errors.push(`Zeile ${i + 2} („${fullName}"): ${e.message}`); }
    }
  } else {
    const db = loadDB();
    for (const [i, r] of rows.entries()) {
      const first_name = r.vorname || r.first_name || r.name || '';
      const last_name = r.nachname || r.last_name || '';
      if (!first_name) { skipped++; errors.push(`Zeile ${i + 2}: Vorname fehlt`); continue; }
      const fullName = [first_name, last_name].filter(Boolean).join(' ');
      db.employees.push({ id: nextId(db, 'e'), name: fullName, first_name, last_name: last_name || null, department: r.abteilung || r.department || null, email: r.e_mail || r.email || null, start_date: r.eintrittsdatum || r.start_date || null, created_at: now() });
      imported++;
    }
    saveDB(db);
  }
  res.json({ imported, skipped, errors });
});

// ─── STATS ────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS total_devices,
          COUNT(*) FILTER (WHERE status='verfügbar')::int AS available,
          COUNT(*) FILTER (WHERE status='vergeben')::int AS assigned,
          COUNT(*) FILTER (WHERE status='defekt')::int AS defect
        FROM devices WHERE archived_at IS NULL
      `);
      const emp = (await pool.query('SELECT COUNT(*)::int AS c FROM employees WHERE archived_at IS NULL')).rows[0];
      const active = (await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE returned_at IS NULL')).rows[0];
      return res.json({ ...rows[0], total_employees: emp.c, total_assignments: active.c });
    }
    const db = loadDB();
    const aktiveGeraete = db.devices.filter(d => !d.archived_at);
    res.json({
      total_devices: aktiveGeraete.length,
      available: aktiveGeraete.filter(d => d.status === 'verfügbar').length,
      assigned: aktiveGeraete.filter(d => d.status === 'vergeben').length,
      defect: aktiveGeraete.filter(d => d.status === 'defekt').length,
      total_employees: db.employees.filter(e => !e.archived_at).length,
      total_assignments: db.assignments.filter(a => !a.returned_at).length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BENUTZERVERWALTUNG ───────────────────────────────────────────────────────

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY username');
      return res.json(rows);
    }
    const db = loadDB();
    res.json((db.users || []).map(({ password_hash, ...u }) => u));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
  try {
    const hash = await bcrypt.hash(password, 12);
    if (usePostgres()) {
      const { rows } = await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role, created_at',
        [username, hash, role]
      );
      return res.status(201).json(rows[0]);
    }
    const db = loadDB();
    if ((db.users || []).some(u => u.username === username)) return res.status(400).json({ error: 'Benutzername bereits vergeben' });
    if (!db.users) db.users = [];
    const user = { id: nextId(db, 'u'), username, password_hash: hash, role, created_at: now() };
    db.users.push(user);
    saveDB(db);
    const { password_hash, ...safe } = user;
    res.status(201).json(safe);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Benutzername bereits vergeben' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { role, password } = req.body;
  if (role && !['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });
  try {
    if (usePostgres()) {
      if (password) {
        const hash = await bcrypt.hash(password, 12);
        await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
      }
      if (role) {
        await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, id]);
      }
      const { rows } = await pool.query('SELECT id, username, role, created_at FROM users WHERE id=$1', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
      return res.json(rows[0]);
    }
    const db = loadDB();
    const idx = (db.users || []).findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    if (role) db.users[idx].role = role;
    if (password) db.users[idx].password_hash = await bcrypt.hash(password, 12);
    saveDB(db);
    const { password_hash, ...safe } = db.users[idx];
    res.json(safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.session.userId) return res.status(400).json({ error: 'Eigenes Konto kann nicht gelöscht werden' });
  try {
    if (usePostgres()) {
      const { rowCount } = await pool.query('DELETE FROM users WHERE id=$1', [id]);
      if (!rowCount) return res.status(404).json({ error: 'Nicht gefunden' });
      return res.json({ success: true });
    }
    const db = loadDB();
    const idx = (db.users || []).findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    db.users.splice(idx, 1);
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── START ────────────────────────────────────────────────────────────────────

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Inventarsystem läuft auf http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Datenbankfehler:', err.message);
  process.exit(1);
});
