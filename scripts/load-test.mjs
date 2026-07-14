import { performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';

const endpoint = process.argv[2] || 'ws://localhost:3000';
const roomCount = Number(process.argv[3] || 100);
const batchSize = Number(process.argv[4] || 10);
const sockets = [];

function waitFor(ws, predicate, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Timed out waiting for server response.')), timeout);
    const onMessage = raw => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (predicate(message)) done(null, message);
    };
    const done = (error, value) => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      error ? reject(error) : resolve(value);
    };
    ws.on('message', onMessage);
  });
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    const timer = setTimeout(() => finish(new Error('Timed out opening socket.')), 10_000);
    const finish = (error, value) => {
      clearTimeout(timer);
      ws.off('open', onOpen); ws.off('error', onError);
      error ? reject(error) : resolve(value);
    };
    const onOpen = () => finish(null, ws);
    const onError = error => finish(error);
    ws.on('open', onOpen); ws.on('error', onError);
  });
}

async function createPlayableRoom() {
  const x = await openSocket();
  sockets.push(x);
  const joinedX = waitFor(x, message => message.type === 'joined');
  x.send(JSON.stringify({ type: 'create' }));
  const { room } = await joinedX;

  const o = await openSocket();
  sockets.push(o);
  const joinedO = waitFor(o, message => message.type === 'joined');
  o.send(JSON.stringify({ type: 'join', room }));
  await joinedO;

  const moved = waitFor(x, message => message.type === 'state' && message.players === 2 && message.board[0] === 'X');
  x.send(JSON.stringify({ type: 'move', cell: 0 }));
  await moved;
}

const start = performance.now();
let completed = 0;
try {
  for (let offset = 0; offset < roomCount; offset += batchSize) {
    const batch = Math.min(batchSize, roomCount - offset);
    await Promise.all(Array.from({ length: batch }, createPlayableRoom));
    completed += batch;
    console.log(`${completed}/${roomCount} rooms verified (${sockets.length} live sockets)`);
  }
  const seconds = (performance.now() - start) / 1000;
  console.log(JSON.stringify({ endpoint, rooms: completed, connections: sockets.length, seconds: Number(seconds.toFixed(2)), roomsPerSecond: Number((completed / seconds).toFixed(2)) }));
} catch (error) {
  console.error(`Load test stopped after ${completed} rooms (${sockets.length} live sockets): ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.close();
}
