const crypto = require("crypto");
const http = require("http");

const MAX_PLAYERS = 4;
const PORT = Number(process.env.PORT || 8080);
const FIXED_ROOMS = ["ROOM1", "ROOM2"];
const HEARTBEAT_MS = 30000;
const MAX_FRAME_BYTES = 64 * 1024;
const rooms = new Map();
const roomWatchers = new Set();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));
  attachClient(socket);
});

function attachClient(socket) {
  const client = {
    socket,
    roomId: "",
    playerIndex: -1,
    profile: null,
    watchedRooms: [],
    alive: true,
    buffer: Buffer.alloc(0),
    send(message) {
      if (socket.destroyed) return;
      try {
        socket.write(encodeFrame(JSON.stringify(message)));
      } catch {
        removeClient(client);
      }
    }
  };

  socket.on("data", chunk => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    if (client.buffer.length > MAX_FRAME_BYTES) {
      client.socket.end();
      return;
    }
    readFrames(client);
  });
  socket.on("close", () => removeClient(client));
  socket.on("error", () => removeClient(client));
}

function readFrames(client) {
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < offset + 2) return;
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) return;
      const high = client.buffer.readUInt32BE(offset);
      const low = client.buffer.readUInt32BE(offset + 4);
      length = high * 2 ** 32 + low;
      offset += 8;
    }

    const maskOffset = offset;
    if (masked) offset += 4;
    if (client.buffer.length < offset + length) return;

    const mask = masked ? client.buffer.subarray(maskOffset, maskOffset + 4) : null;
    const payload = client.buffer.subarray(offset, offset + length);
    client.buffer = client.buffer.subarray(offset + length);

    if (opcode === 8) {
      client.socket.end();
      return;
    }
    if (opcode === 9) {
      try {
        client.socket.write(encodeFrame("", 0x8a));
      } catch {
        removeClient(client);
      }
      continue;
    }
    if (opcode === 10) {
      client.alive = true;
      continue;
    }
    if (opcode !== 1) continue;

    const data = Buffer.from(payload);
    if (masked) {
      for (let index = 0; index < data.length; index += 1) {
        data[index] ^= mask[index % 4];
      }
    }
    handleMessage(client, data.toString("utf8"));
  }
}

function handleMessage(client, raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    client.send({ type: "notice", message: "Invalid message" });
    return;
  }

  if (message.type === "join") {
    joinRoom(client, message);
    return;
  }

  if (message.type === "list-rooms") {
    watchRooms(client, message.rooms);
    return;
  }

  if (message.type === "ping") {
    client.send({ type: "pong" });
    return;
  }

  if (!client.roomId) return;

  if (message.type === "state") {
    if (client.playerIndex !== 0) return;
    broadcast(client.roomId, { type: "state", state: message.state }, client);
    return;
  }

  if (message.type === "action") {
    if (client.playerIndex === 0) {
      broadcast(client.roomId, {
        type: "action",
        action: message.action,
        data: message.data,
        playerIndex: 0
      }, client);
      return;
    }
    const host = getRoom(client.roomId).clients.get(0);
    host?.send({
      type: "action",
      action: message.action,
      data: message.data,
      playerIndex: client.playerIndex
    });
    return;
  }

  if (message.type === "profile") {
    client.profile = normalizeProfile(message.profile, client.playerIndex);
    const host = getRoom(client.roomId).clients.get(0);
    host?.send({
      type: "profile",
      playerIndex: client.playerIndex,
      profile: client.profile
    });
    broadcastRoomSummaries();
  }
}

function joinRoom(client, message) {
  leaveRoom(client);
  unwatchRooms(client);
  const roomId = normalizeRoomId(message.roomId);
  const room = getRoom(roomId);
  const playerIndex = nextPlayerIndex(room);
  if (playerIndex === null) {
    client.send({ type: "full" });
    client.socket.end();
    return;
  }

  client.roomId = roomId;
  client.playerIndex = playerIndex;
  client.profile = normalizeProfile(message.profile, playerIndex);
  room.clients.set(playerIndex, client);

  client.send({
    type: "assign",
    roomId,
    playerIndex,
    playerCount: room.clients.size,
    activePlayers: [...room.clients.keys()]
  });

  if (playerIndex !== 0) {
    room.clients.get(0)?.send({
      type: "join",
      roomId,
      playerIndex,
      playerCount: room.clients.size,
      activePlayers: [...room.clients.keys()],
      profile: client.profile
    });
  }
  broadcastRoomSummaries();
}

function leaveRoom(client) {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) return;
  room.clients.delete(client.playerIndex);
  const activePlayers = [...room.clients.keys()];

  if (client.playerIndex !== 0 && room.clients.has(0)) {
    room.clients.get(0).send({
      type: "peer-left",
      playerIndex: client.playerIndex,
      playerCount: room.clients.size,
      activePlayers
    });
  } else if (client.playerIndex === 0) {
    broadcast(client.roomId, { type: "notice", message: "Host left." }, client);
    for (const other of room.clients.values()) {
      other.socket.end();
    }
    room.clients.clear();
  }

  if (room.clients.size === 0) rooms.delete(client.roomId);
  client.roomId = "";
  client.playerIndex = -1;
  client.profile = null;
  broadcastRoomSummaries();
}

function removeClient(client) {
  unwatchRooms(client);
  leaveRoom(client);
}

function watchRooms(client, roomIds) {
  client.watchedRooms = normalizeWatchedRooms(roomIds);
  roomWatchers.add(client);
  sendRoomSummaries(client);
}

function unwatchRooms(client) {
  roomWatchers.delete(client);
  client.watchedRooms = [];
}

function sendRoomSummaries(client) {
  const watchedRooms = client.watchedRooms?.length ? client.watchedRooms : FIXED_ROOMS;
  client.send({
    type: "room-list",
    rooms: watchedRooms.map(roomSummary)
  });
}

function broadcastRoomSummaries() {
  for (const client of roomWatchers) {
    sendRoomSummaries(client);
  }
}

function roomSummary(roomId) {
  const room = rooms.get(roomId);
  const clients = room ? [...room.clients.entries()].sort(([a], [b]) => a - b).map(([, client]) => client) : [];
  return {
    id: roomId,
    playerCount: clients.length,
    players: clients.map(client => client.profile || normalizeProfile(null, client.playerIndex))
  };
}

function normalizeWatchedRooms(roomIds) {
  const requested = Array.isArray(roomIds) ? roomIds.map(normalizeRoomId) : FIXED_ROOMS;
  const fixed = requested.filter(roomId => FIXED_ROOMS.includes(roomId));
  return fixed.length ? [...new Set(fixed)] : FIXED_ROOMS;
}

function normalizeProfile(profile, index) {
  return {
    name: String(profile?.name || `친구 ${index + 1}`).slice(0, 12),
    avatarId: String(profile?.avatarId || ""),
    skin: String(profile?.skin || "")
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { clients: new Map() });
  return rooms.get(roomId);
}

function nextPlayerIndex(room) {
  for (let index = 0; index < MAX_PLAYERS; index += 1) {
    if (!room.clients.has(index)) return index;
  }
  return null;
}

function broadcast(roomId, message, except) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const client of room.clients.values()) {
    if (client !== except) client.send(message);
  }
}

function normalizeRoomId(value) {
  return String(value || "1234").trim().replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase() || "1234";
}

function encodeFrame(text, firstByte = 0x81) {
  const payload = Buffer.from(text);
  const header = [];
  header.push(firstByte);
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    header.push(127, 0, 0, 0, 0);
    header.push((payload.length >>> 24) & 0xff, (payload.length >>> 16) & 0xff, (payload.length >>> 8) & 0xff, payload.length & 0xff);
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Yachoo relay listening on ${PORT}`);
});

setInterval(() => {
  for (const client of allClients()) {
    if (!client.alive) {
      client.socket.destroy();
      removeClient(client);
      continue;
    }
    client.alive = false;
    if (!client.socket.destroyed) {
      try {
        client.socket.write(encodeFrame("", 0x89));
      } catch {
        removeClient(client);
      }
    }
  }
}, HEARTBEAT_MS).unref();

function allClients() {
  const clients = new Set(roomWatchers);
  for (const room of rooms.values()) {
    for (const client of room.clients.values()) clients.add(client);
  }
  return clients;
}

function shutdown() {
  for (const client of allClients()) {
    client.socket.end();
  }
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
