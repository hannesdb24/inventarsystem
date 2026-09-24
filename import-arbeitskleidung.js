// Einmaliger Import des Arbeitskleidungs-Bestands aus der Excel-Liste.
// Vorschau:  railway run --service Postgres node import-arbeitskleidung.js
// Schreiben: railway run --service Postgres node import-arbeitskleidung.js --commit
//
// Die Daten stehen in import-arbeitskleidung.json (nicht im Repo, enthaelt
// Mitarbeiternamen). "lager" ist der gezaehlte Bestand NACH den Ausgaben der
// Historie. Gebucht wird deshalb ein Anfangsbestand von lager + ausgegeben,
// datiert vor der ersten Ausgabe, und danach jede Ausgabe mit ihrem Datum -
// so stimmt das Lager am Ende mit der Liste ueberein und jede Ausgabe steht
// als Nachweis beim Mitarbeiter.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const COMMIT = process.argv.includes('--commit');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'import-arbeitskleidung.json'), 'utf8'));
const GEBUCHT_VON = 'Import Bestandsliste';

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Keine DATABASE_PUBLIC_URL / DATABASE_URL gesetzt.');
  process.exit(1);
}
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const klein = s => String(s ?? '').trim().toLowerCase();
const artikelKey = a => [a.name, a.size, a.color].map(klein).join('|');
const personKey = (vor, nach) => klein(vor) + '|' + klein(nach);

async function backup(client) {
  const tables = ['employees', 'apparel_items', 'apparel_movements'];
  const dump = { created_at: new Date().toISOString() };
  for (const t of tables) dump[t] = (await client.query(`SELECT * FROM ${t} ORDER BY id`)).rows;
  const file = path.join(__dirname, `backup-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`Sicherung: ${path.basename(file)} - ${tables.map(t => `${t}: ${dump[t].length}`).join(', ')}`);
}

async function run() {
  const client = await pool.connect();
  const warnungen = [];
  try {
    await client.query('BEGIN');
    await backup(client);

    const schon = (await client.query('SELECT COUNT(*)::int AS c FROM apparel_movements WHERE booked_by = $1', [GEBUCHT_VON])).rows[0].c;
    if (schon) throw new Error(`Import lief schon (${schon} Buchungen von "${GEBUCHT_VON}")`);

    // Ausgaben je Artikel summieren, um den Anfangsbestand zu bestimmen.
    const artikel = new Map(DATA.artikel.map(a => [artikelKey(a), { ...a, ausgegeben: 0 }]));
    for (const g of DATA.ausgaben) {
      const a = artikel.get(artikelKey(g));
      if (!a) throw new Error(`Ausgabe ohne Artikel: ${g.name} ${g.size} ${g.color || ''}`);
      a.ausgegeben += g.menge;
    }

    // ─── Mitarbeiter ─────────────────────────────────────────────────────────
    const personen = new Map();
    for (const e of (await client.query('SELECT id, name, first_name, last_name, archived_at FROM employees')).rows) {
      const [f, ...rest] = (e.name || '').split(' ');
      personen.set(personKey(e.first_name ?? f, e.last_name ?? rest.join(' ')), e);
    }
    const neuePersonen = [];
    for (const g of DATA.ausgaben) {
      const k = personKey(g.vorname, g.nachname);
      if (personen.has(k)) {
        if (personen.get(k).archived_at) warnungen.push(`${g.vorname} ${g.nachname} ist archiviert - Ausgabe wird trotzdem vermerkt`);
        continue;
      }
      const name = [g.vorname, g.nachname].join(' ');
      const { rows } = await client.query(
        'INSERT INTO employees (name, first_name, last_name) VALUES ($1,$2,$3) RETURNING id, archived_at',
        [name, g.vorname, g.nachname]
      );
      personen.set(k, rows[0]);
      neuePersonen.push(name);
    }

    // ─── Artikel + Anfangsbestand ────────────────────────────────────────────
    const vorhanden = new Map();
    for (const i of (await client.query('SELECT id, name, size, color FROM apparel_items')).rows) vorhanden.set(artikelKey(i), i.id);
    let neuArtikel = 0, stueck = 0;
    for (const a of artikel.values()) {
      let id = vorhanden.get(artikelKey(a));
      if (id) warnungen.push(`${a.name} ${a.size} ${a.color || ''} gab es schon - Bestand wird dazugebucht`);
      else {
        const { rows } = await client.query(
          'INSERT INTO apparel_items (name, category, size, color, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [a.name, a.category, a.size, a.color || null, DATA.anfangsdatum]
        );
        id = rows[0].id;
        neuArtikel++;
      }
      a.id = id;
      const anfang = a.lager + a.ausgegeben;
      stueck += anfang;
      if (anfang > 0) await client.query(
        "INSERT INTO apparel_movements (item_id, kind, quantity, note, booked_by, created_at) VALUES ($1, 'zugang', $2, $3, $4, $5)",
        [id, anfang, ['Anfangsbestand aus der Bestandsliste', a.notiz].filter(Boolean).join(' - '), GEBUCHT_VON, DATA.anfangsdatum]
      );
    }

    // ─── Ausgaben mit ihrem Datum ────────────────────────────────────────────
    for (const [n, g] of DATA.ausgaben.entries()) {
      // Mittag plus laufende Minute, damit die Reihenfolge der Liste erhalten bleibt.
      const zeit = `${g.datum}T12:${String(n).padStart(2, '0')}:00+02:00`;
      await client.query(
        "INSERT INTO apparel_movements (item_id, kind, quantity, employee_id, note, booked_by, created_at) VALUES ($1, 'ausgabe', $2, $3, $4, $5, $6)",
        [artikel.get(artikelKey(g)).id, g.menge, personen.get(personKey(g.vorname, g.nachname)).id, g.notiz || null, GEBUCHT_VON, zeit]
      );
    }

    // ─── Gegenprobe: Lager je Artikel muss der Liste entsprechen ─────────────
    const { rows: ist } = await client.query(`
      SELECT i.id, COALESCE(SUM(CASE m.kind WHEN 'zugang' THEN m.quantity WHEN 'rueckgabe_lager' THEN m.quantity
        WHEN 'ausgabe' THEN -m.quantity WHEN 'ausbuchung' THEN -m.quantity ELSE 0 END), 0)::int AS stock
      FROM apparel_items i LEFT JOIN apparel_movements m ON m.item_id = i.id GROUP BY i.id`);
    const lagerIst = new Map(ist.map(r => [r.id, r.stock]));
    const abweichung = [...artikel.values()].filter(a => lagerIst.get(a.id) !== a.lager);
    if (abweichung.length) throw new Error('Gegenprobe fehlgeschlagen: ' + abweichung.map(a => `${a.name} ${a.size}: ${lagerIst.get(a.id)} statt ${a.lager}`).join('; '));

    console.log(`\nMitarbeiter neu:  ${neuePersonen.length}  (${neuePersonen.join(', ') || '-'})`);
    console.log(`Artikel neu:      ${neuArtikel} von ${artikel.size}`);
    console.log(`Anfangsbestand:   ${stueck} Stueck`);
    console.log(`Ausgaben:         ${DATA.ausgaben.length} Buchungen, ${DATA.ausgaben.reduce((s, g) => s + g.menge, 0)} Stueck`);
    console.log(`Lager danach:     ${[...artikel.values()].reduce((s, a) => s + a.lager, 0)} Stueck - Gegenprobe je Artikel stimmt`);
    if (warnungen.length) console.log(`\nHinweise:\n  ${warnungen.join('\n  ')}`);

    if (COMMIT) { await client.query('COMMIT'); console.log('\nGeschrieben (COMMIT).'); }
    else { await client.query('ROLLBACK'); console.log('\nNur Vorschau - nichts geschrieben. Zum Schreiben: --commit'); }
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
