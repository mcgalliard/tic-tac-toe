# Multiplayer Tic-Tac-Toe

A tiny, real-time browser game for two players. Create a room, share its five-character code, and play on the same board with low-latency WebSocket updates.

**Live demo:** [tic-tac-toe-server-wandering-frost-3118.fly.dev](https://tic-tac-toe-server-wandering-frost-3118.fly.dev)

```text
Player browser ── WebSocket ──┐
                              ├── Authoritative Node.js server ── In-memory rooms
Player browser ── WebSocket ──┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram, request flow, security controls, and scaling path.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser windows. Create a room in one and enter its code in the other.

## Deploy to Fly.io

1. Sign in with `flyctl auth login`.
2. Update the `app` value in `fly.toml` if deploying to a different Fly app.
3. Run `flyctl deploy` from this folder.

The server validates every move, limits WebSocket message size to 512 bytes, throttles each socket to a five-message-per-second sustained rate (20-message burst), limits rooms to two players, cleans up empty/idle rooms, and caps Fly at 100 concurrent connections. For stronger edge-level DDoS/rate protections, configure Fly's managed edge controls or put Cloudflare in front of the app.
Browser Tic Tac Toe With Friends!
