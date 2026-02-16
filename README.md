# Decrypto Online (截码战)

## Stack
- Frontend: Next.js App Router (`apps/web`)
- Backend: Node.js + Express + Socket.io (`apps/server`)
- Real-time sync: Socket.io events with per-player state projection

## Run
```bash
npm install
npm run dev:server
npm run dev:web
```

## Environment Variables
```bash
cp .env.example .env
```

- Web (`apps/web`): `NEXT_PUBLIC_SERVER_URL`
  - Empty by default = auto-connect same-origin.
- Server (`apps/server`): `PORT`, `CORS_ORIGINS`, `WORD_SERVICE_URL`, `WORD_SERVICE_TIMEOUT_MS`
- Word service (`apps/word-service`): `PORT`, `MAX_K`, `FASTTEXT_MODEL_PATH`

- Web: `http://localhost:3000`
- Server: `http://localhost:4100`

## Debug Multi-Player Mode
- Default behavior (normal play): tabs share the same identity via `localStorage`, so refresh/reopen can auto-reconnect as the same player.
- Debug behavior: turn on "开启调试" in UI (or use `http://localhost:3000?debug_multi_player=1`) to isolate identity per tab via `sessionStorage`.
- Use debug mode when you want multiple tabs/windows to simulate different players on one machine.

## Implemented Core
- Game state model and round state machine
- Room modes: 4 / 6 / 8 players (2 / 3 / 4 teams)
- Team secret words (1-4) with server-side visibility isolation
- Speaker-only code visibility and 60s speaking auto-submit
- Guessing pipeline: internal guess + intercept guesses
- Auto scoring: raspberry and bomb operators
- Elimination and win checks
- Deduction log board (`[round, number, clue]`) persisted and broadcast
- `handleAIAction` hook in `GameService` with pluggable `agentInterface`

## Socket Events
- Client -> Server
  - `room:create`
  - `room:join`
  - `room:reconnect`
  - `game:start`
  - `speaker:submit`
  - `guess:submit`
  - `ai:action`
- Server -> Client
  - `state:update`

## Notes
- UI is mobile-first, high-contrast black/white minimalist style.
- Deduction area uses a bottom drawer for one-hand operation.
