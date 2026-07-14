# Multiplayer Tic-Tac-Toe

A small real-time browser game for two players. Create a room, share its five-character code, and play on the same board with low-latency WebSocket updates.

**Live demo:** [tic-tac-toe-server-wandering-frost-3118.fly.dev](https://tic-tac-toe-server-wandering-frost-3118.fly.dev)

```text
Player browser -- WebSocket --+-- Node.js game server -- In-memory rooms
                              |
Player browser -- WebSocket --+-- Persistent all-time X/O statistics
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the detailed request flow, security controls, measured capacity, and scaling path.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser windows. Create a room in one and enter its code in the other. Local statistics reset whenever the local server restarts; the Fly deployment persists them on its mounted volume.

## Deploy to Fly.io

1. Sign in with `flyctl auth login`.
2. Update the `app` value in `fly.toml` if deploying to a different Fly app.
3. Create the encrypted persistent all-time-scoreboard volume: `flyctl volumes create game_stats --region dfw --size 1`.
4. Run `flyctl deploy` from this folder.

## Production profile

The live Fly app runs **one shared-CPU 256 MB machine** in `dfw`. It is allowed to stop when idle and wakes automatically for the next request or WebSocket connection.

| Limit or behavior | Current setting |
| --- | --- |
| Fly connection soft limit | 400 concurrent connections |
| Fly connection hard limit | 500 concurrent connections |
| Practical two-player room ceiling | 250 rooms |
| Verified controlled load test | 240 rooms / 480 connections |
| WebSocket message size | 512 bytes maximum |
| Per-socket rate limit | 20-message burst, then 5 messages/second |
| Idle room expiry | 30 minutes |
| Global scoreboard storage | Encrypted 1 GB Fly volume |

The server validates every move, limits rooms to two players, removes empty rooms, and uses heartbeat checks to clear dead sockets. For stronger edge-level DDoS protection, configure Fly's managed controls or place Cloudflare in front of the app.

## Load test

The included load test creates real two-player rooms, validates one move in each, then closes every socket:

```bash
node scripts/load-test.mjs wss://your-app.fly.dev 100 10
```

On the deployed shared-CPU 256 MB Fly machine, the test has verified 240 simultaneous rooms (480 WebSocket connections), including room creation, joining, and one validated move per room. It completed in 8.71 seconds. The configured ceiling is 500 connections.
