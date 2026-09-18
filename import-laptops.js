// Import der bestehenden Laptops aus der Google-Tabelle.
// Vorschau:  railway run node import-laptops.js
// Schreiben: railway run node import-laptops.js --commit
//
// Das Skript ist idempotent: vorhandene Mitarbeiter (Vor- + Nachname) und
// Geräte (Seriennummer) werden übersprungen, nicht dupliziert.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const COMMIT = process.argv.includes('--commit');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'import-laptops.json'), 'utf8'));

// Von aussen ist nur die oeffentliche Adresse erreichbar; der interne Host
// (postgres.railway.internal) loest nur innerhalb von Railway auf.
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Keine DATABASE_PUBLIC_URL / DATABASE_URL gesetzt.');
  process.exit(1);
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const key = (first, last) => `${(first || '').trim().toLowerCase()}|${(last || '').trim().toLowerCase()}`;

async function backup(client) {
  const tables = ['employees', 'devices', 'assignments'];
  const dump = { created_at: new Date().toISOString() };
  for (const t of tables) {
    dump[t] = (await client.query(`SELECT * FROM ${t} ORDER BY id`)).rows;
  }
  const file = path.join(__dirname, `backup-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`Sicherung: ${path.basename(file)} — ${tables.map(t => `${t}: ${dump[t].length}`).join(', ')}`);
  return dump;
}

async function nextInventoryNumbers(client, count) {
  const year = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT inventory_number FROM devices WHERE inventory_number LIKE $1 ORDER BY inventory_number DESC LIMIT 1`,
    [`INV-${year}-%`]
  );
  let seq = rows[0] ? parseInt(rows[0].inventory_number.split('-')[2], 10) : 0;
  return Array.from({ length: count }, () => `INV-${year}-${String(++seq).padStart(4, '0')}`);
}

async function run() {
  const client = await pool.connect();
  const report = { employees_new: [], employees_existing: [], devices_new: [], devices_existing: [], assignments_new: [], warnings: [] };
  try {
    await client.query('BEGIN');
    await backup(client);
    // Eintrittsdatum aus der Tabelle; die Spalte kommt sonst erst beim naechsten Deploy.
    await client.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date TEXT');

    // ─── Mitarbeiter ───────────────────────────────────────────────────────
    const existing = new Map();
    for (const e of (await client.query('SELECT id, first_name, last_name, name FROM employees')).rows) {
      const [f, ...rest] = (e.name || '').split(' ');
      existing.set(key(e.first_name ?? f, e.last_name ?? rest.join(' ')), e.id);
    }

    const byName = new Map(existing);
    for (const emp of DATA.employees) {
      const k = key(emp.first_name, emp.last_name);
      if (byName.has(k)) { report.employees_existing.push(`${emp.first_name} ${emp.last_name}`.trim()); continue; }
      const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(' ');
      const [d, m, y] = (emp.entry_date || '').split('.');
      const { rows } = await client.query(
        'INSERT INTO employees (name, first_name, last_name, start_date) VALUES ($1,$2,$3,$4) RETURNING id',
        [fullName, emp.first_name, emp.last_name || null, y ? `${y}-${m}-${d}` : null]
      );
      byName.set(k, rows[0].id);
      report.employees_new.push(fullName);
    }

    // ─── Geräte + Zuweisungen ──────────────────────────────────────────────
    const haveSerial = new Set(
      (await client.query('SELECT serial_number FROM devices WHERE serial_number IS NOT NULL')).rows.map(r => r.serial_number)
    );
    const toInsert = DATA.devices.filter(d => !haveSerial.has(d.serial));
    DATA.devices.filter(d => haveSerial.has(d.serial)).forEach(d => report.devices_existing.push(d.serial));
    const invNumbers = await nextInventoryNumbers(client, toInsert.length);

    for (const [i, dev] of toInsert.entries()) {
      const ownerName = [dev.owner_first, dev.owner_last].filter(Boolean).join(' ');
      const owner = byName.get(key(dev.owner_first, dev.owner_last));
      const { rows } = await client.query(
        `INSERT INTO devices (name, type, serial_number, notes, inventory_number, status)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [dev.name, dev.type, dev.serial, dev.notes, invNumbers[i], owner ? 'vergeben' : 'verfügbar']
      );
      report.devices_new.push(`${invNumbers[i]} ${dev.serial}`);
      if (!owner) { report.warnings.push(`${dev.serial}: Mitarbeiter „${ownerName}" nicht gefunden — Gerät bleibt verfügbar`); continue; }
      await client.query(
        'INSERT INTO assignments (device_id, employee_id, notes) VALUES ($1,$2,$3)',
        [rows[0].id, owner, 'Import aus Google-Tabelle']
      );
      report.assignments_new.push(`${dev.serial} → ${ownerName}`);
    }

    console.log(`\nMitarbeiter neu:   ${report.employees_new.length}  (bereits vorhanden: ${report.employees_existing.length})`);
    console.log(`Geräte neu:        ${report.devices_new.length}  (Seriennummer schon da: ${report.devices_existing.length})`);
    console.log(`Zuweisungen neu:   ${report.assignments_new.length}`);
    if (report.warnings.length) console.log(`\nHinweise:\n  ${report.warnings.join('\n  ')}`);

    if (COMMIT) {
      await client.query('COMMIT');
      console.log('\nGeschrieben (COMMIT).');
    } else {
      await client.query('ROLLBACK');
      console.log('\nNur Vorschau — nichts geschrieben. Zum Schreiben: --commit');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Fehler, nichts geschrieben:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
