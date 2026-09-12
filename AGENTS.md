# Machen – dauerhafter Kontext für KI-Agenten

## Projektziel

Machen ist eine ruhige, lokale Desktop-App für persönliche Aufgaben. Sie basiert auf
`todo.txt`: Die Dateien gehören den Nutzenden, es gibt kein Konto, keine Cloud-Pflicht
und keinen Lock-in. Die Kernfrage bei jeder Änderung lautet: Macht sie die tägliche
Aufgabenarbeit klarer, schneller oder verlässlicher?

## Produktprinzipien

- **Heute zuerst.** Die Aufgabenliste ist die Hauptfläche, kein Statistik-Dashboard.
- **Ruhig statt verspielt.** Wenig visuelles Rauschen, keine dekorativen Kachelraster,
  Farbverläufe oder überflüssigen Animationen.
- **Dateien bleiben kompatibel.** `todo.txt` und `done.txt` dürfen nicht durch neue
  Funktionen unbrauchbar werden. `id:`-Werte immer erhalten, weil sie Metadaten
  verknüpfen.
- **Lokale Daten schützen.** Keine stillen Netzwerkzugriffe, Telemetrie oder riskanten
  Überschreibungen von Aufgaben- und Metadatendateien.
- **Deutsch und Englisch.** Neue sichtbare Texte über die bestehende i18n-Struktur
  pflegen, nicht als verstreute harte Strings einbauen.

## Technischer Überblick

- Renderer/UI: `src/` (Vanilla JavaScript, HTML und CSS)
- Electron-Hauptprozess und Dateispeicher: `electron/`
- Tests: `tests/` (Node-Test-Runner; Playwright für UI/E2E)
- Build-, Paket- und Release-Skripte: `scripts/`
- Designvorgaben: `design.md`

Die App benötigt Node.js 24 oder neuer. Nützliche Befehle:

```sh
npm ci
npm start
npm run check
npm test
npm run test:ui
```

## Arbeitsweise

1. Vor Änderungen passende bestehende Implementierung und Tests lesen.
2. Änderungen klein und fokussiert halten; keine Umstrukturierungen ohne klaren Nutzen.
3. Bei Anpassungen an Dateiformaten oder Speicherlogik Abwärtskompatibilität und
   Fehlerfälle prüfen.
4. Bei UI-Arbeit `design.md` beachten und helle sowie dunkle Darstellung mitdenken.
5. Relevante Checks ausführen und ehrlich nennen, was nicht geprüft werden konnte.
6. Bestehende, nicht zugehörige Änderungen im Arbeitsverzeichnis nicht verwerfen oder
   überschreiben.

## Definition of Done

Eine Aufgabe ist erst fertig, wenn die gewünschte Nutzung funktioniert, betroffene
Texte übersetzt sind, die Datenintegrität gewahrt bleibt und passende Tests bzw.
Checks erfolgreich sind.
