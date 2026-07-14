import http from 'node:http';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const ROOM_TTL = 30 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

function makeCode() {
  let code;
  do {
    code = Array.from(randomBytes(5), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  } while (rooms.has(code));
  return code;
}

function newRoom() {
  const code = makeCode();
  const room = { code, board: Array(9).fill(null), turn: 'X', players: new Map(), createdAt: Date.now(), touchedAt: Date.now() };
  rooms.set(code, room);
  return room;
}

function winner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return board.every(Boolean) ? 'draw' : null;
}

function state(room) {
  return { type: 'state', room: room.code, board: room.board, turn: room.turn, result: winner(room.board), players: room.players.size };
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(room) {
  const message = JSON.stringify(state(room));
  for (const ws of room.players.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(message);
}

function leave(ws) {
  if (!ws.room) return;
  const room = rooms.get(ws.room);
  if (room) {
    room.players.delete(ws);
    room.touchedAt = Date.now();
    broadcast(room);
    if (!room.players.size) rooms.delete(room.code);
  }
  ws.room = null;
  ws.mark = null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end('{"ok":true}');
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const allowed = new Set(['index.html', 'app.js', 'style.css']);
  if (!allowed.has(file)) { res.writeHead(404); return res.end('Not found'); }
  const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'text/css';
  res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'public, max-age=3600' });
  fs.createReadStream(path.join(publicDir, file)).pipe(res);
});

const wss = new WebSocketServer({ server, maxPayload: 512, perMessageDeflate: false });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.tokens = 20;
  ws.lastRefill = Date.now();
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    const now = Date.now();
    ws.tokens = Math.min(20, ws.tokens + (now - ws.lastRefill) / 1000 * 5);
    ws.lastRefill = now;
    if (ws.tokens < 1) return send(ws, { type: 'error', message: 'Too many requests. Slow down.' });
    ws.tokens--;
    let msg;
    try { msg = JSON.parse(raw); } catch { return send(ws, { type: 'error', message: 'Invalid message.' }); }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'create') {
      leave(ws);
      const room = newRoom();
      room.players.set(ws, 'X'); ws.room = room.code; ws.mark = 'X'; room.touchedAt = now;
      return send(ws, { type: 'joined', room: room.code, mark: 'X' }), broadcast(room);
    }
    if (msg.type === 'join') {
      const code = typeof msg.room === 'string' ? msg.room.trim().toUpperCase() : '';
      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'error', message: 'That room does not exist.' });
      if (room.players.size >= 2) return send(ws, { type: 'error', message: 'That room is full.' });
      leave(ws); room.players.set(ws, 'O'); ws.room = code; ws.mark = 'O'; room.touchedAt = now;
      return send(ws, { type: 'joined', room: code, mark: 'O' }), broadcast(room);
    }
    if (msg.type === 'move') {
      const room = rooms.get(ws.room), cell = msg.cell;
      if (!room || !Number.isInteger(cell) || cell < 0 || cell > 8) return;
      if (room.players.size !== 2 || winner(room.board) || room.turn !== ws.mark || room.board[cell]) return;
      room.board[cell] = ws.mark; room.turn = ws.mark === 'X' ? 'O' : 'X'; room.touchedAt = now; broadcast(room);
    }
    if (msg.type === 'restart') {
      const room = rooms.get(ws.room);
      if (!room || room.players.size !== 2) return;
      room.board.fill(null); room.turn = 'X'; room.touchedAt = now; broadcast(room);
    }
  });
  ws.on('close', () => leave(ws));
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.touchedAt > ROOM_TTL) rooms.delete(code);
  for (const ws of wss.clients) { if (!ws.isAlive) ws.terminate(); else { ws.isAlive = false; ws.ping(); } }
}, 30000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Tic-tac-toe listening on ${PORT}`));
