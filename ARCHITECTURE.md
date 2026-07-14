# Architecture

This project is a deliberately small, real-time multiplayer game. It uses an authoritative WebSocket server: browsers only request actions, while the server owns the board, turn order, and outcome.

```text
┌─────────────────┐        WSS         ┌──────────────┐
│ Player A browser│ ────────────────┐  │              │
└─────────────────┘                 │  │  Fly.io edge │
                                    ├──│  + Node.js   │── In-memory room map
┌─────────────────┐                 │  │  game server │   room code · board
│ Player B browser│ ────────────────┘  │              │   turn · players
└─────────────────┘        WSS         └──────┬───────┘
                                                │
                                           GET /healthz
```

## Request flow

1. A player creates a room and receives a short room code as `X`.
2. A second player joins with that code and is assigned `O`.
3. A click sends `{ "type": "move", "cell": 0–8 }` over the existing WebSocket.
4. The server verifies the room, player, turn, cell, and game state before applying the move.
5. The server broadcasts the complete current state to both players.

Clients never decide whether a move is legal. That keeps the game fair even if someone edits their browser code or sends handcrafted WebSocket messages.

## Why this design

| Choice | Reason |
| --- | --- |
| One Node.js process | Fast startup and very low overhead for a tiny game. |
| WebSockets | One persistent connection per player; no polling delay or repeated HTTP overhead. |
| In-memory rooms | Lowest-latency state updates and no database required. |
| Fly volume | Persists the global X/O win totals across machine stops and deployments. |
| One Fly machine | Every player in a room reaches the same memory-resident game state. |
| Small static frontend | The UI is served by the same process, simplifying deployment. |

## Traffic and safety controls

- **Authoritative moves:** only the server writes the board, advances turns, and declares winners.
- **Small inputs:** WebSocket messages are capped at 512 bytes and parsed as JSON.
- **Socket rate limit:** each connection allows a 20-message burst and sustains five messages per second.
- **Bounded rooms:** rooms allow exactly two players; empty rooms are removed and inactive rooms expire after 30 minutes.
- **Connection hygiene:** WebSocket ping/pong checks remove dead connections.
- **Deployment cap:** Fly is configured for up to 500 concurrent connections per machine.

These controls are intentionally application-level. For public launch traffic or a sustained denial-of-service threat, place Cloudflare or comparable edge protection in front of the Fly hostname.

## Measured capacity

The included test script creates actual two-player rooms, joins each one, makes a validated move, and keeps every socket open until the run completes.

| Test | Result |
| --- | --- |
| Fly machine | Shared CPU, 256 MB RAM |
| Simultaneous rooms verified | 240 |
| Simultaneous WebSocket connections | 480 |
| Completion time | 8.71 seconds |
| Configured Fly ceiling | 500 connections |

This is a controlled, single-origin load test rather than a distributed stress test. It demonstrates that the application can handle 240 active, lightweight rooms on the deployed machine; it is not a promise of latency under an adversarial or globally distributed workload.

## Local setup

**Requirements:** Node.js 20 or newer.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows. Create a room in one, copy the displayed code, and join it from the other.

Useful endpoints:

| Endpoint | Purpose |
| --- | --- |
| `/` | Game client |
| `/healthz` | Health check returning `{ "ok": true }` |
| `/stats` | Persistent global X/O win and loss totals |

## Fly.io deployment

The repository contains a production Dockerfile and `fly.toml`.

```bash
flyctl deploy
```

The deployed game is available at [tic-tac-toe-server-wandering-frost-3118.fly.dev](https://tic-tac-toe-server-wandering-frost-3118.fly.dev). The Fly app uses one machine in `dfw`; Fly no longer provisions new machines in `den`.

The app uses `min_machines_running = 0`, so Fly stops the machine when idle and starts it for the next request. It mounts the encrypted `game_stats` volume at `/data` to retain all-time results. The current connection limits are 400 soft / 500 hard.

## Scaling note

Rooms live in process memory. Do **not** scale this version beyond one Fly machine: two players could be routed to different machines and see different rooms. To scale horizontally, move room state and cross-instance broadcasts to a shared service such as Redis, then use a Socket.IO or WebSocket adapter backed by that service.
