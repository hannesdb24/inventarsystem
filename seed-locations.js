// Einmalig ausführen: railway run node seed-locations.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const locations = [
  { name: 'Wriezen',               address: 'Mahlerstraße 23a, 16269 Wriezen',                  notes: 'Tel: +49 33456 1516 0' },
  { name: 'Meßkirch',              address: 'Unterm Ablaß 4, 88605 Meßkirch',                   notes: 'Tel: +49 7575 927829 0' },
  { name: 'Straufhain / Eishausen',address: 'Straße in der Neustadt 107, 98646 Straufhain',     notes: 'Tel: +49 3685 40914 0' },
  { name: 'Gera',                  address: 'Naulitzer Straße 35b, 07546 Gera',                 notes: 'Tel: +49 365 7302366' },
  { name: 'Laußnitz',              address: 'Dresdner Straße 30, 01936 Laußnitz',               notes: 'Tel: +49 351 889613 0' },
  { name: 'Pocking',               address: 'Gewerbering 4a, 94060 Pocking',                    notes: 'Tel: +49 8531 97834 0' },
  { name: 'Perleberg',             address: 'Hamburger Chaussee 5, 19348 Perleberg',            notes: 'Tel: +49 3876 3000 290' },
  { name: 'Egeln',                 address: 'Feld am Bruche 18, 39435 Egeln',                   notes: 'Tel: +49 39268 9869 0' },
];

async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM locations');
  if (rows[0].c > 0) {
    console.log(`ℹ️  ${rows[0].c} Standorte bereits vorhanden – überspringe.`);
    await pool.end();
    return;
  }
  for (const loc of locations) {
    await pool.query(
      'INSERT INTO locations (name, address, notes) VALUES ($1, $2, $3)',
      [loc.name, loc.address, loc.notes]
    );
    console.log(`✅ ${loc.name}`);
  }
  console.log(`\nFertig! ${locations.length} Standorte importiert.`);
  await pool.end();
}

seed().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
