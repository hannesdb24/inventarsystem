# Designgrundlagen des Hauses

Die Gestaltung des DAKO, herausgelöst und ohne Tailwind, damit andere Projekte
sie benutzen können.

| Datei | Was drinsteht |
| --- | --- |
| [`tokens.css`](tokens.css) | Die Werte: Farben hell und dunkel, Radien, Höhen, Schatten, Bewegungskurve — dazu die Grundregeln, die überall gleich sind (`.panel`, `.panel-inset`, `.num`, `.eyebrow`, Fokusrahmen, Sprunglink, Dialog-Animationen). Reines CSS, kein Rahmenwerk. |
| [`DESIGN.md`](DESIGN.md) | Das Regelwerk: Nordstern, Farbbedeutung, Schriftleiter, Layout, Tiefe, Formen, Bausteine, Do's and Don'ts. Am Ende ein Abschnitt „Gilt nur im DAKO" — Kontext, keine Vorgabe. |
| [`UX-LEITLINIEN.md`](UX-LEITLINIEN.md) | Die zehn Bedienregeln, aus dem Konfigurator-Kontext gelöst. |

## Einbinden

```html
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" />
<link rel="stylesheet" href="/design/tokens.css" />
```

`tokens.css` gehört **vor** das eigene Stylesheet, damit ein Projekt eigene
Werte nachschieben kann. Im Inventarsystem liefert `server.js` den Ordner aus:

```js
app.use('/design', express.static(path.join(__dirname, 'design')));
```

Der Schalter für das dunkle Erscheinungsbild setzt `data-theme="dark"` bzw.
`"light"` auf `<html>`. Ohne Attribut entscheidet die Systemeinstellung. Damit
beim Laden nicht kurz das falsche Thema aufblitzt, gehört das Setzen in ein
kleines Skript **vor** dem ersten Rendern (im Inventarsystem im `<head>`).

## Was hier nicht liegt

Fertige Knöpfe, Tabellen und Dialoge als CSS-Klassen. Das ist Absicht: Jedes
Projekt hat davon schon eigene, und ein zweiter Satz daneben wäre eine zweite
Quelle der Wahrheit. `DESIGN.md` sagt, wie sie auszusehen haben; die Umsetzung
bleibt beim Projekt.

Im DAKO liegen die Bausteine als React-Komponenten unter `src/components/ui/`
(Button, TextField, Select, NumberFieldM, CellField, Table, StatusChip, Modal,
PageHeader, OptionTiles, Switch, SegmentedTabs, Kennzahl, ListSkeleton, Toast,
Icons). Wer den Stack teilt (Next + Tailwind v4), kopiert sie von dort.

## Herkunft und Pflege

Quelle ist das DAKO, Stand **18.09.2026**:

- `Dako/src/app/globals.css` → `tokens.css`
- `Dako/DESIGN.md` → `DESIGN.md` (DAKO-Spezifisches in den Schlussabschnitt verschoben)
- `Dako/docs/UX-LEITLINIEN.md` → `UX-LEITLINIEN.md`

Ändert sich im DAKO ein Token, gehört es hier nachgezogen — die Werte sind
bewusst identisch, damit die Anwendungen des Hauses nebeneinander nicht
auseinanderlaufen. Besonders empfindlich ist der Akzent: Wer ihn anfasst, muss
**hell und dunkel** prüfen, die Anforderungen laufen dort gegeneinander (siehe
Kommentare in `tokens.css`).

## Offener Punkt

`--shell-faint` wird in `public/index.html` benutzt, ist aber weder dort noch in
`tokens.css` definiert (Stand 18.09.2026, 11:36 Uhr). Es ist ein
projekteigenes Token des Inventarsystems — kein DAKO-Token —, gehört also in den
Inline-Block von `index.html`, nicht hierher. Vorschlag:
`--shell-faint: rgba(245, 246, 248, 0.5);`
