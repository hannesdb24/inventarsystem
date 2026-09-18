# UX-Leitlinien des Hauses

Destillat aus der UX-Recherche zum DAKO und den im MAKO etablierten
Bedienmustern. Die Regeln gelten für alle neuen Oberflächen — wer davon
abweicht, schreibt hier auf, warum.

Übertragen aus `Dako/docs/UX-LEITLINIEN.md` (Stand 18.09.2026). Wo eine Regel
ursprünglich am Konfigurator hing, steht die allgemeine Fassung zuerst und der
DAKO-Fall als Beispiel dahinter.

## 1. Assistent nur beim Anlegen, danach Arbeitsfläche

Das Anlegen ist ein kurzer Assistent: Vorlage wählen → wenige Angaben → fertig.
Danach gibt es keine Schritte mehr, sondern eine frei bearbeitbare
Arbeitsfläche. Assistenten führen Einsteiger; die Arbeitsfläche macht
Routiniers schnell.

## 2. Strichbilder statt Worte

Formen, Richtungen und Varianten werden als Piktogramme angeboten: Die Form
erkennt man an einem Strichbild schneller als an der Beschreibung „vier
Flächen, zwei Trapeze". Gilt überall, wo eine Auswahl eine Gestalt hat.

## 3. Sofortige Rückmeldung, keine Berechnen-Knöpfe

Jede Änderung aktualisiert alle abhängigen Anzeigen sofort. Ein Knopf
„Berechnen" ist ein Eingeständnis, dass die Anwendung nicht mitdenkt.
Festgeschrieben wird erst beim Speichern — die laufende Rechnung darf im
Browser passieren, die verbindliche gehört auf den Server.

## 4. Nur abfragen, was jemand ablesen kann

Eingabefelder fragen ausschließlich Größen ab, die ein Mensch vor sich hat.
Abgeleitete Größen zeigt die Anwendung an, fragt sie aber nie ab.

Im DAKO: Trauflänge, Sparrenlänge, Firstlänge werden abgefragt; Fläche,
Plattenzahl und Neigung ergeben sich daraus. Eingabe in **Metern mit Komma**
(so reden Kunden), intern rechnet alles in Millimetern (Haus-Konvention).

## 5. Kluge Vorgaben statt leerer Pflichtfelder

Jede Vorlage startet mit realistischen Standardwerten — es gibt keinen Zustand
„leeres Formular". Der Nutzer korrigiert Werte, statt sie zu erfinden. Das
orange Akzent-Highlight markiert das Feld, in dem als Nächstes eine Eingabe
erwartet wird.

## 6. Stabile Bühne

Das Spaltenraster der Arbeitsfläche behält seine Breiten in jedem Zustand.
Nichts springt: Bildlaufplatz ist dauerhaft reserviert, Flächen behalten ihre
Höhe, Ladezustände zeigen ein Skelett statt eines Worts.

## 7. Auswahl ist überall dieselbe Auswahl

Es gibt genau EINEN Auswahlzustand, und er sieht an jeder Stelle gleich aus —
in der Liste, in der Kachelreihe, in der Grafik. Was an einer Stelle gewählt
wird, ist an allen anderen synchron hervorgehoben.

## 8. Eine Zeichnung, kein Rendering

Grafiken der Anwendung sind schematisch: flache Farben je Rolle, klare Kanten,
keine Beleuchtung, keine Schatten. Sie erklären, sie schmeicheln nicht.
Verbindlich sind die eingegebenen Werte, nicht das Bild. Wo eine Kamera frei
beweglich ist, gibt es zusätzlich feste Standpunkte, damit niemand die
Orientierung verliert.

## 9. Fehler verhindern, nicht melden

Grenzwerte kommen aus den Stammdaten: Wird einer überschritten, sagt die
Anwendung das **an der Stelle, an der es entsteht** — bevor etwas ausgelöst
wird. Fehlen Stammdaten, erscheint ein verständlicher Hinweis mit Link zur
Pflege statt einer Rechnung mit falschen Zahlen.

## 10. Fachsprache des Fachs

Die Begriffe der Nutzer, nicht die der Software. Beschriftungen nennen die
Sache, Hilfetexte erklären sie in einem Satz.

Im DAKO sind das Traufe, First, Ortgang, Sparrenlänge, Kehle — die Begriffe der
Baustelle.
