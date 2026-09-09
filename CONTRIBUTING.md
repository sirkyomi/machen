# Contributing

Use Node.js 24 and install dependencies with `npm ci`. Run the app with `npm start`.
Keep changes focused and describe the user-visible behavior in your pull request.

Before submitting:

```sh
npm run check
npm test
npm run test:ui
```

UI tests require a desktop; CI runs syntax and storage tests on all three platforms.
For UI changes, check German and English, both themes, keyboard navigation, and
the quick-capture window. Include screenshots using synthetic task data.

Preserve todo.txt compatibility, unknown metadata and existing user data. Add
regression coverage when changing persistence. Never include your task folder,
attachments, credentials, generated packages or local configuration in a PR.

New visible strings belong in `src/i18n.js`. Keep UI icons in the Lucide subset.
Do not rerun the historical `scripts/localize-source.cjs` migration.
