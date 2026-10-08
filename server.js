const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

function makeCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

function publicState(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      daresSubmitted: p.daresSubmitted
    })),
    gameStarted: room.gameStarted,
    currentPlayerId: room.gameStarted && room.players.length
      ? room.players[room.currentPlayerIndex]?.id
      : null,
    currentDare: room.currentDare
      ? {
          text: room.currentDare.text,
          completed: room.currentDare.completed,
          creatorRevealed: room.currentDare.creatorRevealed,
          creatorName: room.currentDare.creatorRevealed
            ? room.currentDare.creatorName
            : null
        }
      : null,
    remainingDares: room.dares.length - room.usedDares.size,
    totalDares: room.dares.length
  };
}

function broadcast(room) {
  io.to(room.code).emit("state", publicState(room));
}

function findRoom(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function error(socket, message) {
  socket.emit("error-message", message);
}

io.on("connection", socket => {
  socket.on("create-game", ({ name }) => {
    name = String(name || "").trim();

    if (!name) return error(socket, "Please enter your name.");
    if (name.length > 24) return error(socket, "Name must be 24 characters or less.");

    const code = makeCode();

    const room = {
      code,
      players: [],
      dares: [],
      usedDares: new Set(),
      currentPlayerIndex: 0,
      gameStarted: false,
      currentDare: null,
      createdAt: Date.now()
    };

    rooms.set(code, room);
    joinPlayer(socket, room, name);
  });

  socket.on("join-game", ({ name, code }) => {
    name = String(name || "").trim();
    code = String(code || "").trim();

    if (!name) return error(socket, "Please enter your name.");
    if (name.length > 24) return error(socket, "Name must be 24 characters or less.");
    if (!/^\d{4}$/.test(code)) return error(socket, "Game code must be 4 digits.");

    const room = rooms.get(code);

    if (!room) return error(socket, "Game not found. Check the code.");
    if (room.gameStarted) return error(socket, "This game has already started.");
    if (room.players.length >= 4) return error(socket, "Game is full. Maximum 4 players.");
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return error(socket, "That name is already taken.");
    }

    joinPlayer(socket, room, name);
  });

  socket.on("submit-dares", ({ dares }) => {
    const room = findRoom(socket);
    if (!room || room.gameStarted) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (player.daresSubmitted) return error(socket, "Your dares are already locked.");

    if (!Array.isArray(dares) || dares.length !== 5) {
      return error(socket, "You must enter exactly 5 dares.");
    }

    const cleaned = dares.map(d => String(d || "").trim());

    if (cleaned.some(d => !d)) {
      return error(socket, "All 5 dares are required.");
    }

    if (cleaned.some(d => d.length > 250)) {
      return error(socket, "Each dare must be 250 characters or less.");
    }

    player.daresSubmitted = true;

    cleaned.forEach(text => {
      room.dares.push({
        id: `${socket.id}-${Math.random().toString(36).slice(2)}`,
        text,
        creatorId: socket.id,
        creatorName: player.name,
        completed: false,
        creatorRevealed: false
      });
    });

    broadcast(room);
  });

  socket.on("start-game", () => {
    const room = findRoom(socket);
    if (!room || room.gameStarted) return;

    if (room.players.length !== 4) {
      return error(socket, "Exactly 4 players are required.");
    }

    if (!room.players.every(p => p.daresSubmitted)) {
      return error(socket, "All 4 players must submit 5 dares.");
    }

    room.gameStarted = true;
    room.currentPlayerIndex = 0;
    room.currentDare = null;

    broadcast(room);
  });

  socket.on("spin", () => {
    const room = findRoom(socket);
    if (!room || !room.gameStarted) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      return error(socket, "It is not your turn.");
    }

    if (room.currentDare && !room.currentDare.completed) {
      return error(socket, "Complete the current dare first.");
    }

    const available = room.dares.filter(d => !room.usedDares.has(d.id));

    if (!available.length) {
      return error(socket, "All dares have been completed.");
    }

    const selected = available[Math.floor(Math.random() * available.length)];
    room.usedDares.add(selected.id);
    room.currentDare = { ...selected, completed: false, creatorRevealed: false };

    broadcast(room);
  });

  socket.on("complete-dare", () => {
    const room = findRoom(socket);
    if (!room || !room.gameStarted || !room.currentDare) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      return error(socket, "It is not your turn.");
    }

    if (room.currentDare.completed) return;

    room.currentDare.completed = true;
    room.currentDare.creatorRevealed = true;

    broadcast(room);
  });

  socket.on("next-turn", () => {
    const room = findRoom(socket);
    if (!room || !room.gameStarted || !room.currentDare?.completed) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      return error(socket, "It is not your turn.");
    }

    const remaining = room.dares.filter(d => !room.usedDares.has(d.id));

    if (remaining.length === 0) {
      room.currentDare = null;
      broadcast(room);
      return;
    }

    room.currentPlayerIndex =
      (room.currentPlayerIndex + 1) % room.players.length;

    room.currentDare = null;
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const room = findRoom(socket);
    if (!room) return;

    const index = room.players.findIndex(p => p.id === socket.id);
    if (index === -1) return;

    const leavingName = room.players[index].name;
    room.players.splice(index, 1);

    if (!room.players.length) {
      rooms.delete(room.code);
      return;
    }

    if (room.gameStarted) {
      if (index < room.currentPlayerIndex) room.currentPlayerIndex--;
      if (room.currentPlayerIndex >= room.players.length) room.currentPlayerIndex = 0;
    }

    io.to(room.code).emit("notice", `${leavingName} left the game.`);
    broadcast(room);
  });
});

function joinPlayer(socket, room, name) {
  socket.join(room.code);
  socket.data.roomCode = room.code;

  room.players.push({
    id: socket.id,
    name,
    daresSubmitted: false
  });

  socket.emit("joined", { code: room.code });
  broadcast(room);
}

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (!room.players.length || room.createdAt < cutoff) {
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Truth & Dare running at http://localhost:${PORT}`);
});
