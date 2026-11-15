# Smart Expense Splitter

A lightweight, browser-based tool for tracking shared trip expenses and calculating who owes whom. It runs locally in your browser and does not need a server or account.

## Run it

Open `index.html` in a modern browser. For local development, you can also serve this folder with any static file server, for example:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Features

- Add, rename, and remove trip participants.
- Record expenses, choose who paid, and select who shares each expense.
- Review totals, each person's paid amount and fair share, and a suggested settlement plan.
- Switch between light and dark themes.
- Export a JSON backup and import it later.
- Keep trip data in browser local storage.

## Data and privacy

Trip data stays in the current browser profile unless you export and share a backup. Clearing browser site data will remove saved trips, so export a backup if you need to keep them. Imported JSON replaces the current trip data after confirmation.

## Project files

- `index.html` — page structure and asset links.
- `styles.css` — layout, themes, and responsive styles.
- `app.js` — expense calculations, saved state, and interface behavior.

