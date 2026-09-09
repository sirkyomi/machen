# Machen

Eine lokale Todo-App mit globaler Schnellerfassung, Tagesansicht und Verlauf.
Gebaut mit Electron. Deine Aufgaben bleiben in `todo.txt` – ohne Konto.

## Funktionen

- **Schnell erfassen:** `Ctrl+Shift+Space` bzw. `Cmd+Shift+Space` öffnet ein kompaktes Popup, auch außerhalb der App. Der Shortcut ist einstellbar. Ein Klick außerhalb oder Escape blendet das Popup aus.
- **Details bei Bedarf:** Projekt, Kontext, Priorität, Fälligkeit und Notizen direkt beim Erstellen ergänzen. Die Schnellerfassung wächst beim Ausklappen mit.
- **Tagesansicht und Verlauf:** Offene Aufgaben von vorher bleiben sichtbar. Im Verlauf zu einem Tag springen und Änderungen nachvollziehen.
- **Projekte und Kontexte:** Aus vorhandenen Einträgen wählen oder neue anlegen. Chips halten die Aufgabenliste übersichtlich.
- **Filter und Archiv:** Projekt, Kontext, Priorität und Fälligkeit kombinieren; erledigte Aufgaben nach `done.txt` archivieren und zurückholen.
- **Zusätzlicher Kontext:** Notizen, E-Mail-Text und Datei-Anhänge in den Aufgabendetails.
- **Deutsch und Englisch**, Hell-, Dunkel- und Systemmodus, eigene Kalender und Auswahlmenüs, lokal eingebundene Lucide-Icons und Public Sans.

## Lokal starten

Voraussetzung: Node.js 24 mit npm und ein Desktop unter Windows, macOS oder Linux.

```sh
npm ci
npm start
```

Beim ersten Start einen Ablageordner wählen. Eine vorhandene `todo.txt` wird eingelesen.
Den Ordner kannst du später in den Einstellungen wechseln. Das öffnet die andere Ablage;
es verschiebt keine Daten. Zum Umziehen den gesamten Ablageordner kopieren.

Das Schließen des Hauptfensters lässt Machen im Tray weiterlaufen. Vollständig beenden
kannst du die App über das Tray-Menü oder die Einstellungen. Autostart ist unter
Windows und macOS vorgesehen.

## Datenformat

```text
(A) 2026-09-09 Angebot senden +Arbeit @mail due:2026-09-11 id:UUID
x 2026-09-10 2026-09-09 Angebot senden +Arbeit @mail due:2026-09-11 pri:A id:UUID
```

| Datei | Inhalt |
| --- | --- |
| `todo.txt` | Aktive Aufgaben und noch nicht archivierte Abschlüsse |
| `done.txt` | Archivierte Aufgaben |
| `.machen.json` | Notizen, Anhangsverweise und Ereignisverlauf |
| `attachments/` | Kopien hinzugefügter Dateien |
| `todo.txt.bak`, `done.txt.bak` | Stand vor dem letzten Schreibvorgang |

`id:`, `due:` und `pri:` verwenden die Schlüssel-Wert-Erweiterung des todo.txt-Formats.
Die ID verbindet Aufgaben mit Zusatzdaten; bitte beim externen Bearbeiten beibehalten.
Unbekannte Felder bleiben erhalten. Projekt- und Kontextnamen mit Leerzeichen oder
Sonderzeichen werden URL-kodiert; andere todo.txt-Programme können diese Tokens roh anzeigen.
Beim Speichern werden Zeilen normalisiert.

Externe Änderungen werden beim Fokuswechsel und alle 30 Sekunden eingelesen.
Gleichzeitige Schreibzugriffe mehrerer Apps oder Geräte sind nicht konfliktfrei;
Cloud-Synchronisation kann Konfliktkopien erzeugen. Schreibvorgänge verwenden einen
Wiederherstellungsdatensatz. Der Ereignisverlauf ist kein vollständiges Backup
historischer Notizen; Tageslisten zeigen den aktuellen Aufgabenstatus.

Die Paket-ID lautet `machen`, der App-Datenordner `Machen`. Zusatzdaten liegen in
`.machen.json`. Es gibt keine Migration früherer Einstellungen oder Zusatzdaten.

Ab 0.2.4 wird die neue Paket-ID verwendet. Ältere Installationen müssen einmalig
mit dem neuen Installer ersetzt werden; danach laufen Updates unter `machen`.
Die alte Installation kann anschließend deinstalliert werden.

## Entwicklung und Tests

```sh
npm run check
npm test
npm run test:ui
```

`check` prüft die JavaScript-Syntax. Die Unit-Tests prüfen Speicherung und Wiederherstellung.
Die UI-Tests benötigen einen aktiven Desktop und verwenden eigene temporäre Datenordner.
Screenshots entstehen unter `test-results/`. Zum Prüfen einer gepackten App unterstützen
`tests/controls.cjs`, `tests/language.cjs`, `tests/machen.cjs` und
`tests/contexts-archive.cjs` die Umgebungsvariable `MACHEN_EXECUTABLE`.

| Pfad | Zweck |
| --- | --- |
| `electron/` | Fenster, IPC, globale Shortcuts und Speicherung |
| `src/` | Oberfläche, Styles, Komponenten und Übersetzungen |
| `assets/` | App-Icons und Lizenzhinweise |
| `tests/` | Unit- und Electron-Bedienprüfungen |
| `scripts/` | Prüf-, Icon- und Paketwerkzeuge |

Übersetzungen stehen in `src/i18n.js`. Icons mit `node scripts/icons.cjs` neu erzeugen.
`scripts/localize-source.cjs` ist eine einmalige Migration und darf nicht auf bereits
übersetzte Quellen angewendet werden.

## Pakete und Installer

```sh
npm run package
dotnet tool install vpk --tool-path .tools --version 1.2.110-ge826545
npm run release
```

Für Velopack wird das .NET-10-SDK benötigt. Jede Plattform wird auf ihrem eigenen
Betriebssystem gebaut. Die gepackte App liegt unter
`out/<Version>/Machen-<Plattform>-<Architektur>/`, Installer und portable Pakete unter
`releases/machen/`. Updates kommen aus den öffentlichen Releases von
[`sirkyomi/machen`](https://github.com/sirkyomi/machen).

Windows wurde lokal gebaut und getestet. macOS und Linux sind als Build-Ziele
konfiguriert, aber noch nicht auf echter Hardware validiert. Unter Wayland hängt der
globale Shortcut vom GlobalShortcuts-Portal und den Desktop-Freigaben ab. Die
installierte Desktop-ID muss zu `machen.desktop` passen.

Die Builds sind derzeit unsigniert. Code-Signing und macOS-Notarisierung sind nicht
konfiguriert.

## GitHub-Workflows

- **CI:** Syntaxprüfung und Unit-Tests bei Pushes und Pull Requests unter Windows, macOS und Linux.
- **Desktop packages:** Jeder Push auf `main` baut und veröffentlicht nach erfolgreichen Prüfungen alle Plattformen einschließlich Velopack-Paketen und Feed-Dateien. Manuell lässt sich derselbe Ablauf auf `main` starten.

Die Version wird automatisch ermittelt: höchste stabile Version aus den `v*`-Tags
und der Basis in `package.json`, anschließend Patch um eins erhöhen. Ohne Tags startet
die aktuelle Basis `0.2.5` mit `0.2.6`. Alle Plattformen erhalten dieselbe Version in
`package.json` und `package-lock.json`, bevor die App gebaut wird. Der Release-Tag
zeigt auf den auslösenden Commit. Tags sind damit die Quelle für veröffentlichte
Versionen; die beiden Dateien im Quellbranch bleiben auf ihrer lokalen Basisversion.
Es entstehen keine automatischen Versions-Commits oder Push-Schleifen.

Release-Läufe teilen sich eine Warteschlange (bis zu 100 wartende Läufe), sodass
Versionsermittlung und Veröffentlichung nacheinander stattfinden. Schlägt ein Build
fehl, wird nichts veröffentlicht. Tags werden erst beim Anlegen des Release-Entwurfs
erstellt. Nach einem fehlgeschlagenen Upload kann der fehlgeschlagene Job erneut
gestartet werden. Ein vollständig neu gestarteter Workflow ermittelt eine neue Version.
Veröffentlichte Versions-Tags nicht löschen oder wiederverwenden.

Für einen späteren Sprung auf eine neue Minor- oder Major-Reihe kann die Basisversion
manuell angehoben werden; der nächste Build erhöht auch diese Basis um einen Patch.
Die Versionslogik steht in `scripts/release-version.cjs`. Die Queue verwendet die
[GitHub-Actions-Concurrency-Funktion](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

## Updates in der App

Ab Version 0.2.3 prüft eine Velopack-Distribution zehn Sekunden nach dem Start und
danach alle sechs Stunden auf stabile GitHub-Releases. Unter Einstellungen kannst
du auch manuell prüfen. Download und Installation benötigen einen Klick; vor dem
Neustart warnt ein App-Dialog vor nicht gespeicherten Eingaben in beiden Fenstern.
Ein heruntergeladenes Update bleibt bis zur ausdrücklichen Installation bereit.
Entwicklungsstarts und reine Electron-Paketordner ohne Velopack unterstützen keine Updates.

Die Quelle ist fest auf das öffentliche Repository eingestellt. Es werden keine
GitHub-Tokens in die App eingebaut. Plattform und Architektur verwenden getrennte
Kanäle (`win-x64`, `osx-arm64`, `linux-x64` auf den derzeitigen CI-Runnern).
Alle Dateien des jeweiligen Velopack-Ausgabeordners müssen im Release bleiben,
insbesondere `releases.<channel>.json` und die `.nupkg`-Pakete. Der Workflow
veröffentlicht zunächst einen Entwurf und schaltet ihn erst nach dem Upload frei.
Bereits veröffentlichte Versionen werden nicht überschrieben.

Für die erste Installation mit Updates den neuen Velopack-Installer verwenden;
ältere Versionen ohne Update-Integration müssen einmal manuell aktualisiert werden.
CI erzeugt derzeit Vollpakete; Delta-Updates sind optional und erfordern frühere
Pakete beim Build. Ein kompletter Live-Update-Test benötigt zwei veröffentlichte
Versionen und eine installierte Ausgangsversion.

## English

Machen is a local Electron task app with global quick capture, a daily view, history,
project/context chips, filters and an archive. Tasks are stored in `todo.txt` and
`done.txt`; notes and attachments live alongside them. No account is required.

Run `npm ci` and `npm start`, then choose a storage folder. Select **English** in the
sidebar or Settings. Language and theme changes apply to both windows and preserve
unsaved drafts. See the commands above for tests and packaging. Windows has been
validated locally; macOS and Linux still require platform testing.

## Lizenz

[MIT](LICENSE). Hinweise zu mitgelieferten Drittanbieter-Assets stehen in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Geplante Tage

In der Tagesansicht neu angelegte Aufgaben werden dem ausgewählten Tag zugeordnet.
Für morgen geplante Aufgaben erscheinen erst morgen in der Tagesliste; offene Aufgaben
bleiben danach als Übertrag sichtbar. In „Alle Aufgaben“ sind auch zukünftige Aufgaben
zu sehen. Der Planungstag wird als `t:YYYY-MM-DD` in todo.txt gespeichert; Erstellungsdatum
und Ereignisverlauf behalten den tatsächlichen Erfassungszeitpunkt. Fälligkeit (`due:`)
ist unabhängig davon. Die globale Schnellerfassung legt Aufgaben standardmäßig für heute an.
