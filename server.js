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
    console.log(`[login] user found: ${!!user}, pw_len: ${password.length}`);
    if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    const valid = await bcrypt.compare(password, user.password_hash);
    console.log(`[login] bcrypt valid: ${valid}`);
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
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT,
        email TEXT,
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
    `);
    console.log('✅ PostgreSQL verbunden');
  } else {
    console.log('ℹ️  Kein DATABASE_URL – nutze lokale JSON-Datei');
  }
  await seedAdminUser();
}

async function seedAdminUser() {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS;
  console.log(`[seed] ADMIN_PASS gesetzt: ${!!adminPass}, usePostgres: ${usePostgres()}`);
  if (!adminPass) return;

  const hash = await bcrypt.hash(adminPass, 12);
  if (usePostgres()) {
    await pool.query(`
      INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
    `, [adminUser, hash]);
    const check = await pool.query('SELECT id, username, role FROM users WHERE username=$1', [adminUser]);
    console.log(`[seed] User in DB nach upsert:`, check.rows);
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
    const empty = { users: [], employees: [], devices: [], assignments: [], _seq: { u: 0, e: 0, d: 0, a: 0 } };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!db.users) db.users = [];
  if (!db._seq.u) db._seq.u = 0;
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
        SELECT e.*, COUNT(a.id)::int AS device_count
        FROM employees e
        LEFT JOIN assignments a ON a.employee_id = e.id AND a.returned_at IS NULL
        GROUP BY e.id ORDER BY e.name
      `);
      return res.json(rows);
    }
    const db = loadDB();
    res.json(db.employees.map(e => ({
      ...e,
      device_count: db.assignments.filter(a => a.employee_id === e.id && !a.returned_at).length
    })).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', requireAdmin, async (req, res) => {
  const { name, department, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'INSERT INTO employees (name, department, email) VALUES ($1,$2,$3) RETURNING *, 0 AS device_count',
        [name, department || null, email || null]
      );
      return res.status(201).json(rows[0]);
    }
    const db = loadDB();
    const employee = { id: nextId(db, 'e'), name, department: department || null, email: email || null, created_at: now() };
    db.employees.push(employee);
    saveDB(db);
    res.status(201).json({ ...employee, device_count: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/employees/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, department, email } = req.body;
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'UPDATE employees SET name=$1, department=$2, email=$3 WHERE id=$4 RETURNING *',
        [name, department || null, email || null, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
      const cnt = await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE employee_id=$1 AND returned_at IS NULL', [id]);
      return res.json({ ...rows[0], device_count: cnt.rows[0].c });
    }
    const db = loadDB();
    const idx = db.employees.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    db.employees[idx] = { ...db.employees[idx], name, department: department || null, email: email || null };
    saveDB(db);
    res.json({ ...db.employees[idx], device_count: db.assignments.filter(a => a.employee_id === id && !a.returned_at).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/employees/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE employee_id=$1 AND returned_at IS NULL', [id]);
      if (rows[0].c > 0) return res.status(400).json({ error: 'Mitarbeiter hat noch zugewiesene Geräte' });
      await pool.query('DELETE FROM employees WHERE id=$1', [id]);
      return res.json({ success: true });
    }
    const db = loadDB();
    if (db.assignments.some(a => a.employee_id === id && !a.returned_at))
      return res.status(400).json({ error: 'Mitarbeiter hat noch zugewiesene Geräte' });
    db.employees = db.employees.filter(e => e.id !== id);
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GERÄTE ───────────────────────────────────────────────────────────────────

app.get('/api/devices', async (req, res) => {
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(`
        SELECT d.*, e.name AS assigned_to_name, e.id AS assigned_to_id,
          a.assigned_at, a.id AS assignment_id
        FROM devices d
        LEFT JOIN assignments a ON a.device_id = d.id AND a.returned_at IS NULL
        LEFT JOIN employees e ON e.id = a.employee_id
        ORDER BY d.name
      `);
      return res.json(rows);
    }
    const db = loadDB();
    res.json(db.devices.map(d => {
      const a = db.assignments.find(x => x.device_id === d.id && !x.returned_at);
      const e = a ? db.employees.find(x => x.id === a.employee_id) : null;
      return { ...d, assigned_to_name: e?.name || null, assigned_to_id: e?.id || null, assigned_at: a?.assigned_at || null, assignment_id: a?.id || null };
    }).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/devices', requireAdmin, async (req, res) => {
  const { name, type, serial_number, purchase_date, purchase_price, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'INSERT INTO devices (name, type, serial_number, purchase_date, purchase_price, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [name, type || null, serial_number || null, purchase_date || null, purchase_price || null, notes || null]
      );
      return res.status(201).json({ ...rows[0], assigned_to_name: null, assigned_to_id: null, assigned_at: null, assignment_id: null });
    }
    const db = loadDB();
    if (serial_number && db.devices.some(d => d.serial_number === serial_number))
      return res.status(400).json({ error: 'Seriennummer bereits vorhanden' });
    const device = { id: nextId(db, 'd'), name, type: type || null, serial_number: serial_number || null, purchase_date: purchase_date || null, purchase_price: purchase_price ? parseFloat(purchase_price) : null, notes: notes || null, status: 'verfügbar', created_at: now() };
    db.devices.push(device);
    saveDB(db);
    res.status(201).json({ ...device, assigned_to_name: null, assigned_to_id: null, assigned_at: null, assignment_id: null });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Seriennummer bereits vorhanden' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/devices/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, type, serial_number, purchase_date, purchase_price, notes, status } = req.body;
  try {
    if (usePostgres()) {
      const { rows } = await pool.query(
        'UPDATE devices SET name=$1, type=$2, serial_number=$3, purchase_date=$4, purchase_price=$5, notes=$6, status=$7 WHERE id=$8 RETURNING *',
        [name, type || null, serial_number || null, purchase_date || null, purchase_price || null, notes || null, status || 'verfügbar', id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
      const a = (await pool.query('SELECT a.*, e.name AS employee_name FROM assignments a JOIN employees e ON e.id=a.employee_id WHERE a.device_id=$1 AND a.returned_at IS NULL', [id])).rows[0];
      return res.json({ ...rows[0], assigned_to_name: a?.employee_name || null, assigned_to_id: a?.employee_id || null, assigned_at: a?.assigned_at || null, assignment_id: a?.id || null });
    }
    const db = loadDB();
    const idx = db.devices.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    if (serial_number && db.devices.some(d => d.serial_number === serial_number && d.id !== id))
      return res.status(400).json({ error: 'Seriennummer bereits vorhanden' });
    db.devices[idx] = { ...db.devices[idx], name, type: type || null, serial_number: serial_number || null, purchase_date: purchase_date || null, purchase_price: purchase_price ? parseFloat(purchase_price) : null, notes: notes || null, status: status || 'verfügbar' };
    saveDB(db);
    const a = db.assignments.find(x => x.device_id === id && !x.returned_at);
    const e = a ? db.employees.find(x => x.id === a.employee_id) : null;
    res.json({ ...db.devices[idx], assigned_to_name: e?.name || null, assigned_to_id: e?.id || null, assigned_at: a?.assigned_at || null, assignment_id: a?.id || null });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Seriennummer bereits vorhanden' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/devices/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE device_id=$1 AND returned_at IS NULL', [id]);
      if (rows[0].c > 0) return res.status(400).json({ error: 'Gerät ist gerade zugewiesen' });
      await pool.query('DELETE FROM assignments WHERE device_id=$1', [id]);
      await pool.query('DELETE FROM devices WHERE id=$1', [id]);
      return res.json({ success: true });
    }
    const db = loadDB();
    if (db.assignments.some(a => a.device_id === id && !a.returned_at))
      return res.status(400).json({ error: 'Gerät ist gerade zugewiesen' });
    db.devices = db.devices.filter(d => d.id !== id);
    db.assignments = db.assignments.filter(a => a.device_id !== id);
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

app.put('/api/assignments/:id/return', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (usePostgres()) {
      const { rows } = await pool.query('UPDATE assignments SET returned_at=NOW() WHERE id=$1 AND returned_at IS NULL RETURNING *', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden oder bereits zurückgegeben' });
      await pool.query("UPDATE devices SET status='verfügbar' WHERE id=$1", [rows[0].device_id]);
      return res.json({ success: true });
    }
    const db = loadDB();
    const assignment = db.assignments.find(a => a.id === id);
    if (!assignment || assignment.returned_at) return res.status(404).json({ error: 'Nicht gefunden' });
    assignment.returned_at = now();
    const device = db.devices.find(d => d.id === assignment.device_id);
    if (device) device.status = 'verfügbar';
    saveDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
        FROM devices
      `);
      const emp = (await pool.query('SELECT COUNT(*)::int AS c FROM employees')).rows[0];
      const active = (await pool.query('SELECT COUNT(*)::int AS c FROM assignments WHERE returned_at IS NULL')).rows[0];
      return res.json({ ...rows[0], total_employees: emp.c, total_assignments: active.c });
    }
    const db = loadDB();
    res.json({
      total_devices: db.devices.length,
      available: db.devices.filter(d => d.status === 'verfügbar').length,
      assigned: db.devices.filter(d => d.status === 'vergeben').length,
      defect: db.devices.filter(d => d.status === 'defekt').length,
      total_employees: db.employees.length,
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
