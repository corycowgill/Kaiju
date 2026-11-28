# Online multiplayer

Online Wrestling and VS are private, two-human, server-authoritative arena matches.
Wrestling is best of three falls; VS is one fall. All nine fighters, mirror matches,
and all six city arenas are supported. The server runs the existing `fighter.js`,
`grapple.js`, `signatures.js` and `match.js` rules at 60 ticks per second. Clients
receive state at 20 Hz and render both fighters on one interpolation clock.
Health, hits, powers, holds, pins, finishers, fall transitions and results are
resolved on the server. Clients submit only bounded inputs, with sequence numbers.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
SERVE_GAME=1 npm run server
```

Open `http://localhost:8787/?vo=0` on two browser windows or devices. Select
**Online Multiplayer**, choose fighters, create a room in one window and join its
six-character room code in the other. Both press **Ready**. The game begins only
when both clients acknowledge loading. Localhost defaults to port 8787.

For devices outside the server machine, deploy behind HTTPS and use its HTTPS or
WSS address. Plain WS is accepted only for localhost. The optional development
static server serves the game, source and assets, and does not serve private files
or the server directory. It is not needed when the frontend uses GitHub Pages.

## Deploy the match server

GitHub Pages continues to serve the frontend but cannot host WebSockets. A
separate, continuously running service is required for online games.

A Render Blueprint is provided in `render.yaml`, using `server/Dockerfile` and the
`/health` health check. Create a Blueprint from this repository in Render and
review the service's plan before creating it. The configured Starter service is a
paid service, chosen to avoid sleeping during matches. Deploying this file alone
does not create a Render service or start billing.

For another Docker host:

```sh
docker build -f server/Dockerfile -t kaiju-online .
docker run --rm -p 8787:8787 \
  -e ALLOWED_ORIGINS=https://corycowgill.github.io kaiju-online
```

Terminate TLS at the hosting service/reverse proxy and forward WebSocket upgrades
at `/online`. Set `PORT` if the platform requires a different port.
`ALLOWED_ORIGINS` is a comma-separated list of exact frontend origins, with no path
or trailing slash. An empty list permits all origins for local development.

After deployment, set the `kaiju-online-server` meta tag in `index.html` to the
public HTTPS server URL and publish the frontend. Players can also enter that
address directly in the lobby; it is remembered on that device. Invite links
include the server address and room code but never the reconnect credential.
Opening an invite fills the lobby; it does not connect without player action.

Rooms are in memory and belong to one server process. Use a single instance;
do not enable horizontal scaling without shared routing and room ownership.
A server restart interrupts matches. There are no accounts, database, ranked
ratings or cloud profile saves in this release.

## Controls and match lifecycle

Each player uses the same P1 controls as local play: WASD, V strike/hold for heavy,
F heavy, E grab/reverse/pin, C block, R taunt, Q finisher, 1/2/3 powers, Space stomp,
Left Shift sprint. The first detected controller can be used instead. Touchscreen
players get on-screen movement and action buttons. Device assignment stays fixed
for that match. Loss of a controller sends neutral input; it never assigns AI.

Opening the pause menu does not stop the opponent or the server. Background or
stale clients send no held movement/attacks after 250 ms. Broken connections retry
automatically with a private in-memory seat credential. Reconnect within 20 seconds
to resume the same fighter; after that, the opponent wins by forfeit. Explicitly
quitting forfeits immediately. Reloading the page loses the reconnect credential;
this release reconnects transport interruptions without supporting page-reload resume.

Results save independently in both players' active local profiles as Online
Wrestling or Online VS. A rematch requires both players to request it. Online
matches do not advance solo achievements, high scores, City Challenges or the
Championship Tour. Local profile backups include online history automatically.

## Current scope and limits

Fights stay within the 84 × 84 arena footprint. The surrounding city is scenery;
city destruction, carried buildings, loose weapons and military interference are
not enabled online. This keeps gameplay independent of client graphics and asset
LOD settings. Offline modes retain their existing city gameplay.

This release uses authoritative combat and interpolated presentation, without
client movement prediction or rollback. Expect input delay on distant servers;
choose a nearby region. Reversal and escape timing should be tested on the intended
network before using these matches competitively. There is no public matchmaking,
spectator mode, host migration or cross-device profile sync.

The service limits rooms, connections, payload size and message rate; the
simulation clamps movement and enforces escape mash rate and action legality.
Room codes are invitations, not passwords. Reconnect credentials are not placed
in URLs, stored in local profiles, or exposed to the other player.

## Validation

`npm test` includes headless real-combat tests and real WebSocket integration
tests for joining, loading barriers, remote inputs, reconnecting, rematches,
protocol mismatch and room admission. Browser verification should cover two
independent contexts, seat-relative HUD and results, mobile controls, slow loading,
pause, transport interruption and disconnect forfeits. Presentation does not
execute combat rules, so a client cannot independently choose a winner.
