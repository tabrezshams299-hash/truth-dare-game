# Truth & Dare — Lightweight 4-Player Web Game

A tiny real-time multiplayer Truth & Dare game.

## Features

- Browser-only game; no app installation
- Exactly 4 players
- Name + 4-digit game code
- Exactly 5 dares per player
- 20 total dares
- Turn-by-turn gameplay
- Real animated spin wheel
- Random unused dare selection
- Dare creator hidden until completion
- Creator revealed after completion
- Real-time synchronization with Socket.IO
- No database
- No login
- In-memory rooms

## Run locally

Requirements: Node.js 18+.

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## GitHub

Upload the project contents to a GitHub repository.

Do NOT upload:

```text
node_modules/
```

A `.gitignore` is included.

## Deploy with Render

Create a **Web Service**, not a Static Site.

Connect the GitHub repository and use:

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

The application already uses:

```js
const PORT = process.env.PORT || 3000;
```

so it uses the hosting platform's assigned port.

## Playing remotely

After deployment, share the public HTTPS URL with all 4 players.

Example:

```text
https://your-game.onrender.com
```

Everyone opens that URL in a browser. One player creates a game and shares the 4-digit code.

## Important

Game state is intentionally stored only in server memory. If the server restarts/redeploys, active games disappear. This is intentional to keep the application extremely lightweight.
