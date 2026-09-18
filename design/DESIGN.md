---
name: dachbleche24 — Hausgestaltung (aus dem DAKO)
description: Reißbrett für den Vertrieb — Tinte auf hellem Grund, eine Anreißfarbe, Maße in Mono.
quelle: Dako/DESIGN.md + Dako/src/app/globals.css, Stand 18.09.2026
colors:
  background: "#f3f4f6"
  card: "#ffffff"
  foreground: "#14181d"
  muted-foreground: "#5b6470"
  primary: "#14181d"
  primary-foreground: "#ffffff"
  accent: "#ba4c0c"
  accent-foreground: "#ffffff"
  accent-strong: "#9a4210"
  accent-soft: "rgba(186, 76, 12, 0.1)"
  border: "rgba(20, 24, 29, 0.08)"
  border-strong: "rgba(20, 24, 29, 0.16)"
  border-hover: "rgba(20, 24, 29, 0.28)"
  shell: "#171b21"
  shell-foreground: "rgba(245, 246, 248, 0.92)"
  shell-muted: "rgba(245, 246, 248, 0.5)"
  shell-border: "rgba(255, 255, 255, 0.08)"
  danger: "#b42318"
  warning: "#8a5a05"
  success: "#1b6f47"
  info: "#1f6f8b"
  brand-red: "#e30613"
typography:
  hero:        { fontFamily: "Geist",      fontSize: "34px", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.02em" }
  metric:      { fontFamily: "Geist Mono", fontSize: "30px", fontWeight: 600, lineHeight: 1,    letterSpacing: "-0.03em", fontFeature: "tabular-nums" }
  display:     { fontFamily: "Geist",      fontSize: "26px", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.02em" }
  section:     { fontFamily: "Geist",      fontSize: "22px", fontWeight: 600, lineHeight: 1,    letterSpacing: "-0.02em" }
  headline:    { fontFamily: "Geist",      fontSize: "17px", fontWeight: 600, lineHeight: 1.3,  letterSpacing: "-0.01em" }
  action-large:{ fontFamily: "Geist",      fontSize: "15px", fontWeight: 500, lineHeight: 1.4 }
  body:        { fontFamily: "Geist",      fontSize: "14px", fontWeight: 400, lineHeight: 1.5 }
  title:       { fontFamily: "Geist",      fontSize: "13px", fontWeight: 500, lineHeight: 1.4 }
  caption:     { fontFamily: "Geist",      fontSize: "12px", fontWeight: 400, lineHeight: 1.4 }
  label:       { fontFamily: "Geist",      fontSize: "11px", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase" }
  numeric:     { fontFamily: "Geist Mono", fontFeature: "tabular-nums", letterSpacing: "-0.01em" }
rounded:
  chip: "6px"
  control: "8px"
  inner: "10px"
  control-lg: "12px"
  card: "14px"
  dialog: "16px"
heights:
  cell-dense: "28px"
  cell: "32px"
  switch: "36px"
  control: "40px"
  control-lg: "44px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "36px"
---

# Hausgestaltung dachbleche24 — die Designgrundlagen aus dem DAKO

Dieses Dokument ist die **Gestaltungsfassung des DAKO, losgelöst vom DAKO**.
Alles darin gilt für jede Anwendung des Hauses. Die Werte liegen maschinenlesbar
in [`tokens.css`](tokens.css); dieses Dokument sagt, was sie bedeuten und wann
man welchen nimmt.

Am Ende steht ein Abschnitt **„Gilt nur im DAKO"** — dort liegt, was an
Konfigurator, 3D-Zeichnung und Positions-Editor hängt. Das ist Kontext, keine
Vorgabe für ein anderes Projekt.

## Nordstern

**„Das Reißbrett"**

Die Anwendung sieht aus wie das Werkzeug eines Konstrukteurs, nicht wie eine
Verkaufsseite. Der Grund ist hell und ruhig, die Schrift ist Tinte, und Farbe
ist eine Entscheidung, kein Zustand: Es gibt genau **eine** Anreißfarbe — das
Marken-Orange — und die zeigt hin, wo als Nächstes gehandelt wird oder was
gerade ausgewählt ist. Alles andere trägt sich in Neutraltönen. Der dunkle
Seitenrahmen ist die einzige große dunkle Fläche und bewusst ein Rahmen: Er
fasst das helle Blatt ein, auf dem gearbeitet wird.

Die Dichte ist die eines Arbeitswerkzeugs: 14 px Grundschrift, feste
Feldhöhen, Tabellen mit ruhiger Trennlinie. Nichts ist dekorativ groß, aber
auch nichts gequetscht — die Bühne steht still, während sich die Zahlen darauf
ändern. Maße, Mengen und Preise stehen in Geist Mono mit fester Zeichenbreite,
weil sie untereinander vergleichbar sein müssen.

Bewusst verworfen (Hannes, 03.09.2026): „Liquid Glass" und Luxus-Serifen,
Dunkel als Standard, viel Animation. Gewählte Richtung ist Minimalism & Swiss
Style. Die alte MAKO-Farbwelt mit Teal als Primärfarbe ist Vergangenheit —
Teal lebt nur noch als `info` weiter.

**Kennzeichen:**
- Tinte statt Farbe für alles Normale; Orange nur für die eine Hauptaktion und die Auswahl
- Flächen ohne grauen Rahmen: getönter Schatten plus 1 px Hairline als Ring
- Zahlen in Mono mit fester Zeichenbreite, damit Spalten untereinander lesbar bleiben
- Dunkler Seitenrahmen als Einfassung, helles Arbeitsblatt in der Mitte
- Eine Bewegungskurve, kurze Dauern, alles abschaltbar
- Zustände immer als Wort, nie allein als Farbe

## Farben

Eine kühl getönte Neutralwelt mit genau einem warmen Akzent. Die Palette ist
klein: Wenn eine Fläche Farbe trägt, hat das eine Bedeutung.

### Primär

- **Tinte** (`primary` / `foreground`): die Schrift und zugleich die Fläche der
  Standardknöpfe. Ein Knopf in Tinte sagt „normale Aktion" — Speichern,
  Übernehmen, Hinzufügen. Deshalb sind fast alle Knöpfe dunkel und nicht orange.
- **Anreißorange** (`accent`): die Hauptaktion einer Seite, die aktive Auswahl,
  die Markierung am aktiven Navigationseintrag und der Fokusrahmen. Der Wert
  wurde am 10.09.2026 von `#e0621a` heruntergezogen, weil weißer Text darauf
  nur 3,54:1 erreichte.
- **Orange gedeckt** (`accent-strong`): Orange **als Text**, etwa in einer
  Auswahlmarke. Die Fläche `accent-soft` trägt diesen Ton, nie den vollen.

### Neutral

- **Arbeitsblatt** (`card`): jede Karte, jedes Eingabefeld, jede Tabelle.
- **Tischplatte** (`background`): der Grund dahinter und die Innenfläche in
  einer Karte (`.panel-inset`) — die Umkehrung ist Absicht, so hebt sich eine
  Kachel *in* der Karte durch Vertiefung ab statt durch einen Rahmen.
- **Halbtinte** (`muted-foreground`): Hinweise, Feldhilfen, Tabellenköpfe,
  inaktive Navigation.
- **Hairlines** (`border`, `border-strong`, `border-hover`): getönt, nie grau.
  Sie treten hinter die Fläche zurück und werden bei Berührung kräftiger.
- **Rahmen** (`shell` und seine Geschwister): ausschließlich der Seitenrahmen
  mit der Navigation. Keine andere Fläche der Anwendung benutzt diese Tokens.

### Meldefarben

`danger`, `warning`, `success`, `info`: Fehler, Grenzwerte, Bestätigung,
Neutralinformation. Sie erscheinen als Text oder als 10-prozentige Fläche einer
Zustandsmarke, nie als große Fläche.

**Markenrot** (`brand-red`): ausschließlich die „24" der Wortmarke. Es ist keine
UI-Farbe und darf nirgendwo sonst auftauchen.

### Dunkel

Dunkel ist eine Option (Systemeinstellung oder Schalter), kein Standard — und
keine Invertierung: Der Grund ist Anthrazit, Flächen liegen eine Stufe heller,
der Seitenrahmen eine Stufe dunkler. Das Orange bleibt Orange und wird eine
Spur heller (`#e8702c`); dafür wird der **Knopftext zu Tinte** statt Weiß.

Wer die Akzentfarbe anfasst, muss beide Sätze prüfen: Ein dunkleres Orange im
Dunkelbild würde den Akzenttext auf der Karte verschlechtern, ein helleres im
Hellbild den Knopf.

### Benannte Regeln

**Die Ein-Orange-Regel.** Höchstens eine orange Fläche je Seite, und das ist die
Hauptaktion. Auswahl und Markierung nutzen `accent-soft` mit `accent-strong` als
Text. Wird die zweite Fläche orange, verliert die erste ihre Bedeutung. Gilt für
alles, was **gleichzeitig sichtbar** ist: Der Knopf im Leerzustand einer Liste
wiederholt nur die Hauptaktion aus dem Seitenkopf und ist deshalb Tinte; eine
Schritt- oder Abschnittsnummer zählt, statt zu handeln, und trägt `accent-soft`.
Die einzige orange Fläche ohne Aktion ist die **Datenreihe eines Diagramms** —
dort ist Orange die Anreißfarbe der Zeichnung, nicht das Ziel eines Klicks.

**Die Tinten-Regel.** Standardknöpfe sind Tinte, Entfernen ist `danger` auf
transparentem Grund, alles Nachgeordnete ist `ghost`. Ein Knopf wird nicht bunt,
weil er wichtig aussehen soll.

**Die Zustands-Regel.** Ein Zustand steht immer auch als Wort da — nie nur als
Farbe, nie nur als Punkt. Zustandsmarken tragen den Text, der Punkt ist
`aria-hidden`.

**Die Regel vom Farbfeld.** Ein kleines Feld, das eine Warenfarbe zeigt, trägt
als Kontur `inset 0 0 0 1px rgba(0,0,0,0.25)` — schwarz bei 25 %, nicht die
Hairline. Das ist die eine Stelle, an der ein ungetönter Wert richtig ist: Die
Kontur muss auf jedem Farbton halten, und `--border-strong` ist im Dunkelbild
weiß-transparent und verschwindet auf einer hellen Farbe.

**Die Token-Regel.** Keine Hex-Werte in Komponenten. Ausgenommen sind Paletten,
die eine Sache abbilden statt eine Oberfläche: Export-Paletten, Icon-Sätze,
Markenrot und Werkstoff-Farben von Strichbildern. Ein Ersatzton für eine
fehlende Warenfarbe ist **kein** Ausnahmefall: Der nimmt `muted-foreground`.

## Typografie

**Schrift:** Geist (mit `system-ui`, `sans-serif`) — für Überschriften wie für
Fließtext; die Hierarchie entsteht aus Größe und Gewicht, nicht aus einer
zweiten Schrift.
**Zahlen:** Geist Mono (mit `ui-monospace`, `monospace`).

**Charakter:** Eine sachliche Groteske mit etwas mehr Charakter als Inter, ohne
je dekorativ zu werden. Überschriften stehen leicht enger (negatives
Spationieren) und mit `text-wrap: balance`; die Mono trägt jede Zahl, die man
vergleichen können muss.

### Die Leiter

- **Hero** (600, 34 px, −0,02 em): **nur die Anmeldeseite.** Die einzige Stelle,
  an der die Anwendung wirbt statt zu arbeiten. Nirgendwo sonst verwenden.
- **Metric** (Mono, 600, 30 px, `leading-none`, −0,03 em): die große Kennzahl
  auf Übersichten. Eine Zahl, die man aus zwei Metern Abstand liest.
- **Display** (600, 26 px, −0,02 em): der Seitentitel. Genau einer je Seite.
- **Section** (600, 22 px, `leading-none`, −0,02 em): die Kennzahl **in** einer
  Karte oder einem Reiter, und die Überschrift einer eigenständigen Karte
  („Anmelden"). Mit `.num` bei Zahlen.
- **Headline** (600, 17 px, −0,01 em): Dialogtitel, Name eines Eintrags in
  seiner Karte.
- **Action-Large** (500, 15 px): der große Knopf.
- **Title** (500, 13 px): Feldbeschriftungen, Navigation, kleine Knöpfe.
  Beschriftungen stehen in Satzschrift, nicht in Versalien.
- **Caption** (400, 12 px): Feldhinweise, Fehlertexte, Zustandsmarken,
  Nebenangaben unter einer Kachel.
- **Body** (400, 14 px, Zeilenhöhe 1,5): Fließtext, Felder, Knöpfe.
- **Label** (500, 11 px, 0,12 em, Versalien): die Überzeile `.eyebrow` und der
  Tabellenkopf — die einzigen beiden Orte mit Versalien im System.
- **Numeric** (Mono, `tabular-nums`, −0,01 em): Maße, Mengen, Preise,
  Kennzahlen. Als Klasse `.num`; numerische Tabellenzellen bekommen sie
  automatisch und stehen rechtsbündig.

### Benannte Regeln

**Die Elf-Pixel-Grenze.** Nichts unter 11 px, Fließtext nie unter 12 px. 11 px
trägt die Überzeile, den Tabellenkopf und knappe Marken — alles, was man erfasst
statt liest. Sobald ein Satz daraus wird, sind es 12 px.

**Die Leiter ist vollständig.** 11 · 12 · 13 · 14 · 15 · 17 · 22 · 26 · 30 · 34.
Wer eine Größe dazwischen setzt, hat eine Rolle gefunden, die es noch nicht gibt
— dann gehört sie hier benannt, nicht still eingeführt. So ist diese Leiter
entstanden: Die Kennzahl gab es in vier Größen (22, 28, 30, 34), weil sie keinen
Namen hatte. Einzige Ausnahme ist die Wortmarke, deren Größe der Ort bestimmt:
19 px im Seitenrahmen, 24 px auf den Anmeldeseiten, wo sie für sich steht.

**Die Versalien-Regel.** Versalien gibt es nur in `.eyebrow` und im Tabellenkopf.
Eine Feldbeschriftung in Versalien ist ein Fehler, kein Stil. Die Überzeile
spationiert 0,12 em, der Tabellenkopf 0,1 em — weiter auseinander, weil eine
Kopfzeile kürzer ist und mehr Luft verträgt. Andere Werte gibt es nicht.

**Die Mono-für-Maße-Regel.** Was verglichen, addiert oder abgelesen wird, steht
in Mono mit `tabular-nums`. Eine Preisspalte in Proportionalschrift lässt sich
nicht überfliegen.

## Layout

Die Anwendung ist zweigeteilt: links der dunkle Seitenrahmen (256 px, auf 68 px
einklappbar, unter der `md`-Schwelle über dem Inhalt), rechts das helle
Arbeitsblatt. Der Inhalt ist standardmäßig begrenzt (etwa 1152 px) und
**linksbündig** im Rahmen, damit die Seite neben der Navigation nicht schwimmt;
Seiten, die die Breite wirklich brauchen, laufen über die volle Fensterbreite.

Innenabstände: 20 px auf schmalen, 36 px auf breiten Fenstern bei begrenzten
Seiten; 16/24 px bei Vollbreite. Der Seitenkopf hält 28 px Abstand zum Inhalt.
Felder in einer Gruppe stehen 6 px auseinander, Knöpfe 8 px, Karten 16–24 px.

Umbruch: ab 1280 px drei Spalten, darunter zwei, unter 768 px eine.
Kennzahlzeilen brechen um, statt sich zu stauchen. Die Seite scrollt niemals
waagerecht.

### Benannte Regeln

**Die Regel der stabilen Bühne.** Nichts springt: `scrollbar-gutter: stable`
hält die Breite über alle Reiter, Felder haben feste Höhen, und Listen zeigen
beim Laden ein Skelett statt Leere — nie „Lädt…", denn ein Wort hat eine andere
Höhe als die Liste, die es ersetzt.

**`min-h-0` neben `flex-1`.** Ein Bereich, der in sich scrollen soll, braucht
beides. Ohne das schrumpft ein Flex-Kind nicht, sondern wächst über seinen
Rahmen hinaus und schiebt die ganze Seite auf — so war die Navigationsleiste mit
16 Einträgen 825 px hoch und ließ jede Seite auf einem 1366×768-Laptop um 234 px
scrollen.

**Volle Breite nur mit Grafik.** Inhalt ohne Zeichenfläche bekommt Lesebreite.
Eine Tabelle mit sieben Spalten, über 1050 px gezogen, lässt das Auge 250 px
zwischen zwei Zahlen wandern.

## Tiefe

Tiefe entsteht durch **getönten Schatten plus Hairline-Ring**, nie durch einen
grauen Rahmen. Jeder Schatten trägt den Ton des Hintergrunds, nie reines
Schwarz; im Dunkelbild sind es eigene, tiefere Werte statt derselben mit mehr
Deckkraft. Es gibt genau drei Stufen, und sie bedeuten Entfernung vom Blatt:
Knopf, Karte, Dialog.

Der Akzentknopf ist die einzige Ausnahme: Sein Schatten ist orange getönt
(`--shadow-accent`), damit die Hauptaktion auch aus dem Augenwinkel als erhoben
erkennbar ist. Vertiefung — die Innenfläche einer Karte, ein Eingabefeld — wird
über `inset`-Ringe erzeugt, nicht über eine dunklere Fläche.

- **Knopf** (`--shadow-sm`): kaum sichtbar, hebt den Knopf gerade vom Blatt.
- **Karte** (`--shadow-card`): jede `.panel`-Fläche, zusammen mit `0 0 0 1px var(--border)`.
- **Schwebend** (`--shadow-float`): Dialoge, Seitenblätter und der Sprunglink.
- **Vertiefung** (`inset 0 0 0 1px var(--border)` bzw. `var(--border-strong)`):
  Innenflächen, Eingabefelder, Auswahlkacheln.

**Die Regel vom fehlenden Rahmen.** Eine Fläche wird nie mit einem grauen
`border` abgesetzt. Sie bekommt `.panel` (Schatten + Ring) oder `.panel-inset`
(Vertiefung). Ein sichtbarer grauer Rahmen ist ein Rückfall in die alte
Gestaltung.

**Die Drei-Stufen-Regel.** Es gibt Knopf, Karte, Dialog — und nichts dazwischen.
Wer eine vierte Schattenstufe braucht, hat wahrscheinlich ein Layoutproblem.

## Formen

Rechteckig mit weicher Rundung, **nirgends Pillenform**. Die Radien bilden eine
Leiter, und die Stufe sagt, wie groß das Ding ist: Zustandsmarke 6 px, Knopf und
Feld 8 px, Innenfläche 10 px, großer Knopf und Auswahlkachel 12 px, Karte 14 px,
Dialog 16 px.

**Die Radien-Leiter.** 6 · 8 · 10 · 12 · 14 · 16. Keine Zwischenwerte, und
nichts darunter: Auch eine 20-px-Marke nimmt 6 px, kein 4 px. `border-radius:
999px` tragen nur vier Dinge — der Schaltergriff, der Punkt der Zustandsmarke,
der **Zahlenkreis** (Schritt- und Abschnittsnummer, 24 px, `accent-soft` wenn er
der aktuelle ist) und der **Fortschrittsbalken**. Eine Marke mit Text ist nie
eine Pille, sondern ein Chip mit 6 px.

**Die Icon-Satz-Regel.** Icons kommen ausschließlich aus einem eigenen
Inline-SVG-Satz: 20-px-Raster, Linienstärke 1,5, runde Enden, `aria-hidden`.
Keine Unicode-Zeichen als Symbole, keine Emoji, keine zweite Icon-Bibliothek.
Fehlt ein Symbol, wird es im selben Stil ergänzt.

## Bausteine

### Knöpfe

- **Form:** weiche Rundung (8 px; großer Knopf 12 px), feste Höhen 32 / 40 / 44 px.
- **Primary:** Tinte auf hell, weiße Schrift, `--shadow-sm`. Die Standardaktion.
- **Accent:** Orange mit weißer Schrift und orange getöntem Schatten. Höchstens
  **einmal je Seite**.
- **Secondary:** weiße Fläche mit kräftiger Hairline. **Ghost:** nur Text in
  Halbtinte. **Danger:** roter Text mit rötlichem Ring auf transparenter Fläche.
- **Hover / Focus:** Farbe wandert in 200 ms auf `ease-fluid`; gedrückt zieht
  sich der Knopf auf 98 % zusammen. Der Fokusrahmen kommt aus der globalen
  `:focus-visible`-Regel.
- **Disabled:** 45 % Deckkraft, keine Zeigerereignisse.
- Ein Link im Knopfgewand ist ein Link mit Knopf-Optik — nie ein Knopf in einem Link.

### Eingabefelder

- **Optik:** Kartenfläche, 40 px hoch, 8 px Radius, innerer 1 px Ring als
  Hairline. Beschriftung darüber in 13 px Satzschrift.
- **Die Höhen des Systems:** 28 px und 32 px das Zellenfeld, **36 px der
  Schalter**, 40 px Feld und Standardknopf, 44 px der große Knopf. Eine Zeile,
  die Felder neben einen Schalter stellt, richtet ihre Felder auf 36 px aus,
  damit die Zeile eine Kante hat. Andere Höhen gibt es nicht.
- **Fokus:** der innere Ring wird 1,5 px stark und orange. Felder sind die eine
  bewusste Ausnahme von der globalen Fokusregel: Sie setzen `outline: none` und
  ersetzen den Außenrahmen durch diesen inneren Ring. Im Fehlerzustand bleibt der
  Ring rot und wird bei Fokus kräftiger (2 px) — ein Feld ohne jede
  Fokusanzeige ist ein Fehler.
- **Der Ring wird in genau einem Ausdruck gewählt** (`error ? … : …`), nie als
  zwei Schatten-Klassen nebeneinander. Zwei davon haben dieselbe Spezifität, und
  dann entscheidet die Reihenfolge im erzeugten CSS statt der in der
  Klassenliste: Bis zum 11.09.2026 gewann so der Hairline über den Fehlerring,
  und ein Feld mit Fehlertext sah unauffällig aus.
- **Fehler:** roter innerer Ring, Fehlertext **unter** dem Feld, per
  `aria-describedby` verknüpft, `role="alert"`. Nie eine stille Ablehnung.
- **Disabled:** Grundton statt Kartenfläche, Halbtinte, `not-allowed`.
- **In einer Tabellenzelle** gilt das Zellenfeld: 32 px statt 40, ohne eigene
  Beschriftung (die Spalte benennt sie schon, deshalb trägt jedes Feld ein
  `aria-label` mit dem Namen seiner Zeile), sonst derselbe Fokusring. Zwei
  Erscheinungen: **still** — die Fläche kommt erst bei Berührung, für Listen,
  die man überfliegt — und **fest**, mit sichtbarem Ring, für Matrizen, in die
  man einträgt. Ein ungespeicherter Wert liegt auf `accent-soft`.

### Karten

- **Ecken:** 14 px (`.panel`), Innenflächen 10 px (`.panel-inset`).
- **Grund:** Karte auf Grund; die Innenfläche kehrt das um.
- **Schatten:** `--shadow-card` plus Hairline-Ring; die Innenfläche nur ein
  `inset`-Ring.
- **Rahmen:** keiner.

### Tabellen

- Liegen in einer `.panel`-Fläche mit `overflow: hidden`; feste Spaltenbreiten
  verteilen den Platz gleichmäßig, lange Texte brechen um, statt die Tabelle
  aufzublähen.
- **Kopf:** 11 px Versalien in Halbtinte auf leicht getöntem Grund, Trennlinie
  darunter.
- **Zellen:** 12 px Innenabstand, ruhige Trennlinie, letzte Zeile ohne. Zahlen
  rechtsbündig in Mono.
- **Zeilen:** anklickbare Listen führen über einen **echten Link in der ersten
  Zelle**, nicht über `onClick` auf der Zeile — sonst ist die Liste mit der
  Tastatur unerreichbar. Zellen, die ihre Zeile benennen, sind `rowHeader`
  (`<th scope="row">`).
- **`dense`** für Listen mit vielen Spalten, sonst die lesbare Größe.
- Eine Tabelle, die **für sich steht**, bringt ihre eigene `.panel`-Fläche mit.
  Eine Tabelle **in** einer Karte benutzt ein schlichtes `<table>` mit denselben
  Zeilenlinien — sonst Karte in Karte.

### Reiter

- **Segment-Reiter** schalten zwischen Sichten auf **dieselbe** Liste um:
  Aktiv/Archiv, Monat/Quartal/Jahr, Alle/Zugeordnet/Neu. Gewählt ist
  `accent-soft` mit 1,5 px Akzent-Innenring und halbfetter Schrift, ungewählt die
  Kartenfläche mit Hairline — dieselbe Optik wie jede andere Auswahl im Haus.
  32 px hoch, 13 px, `role="tab"` mit `aria-selected`.
- Ein `href` macht einen Reiter zum echten Link (teilbar, im Verlauf), ein
  Klick-Handler zum Knopf für örtlichen Zustand.

### Zustandsmarken (Chips)

- **Form:** eckig mit 6 px Rundung — **keine Pille**. Fläche ist die Meldefarbe
  bei 6–10 %, Text die volle Farbe, davor ein kleiner Punkt.
- **Zustand:** Der Zustand steht immer als Wort da; der Punkt ist Dekoration und
  `aria-hidden`.

### Navigation

- Dunkler Seitenrahmen, 13,5 px Medium. Inaktiv: Halbton auf dem Rahmen, bei
  Berührung 5 % Weiß. **Aktiv:** 9 % Weiß, weiße Schrift, oranges Icon und ein
  3 px breiter oranger Balken am linken Rand, dazu `aria-current="page"`.
- Kopf trägt die Wortmarke, Fuß den Nutzer mit Rolle, Themenschalter und
  Abmelden. Eingeklappt bleiben nur die Icons; die Beschriftungen gehen in
  `sr-only`, nicht weg.
- Vor dem Inhalt steht der **Sprunglink** (`.sprunglink`): unsichtbar, bis er
  den Fokus bekommt, dann fährt er herunter.

### Dialoge

- Karte mit 16 px Rundung, `--shadow-float`, Hintergrund `shell` bei 40 % mit
  2 px Weichzeichnung. Kopf mit Titel und Beschreibung, Inhalt scrollt, Fuß
  trägt die Aktionen rechts auf getöntem Grund.
- Als Seitenblatt kommt er von rechts herein. Bewegung: 160 ms Hintergrund,
  240 ms Karte, 280 ms Blatt.
- Der bestätigende Knopf im Fuß ist **Tinte**, nicht Orange — das Orange gehört
  der Hauptaktion der Seite dahinter, und zwei orange Flächen übereinander heben
  sich gegenseitig auf. Zerstörendes ist `danger`.
- **Löschen niemals über `window.confirm`** — eigener Dialog oder
  Rückgängig-Möglichkeit; kaufmännische Dinge werden archiviert, nicht gelöscht.

### Auswahlkacheln (Signatur-Baustein)

Auswahl als Kachelreihe statt Dropdown — das Kernmuster des Hauses. Gleiche
Höhe, gleiche Ränder, `role="radiogroup"`. Die gewählte Kachel trägt
`accent-soft` mit 1,5 px orangem Innenring und halbfetter Beschriftung;
ungewählte liegen auf dem Grund mit leichter Hairline. Optional links ein
Strichbild oder ein Farbfeld, darunter ein Hinweis in 12 px.

**Ein gültiger Zustand bekommt eine Kachel.** „Kunde hat eigene Schrauben" ist
eine Entscheidung, kein fehlender Wert — sie steht als dritte Kachel „Keine" da,
nicht als unsichtbares Abwählen der gewählten. Wo „nichts" eine Bedeutung trägt,
gehört sie hingeschrieben.

**Die Auswahl sieht überall gleich aus.** Gewählt heißt `accent-soft` mit 1,5 px
Akzent-Innenring — in den Kacheln, in den Listen, in den Matrizen. Volles Orange
als Fläche gehört der Hauptaktion, nie einer Auswahl. (Bis zum 11.09.2026 gab es
dafür vier verschiedene Optiken.)

### Bewegung

Eine Kurve für alles: `--ease-fluid` (`cubic-bezier(0.32, 0.72, 0, 1)`). Farb-
und Hover-Wechsel 150–200 ms, Dialoge 160/240/280 ms, Inhalte `.rise-in` 360 ms,
Seitenrahmen 300 ms. Bei `prefers-reduced-motion: reduce` fallen alle
Animationen und das weiche Scrollen aus.

## Do's and Don'ts

### Do:

- **Do** nur Tokens verwenden — die Farbwelt hängt an `tokens.css`, nicht an den
  Komponenten.
- **Do** Flächen als `.panel` oder `.panel-inset` bauen und Rahmen als Hairline.
- **Do** jede Zahl, die verglichen oder abgelesen wird, in `.num` setzen.
- **Do** Fehler am Feld zeigen: Text darunter, `aria-describedby`, roter Ring.
  Grenzhinweise in Warnfarbe, bevor etwas ausgelöst wird.
- **Do** jede Auswahl per Tastatur erreichbar machen — Kacheln sind Knöpfe mit
  `role="radio"`, Listenzeilen führen über einen echten Link.
- **Do** kluge Vorgaben setzen: kein leeres Pflichtfeld, und das Feld mit der
  nächsten erwarteten Eingabe wird hervorgehoben.
- **Do** beide Erscheinungsbilder prüfen, wenn eine Farbe angefasst wird — hell
  und dunkel führen bei Orange zu gegenläufigen Anforderungen.

### Don't:

- **Don't** ein zweites Orange auf eine Seite bringen. Eine Hauptaktion, ein Akzent.
- **Don't** Hex-Werte oder `gray-*`/`slate-*` in Komponenten schreiben.
- **Don't** einen grauen Rahmen um eine Fläche legen.
- **Don't** einen Zustand nur über Farbe ausdrücken — das Wort steht immer daneben.
- **Don't** Versalien außerhalb von `.eyebrow` und Tabellenkopf verwenden, und
  nichts unter 11 px setzen.
- **Don't** `focus:ring` oder `focus:border` benutzen und den Fokus nirgends ganz
  abschalten. Knöpfe, Links und Kacheln nehmen die globale
  `:focus-visible`-Regel; nur Eingabefelder tauschen sie bewusst gegen den
  inneren Ring.
- **Don't** Unicode-Zeichen oder Emoji als Symbole einsetzen oder eine zweite
  Icon-Bibliothek laden.
- **Don't** `window.confirm` zum Löschen verwenden — eigener Dialog, und
  Kaufmännisches wird archiviert.
- **Don't** Breiten oder Höhen springen lassen: Bildlaufplatz über
  `scrollbar-gutter`, Ladezustände über ein Skelett.

---

## Gilt nur im DAKO

Dieser Abschnitt ist Kontext, keine Vorgabe. Er erklärt, woher einige Regeln
kommen, und was in einem anderen Projekt **nicht** gilt.

- **Die 3D-Ansicht ist eine Zeichnung, kein Rendering.** Flache Farben je Rolle,
  klare Kanten, keine Beleuchtung, keine Schatten. Verbindlich sind die
  eingegebenen Maße, nicht das Bild. — Daher stammt die Haltung „Linie statt
  Fläche" beim Icon-Satz.
- **`--canvas-height`.** Die Höhe der Zeichenfläche steht an genau einer Stelle
  (`max(380px, calc(100vh - 17rem))`), damit die Bühne beim Schrittwechsel nicht
  springt. Ein Projekt ohne Zeichenfläche braucht das Token nicht — die Regel
  dahinter („eine Höhe, an einer Stelle") schon.
- **Der Positions-Editor.** Flächenliste links, Grafik in der Mitte, Eingaben
  rechts; die Breiten bleiben in jedem Zustand gleich. Bauteil-Schritte ohne
  Grafik nehmen dasselbe Raster ohne Mittelspalte: links die Einstellungen,
  rechts die Stückliste in 336 px, die beim Scrollen stehen bleibt.
- **Die Schrittleiste** einer Position führt durch eine Reihenfolge, zeigt
  Nummern, Haken und Schlösser — sie ist etwas anderes als die Segment-Reiter.
- **Fachsprache des Handwerks.** Traufe, First, Ortgang, Sparrenlänge, Kehle —
  die Begriffe der Baustelle, nicht die der Software. Die übertragbare Regel
  lautet: Beschriftungen nennen die Sache, Hilfetexte erklären sie in einem Satz.
- **Bausteine** liegen im DAKO als React-Komponenten unter
  `src/components/ui/` (Button, TextField, Select, NumberFieldM, CellField,
  Table, StatusChip, Modal, PageHeader, OptionTiles, Switch, SegmentedTabs,
  Kennzahl, ListSkeleton, Toast, Icons). Wer den Stack teilt, kopiert sie; wer
  nicht, baut sie nach diesem Dokument nach.
