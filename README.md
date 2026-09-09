# Machen

**A calm, local task app built around `todo.txt`.**

Machen keeps your tasks in files you own. There is no account, no cloud service to sign up for, and no lock-in. Capture a thought from anywhere, plan your day, and keep the detail out of the way until you need it.

<p>
  <a href="https://github.com/sirkyomi/machen/releases/latest">
    <img src="https://img.shields.io/badge/Download%20Machen-Latest%20release-4f7df3?style=for-the-badge" alt="Download Machen">
  </a>
</p>

[Windows installer](https://github.com/sirkyomi/machen/releases/latest/download/machen-win-x64-Setup.exe) · [macOS installer](https://github.com/sirkyomi/machen/releases/latest/download/machen-osx-arm64-Setup.pkg) · [Linux AppImage](https://github.com/sirkyomi/machen/releases/latest/download/machen-linux-x64.AppImage)

> The current macOS build is for Apple Silicon. Windows, macOS, and Linux packages are unsigned at the moment, so your operating system may ask for confirmation during installation.

## Your day, in one place

![Machen's daily view in English](docs/screenshots/today.png)

The daily view brings together what is due today and any unfinished work carried over from earlier days. Use the week strip to plan ahead, jump to a date, or search and filter tasks by project, context, priority, and due date.

Projects and contexts appear as compact chips, so the list stays easy to scan. Mark a task complete with one click, then archive completed work to `done.txt` when you are ready.

## Capture from anywhere

![Expanded quick capture](docs/screenshots/quick-capture.png)

Press `Ctrl+Shift+Space` on Windows and Linux, or `Cmd+Shift+Space` on macOS, to open Quick Capture even while Machen is in the background. The shortcut can be changed in Settings.

Start with a task title and press the arrow to reveal project, context, priority, due date, and notes. The popup hides when you click away or press Escape, while unfinished text is kept for the next time you open it.

Tasks created for a future day stay on that day. A due date is separate from the day a task is planned for.

## Details when they matter

Select an existing task to add notes, paste email context, set a due date or priority, and attach files. These details stay out of the daily list until you need them.

The **History** view lets you revisit a day and see what was added, completed, edited, archived, or restored. The **Archive** keeps finished tasks available without cluttering your working list.

## Fits your setup

![Settings in dark mode](docs/screenshots/settings.png)

Machen supports English and German, plus light, dark, and system themes. It can stay available in the system tray after you close the main window, and can launch at sign-in on Windows and macOS.

Choose a storage folder on first launch. You can use a normal local folder or one managed by your preferred sync service. Changing the folder in Settings opens that folder; it does not move your existing data.

## Your files stay yours

Machen reads and writes the familiar [`todo.txt`](https://github.com/todotxt/todo.txt) format:

```text
(A) Send proposal +Work @email due:2026-09-11 id:UUID
x 2026-09-10 2026-09-09 Send proposal +Work @email due:2026-09-11 pri:A id:UUID
```

| File | Purpose |
| --- | --- |
| `todo.txt` | Active tasks and completed tasks that have not been archived |
| `done.txt` | Archived completed tasks |
| `.machen.json` | Notes, attachment references, and activity history |
| `attachments/` | Copies of files attached to tasks |
| `todo.txt.bak`, `done.txt.bak` | The state before the latest write |

Projects use `+Project`; contexts use `@context`. Machen stores due dates as `due:YYYY-MM-DD`, priority as `pri:A`, and planned days as `t:YYYY-MM-DD`. These additions retain todo.txt compatibility. Keep the `id:` field when editing files in another app so notes, attachments, and history remain connected to the right task.

Machen reloads external edits when it regains focus and every 30 seconds. Avoid writing to the same files from multiple apps at the exact same time; sync services may create conflict copies.

## Updates

Installed copies check for updates at launch and then every four hours. Downloads and installation always require your click. You can also check manually from Settings.

## For contributors

Machen is an Electron app. To run it from source, install Node.js 24 or later and run:

```sh
npm ci
npm start
```

Useful checks:

```sh
npm run check
npm test
npm run test:ui
```

Package and release tooling lives in `scripts/`. GitHub Actions builds the public desktop packages after a push to `main`; it calculates the next patch version from release tags. See the [Actions page](https://github.com/sirkyomi/machen/actions) for build status.

## License

[MIT](LICENSE). Third-party asset notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
