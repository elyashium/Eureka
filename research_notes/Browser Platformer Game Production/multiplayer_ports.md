# Browser-First Multiplayer Platformer Architecture

## 1. Engine and client platform strategy

### Takeaway

For a 2D platformer whose first release is a browser game, the strongest low-friction starting point is **Phaser with TypeScript for the client, plus a separate Node.js authoritative server**. Keep movement and collision rules in a small renderer-independent TypeScript package shared by client and server. Choose PixiJS plus custom systems only if you want to own more engine code; choose Godot if an integrated editor and native PC/mobile builds matter more than the simplest browser workflow.

### Cited Findings

- Phaser describes itself as an HTML5-first 2D game framework for desktop and mobile browsers, built with JavaScript or TypeScript. Its docs say games can be compiled to iOS, Android, Steam and native apps using third-party tools; Phaser itself does not provide those native wrappers. [Phaser documentation](https://docs.phaser.io/)
- Phaser supports WebGL and Canvas rendering; its input system unifies mouse and touch input and documents gamepad input. [Phaser overview](https://docs.phaser.io/), [Phaser input guide](https://docs.phaser.io/phaser/concepts/input)
- PixiJS is a renderer / creation engine, not a complete game engine. Its FAQ explicitly says it does not supply a full game-engine feature set. Its renderer guide currently labels WebGL/WebGL2 stable and recommended, WebGPU still maturing, and Canvas renderer experimental. [PixiJS FAQ](https://pixijs.com/faq), [PixiJS rendering guide](https://pixijs.com/8.x/guides/components/renderers)
- Godot Web export uses WebAssembly and WebGL 2.0 with the Compatibility renderer. Godot 4 projects written in C# currently cannot be exported to Web. Since Godot 4.3, single-thread Web export is the default and preferred option; threaded exports require cross-origin isolation headers. Godot states that web exports can run on mobile but perform worse than native exports. [Godot Web export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- Godot supports exporting games to Windows, macOS, Linux, Android, iOS and Web. [Godot platform FAQ](https://docs.godotengine.org/en/stable/about/faq.html)
- Unity 6.3 documents Web support for desktop browsers and selected mobile browsers, including iOS Safari 15+ and Android Chrome 58+. Web builds still lack managed C# threads, and browser restrictions prevent raw IP socket access; networking must use web-compatible transports. [Unity browser compatibility](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-browsercompatibility.html), [Unity Web technical limitations](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-technical-overview.html)
- Browser WebSocket provides two-way communication without polling, but its browser API has no backpressure mechanism; excess incoming messages can consume memory or make the page unresponsive. [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- Browser WebTransport uses HTTP/3/QUIC and can provide reliable streams and unreliable datagrams; MDN marks it newly available across current browser/device versions since March 2026. [MDN WebTransport API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API)

### Inferences

- **Recommended browser-first stack:** Phaser + TypeScript for rendering, scenes, input, camera and animation; Colyseus + Node.js/TypeScript for multiplayer rooms and matchmaking; a shared pure-TypeScript simulation module for movement, collision, ability constraints and boss rules. Phaser’s browser focus reduces early web-release work, while Colyseus supports authoritative state and clients built with different front-end engines. [Phaser documentation](https://docs.phaser.io/), [Colyseus getting started](https://docs.colyseus.io/getting-started)
- Do not make the server depend on Phaser’s rendering loop or treat a client-only physics plugin as server truth. Define stable simulation functions that take a state, input and fixed time step; render the resulting state with Phaser. This makes client prediction and server validation share movement rules. This recommendation follows Colyseus’s documented requirement that prediction and server simulation use the same step function and fixed timestep. [Colyseus determinism contract](https://docs.colyseus.io/netcode/determinism)
- PixiJS is a good choice if the team wants a lean renderer and accepts building or integrating game systems such as physics, scene lifecycle, asset loading, animation/state machines, tilemaps and editor workflows. [PixiJS FAQ](https://pixijs.com/faq)
- If the project prioritizes a unified visual editor and native PC/mobile builds, evaluate Godot early. For web, use GDScript and account for WebGL2 Compatibility rendering, no C# export, a single-thread default and web-specific performance limits. [Godot Web export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- Unity can support a browser-plus-native strategy, including mobile browsers, but has separate Web-target restrictions and may be more engine than needed for a 2D web-first game. It becomes more attractive if the team already knows Unity or needs its broader production ecosystem. This is an inference, not a benchmark claim. [Unity browser compatibility](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-browsercompatibility.html), [Unity Web technical limitations](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-technical-overview.html)

### Gaps

- Engine fit depends on team skills, expected player count, desired platforms and whether the game needs elaborate editor workflows.
- WebTransport is newer than WebSocket. Verify support in the exact browser, framework and hosting stack before choosing it.

## 2. Multiplayer simulation, browser behavior and trust

### Takeaway

Use a **server-authoritative room simulation**: clients send button/input intent; the server owns positions, collision results, pickups, damage, boss state, checkpoints and rewards. For responsive platform controls, predict the local player from the same fixed-step movement function, then reconcile with server acknowledgements; smooth remote players and bosses between server updates. Start with WebSockets over TLS (wss://) and compact, bounded messages.

### Cited Findings

- Colyseus rooms are isolated match instances with room state and logic. The server mutates room state; clients send messages requesting changes, then receive an initial state and property-level patches. [Colyseus rooms](https://docs.colyseus.io/room), [Colyseus state synchronization](https://docs.colyseus.io/state)
- Colyseus documents fixed-timestep room logic; one example uses a 30 Hz input/server step and physics sub-stepping to 60 Hz. [Colyseus fixed timestep guide](https://docs.colyseus.io/netcode/server-input)
- Colyseus 0.18 includes a netcode model where the server remains authoritative, the client predicts its own entity, reconciles by replaying unprocessed inputs, and interpolates or extrapolates remote entities. The developer supplies the deterministic step function. [Colyseus netcode overview](https://docs.colyseus.io/netcode), [client prediction](https://docs.colyseus.io/netcode/client-prediction)
- Colyseus documents server rewind / lag compensation for judging a hit against the target position the client saw, rather than the target's current position. [Colyseus lag compensation](https://docs.colyseus.io/netcode/lag-compensation)
- Colyseus room authentication runs before join and can validate a client's token in onAuth; lifecycle hooks include join, disconnect, reconnection, leave and disposal. [Colyseus room authentication](https://docs.colyseus.io/auth/room), [room lifecycle](https://docs.colyseus.io/room/lifecycle)
- Rooms are ephemeral by default. Colyseus recommends saving player/match data in a database; room disposal is one place to persist results. [Colyseus FAQ](https://docs.colyseus.io/faq)
- Colyseus recommends HTTPS with a reverse proxy, health-check routes, graceful shutdown, and shared Redis presence and a room driver for multiple processes or machines. [Colyseus deployment](https://docs.colyseus.io/deployment), [Colyseus scalability](https://docs.colyseus.io/scalability)
- Browser WebSocket handshakes include an Origin header. MDN recommends checking it to reduce cross-site WebSocket hijacking risk, but non-browser clients can forge it, so it is not authentication by itself. [MDN writing WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)
- requestAnimationFrame generally follows the display refresh rate (which may be 60, 75, 120, 144 Hz or another rate) and is paused in most browsers for hidden tabs and frames. [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- Browser audio can be blocked until user interaction. Web Audio guidance recommends creating/resuming the audio context from a user gesture and handling playback failures. [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- Pointer Events provide a unified input model for mouse, pen and touch, including multi-touch. The Gamepad API exposes connected controllers and their current buttons/axes. [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)

### Inferences

- A practical message flow for a co-op platformer:
  1. The client maps keyboard, controller or on-screen touch into logical actions such as moveX, jump, attack and interact.
  2. It advances the local player immediately with the shared simulation and sends an input frame, not a claimed position.
  3. The server consumes input on a fixed tick, advances authoritative player/world/boss state and sends acknowledgements plus changed state.
  4. The client resets prediction to the latest server state and replays unacknowledged inputs; small corrections can be smoothed.
  5. Other players, enemies and boss movement are drawn from recent server snapshots and interpolated slightly behind real time.
  
  This applies Colyseus's documented server-authoritative prediction/reconciliation model to a platformer. [Colyseus netcode](https://docs.colyseus.io/netcode), [fixed timestep guide](https://docs.colyseus.io/netcode/server-input)
- The server should accept intent, not client claims. It can verify grounded jumps, dash/attack cooldowns, pickup reach, damage, player life state and boss vulnerability windows. Client-side effects may play optimistically, but only server-confirmed state should grant health, inventory, checkpoints or completion. This follows from server-owned room state and client requests. [Colyseus state synchronization](https://docs.colyseus.io/state)
- For a co-op/PvE platformer, full peer-to-peer rollback across every entity is usually unnecessary for the prototype. Local movement prediction, server correction and remote interpolation provide responsiveness without requiring the whole simulation to use synchronized input lockstep. Add server rewind only if lag-sensitive hits against moving targets become unfair. This is a recommendation inferred from Colyseus's distinct netcode primitives. [Colyseus netcode](https://docs.colyseus.io/netcode), [lag compensation](https://docs.colyseus.io/netcode/lag-compensation)
- WebSocket is a reasonable first transport for small rooms and moderate input/state rates because it is broadly available and simple to deploy. Keep packets small, coalesce replaceable movement inputs, bound queues and message rates, and do not send large visual/audio assets over the socket. If profiling later shows delivery stalls that materially harm play, compare WebTransport datagrams or another compatible transport. [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API), [MDN WebTransport API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API)
- Treat browser pause/suspend as a network event. On hidden tab or app background, stop local simulation from advancing uncontrolled time, pause audio when appropriate, and either pause the room or mark the player disconnected. The server must not advance player state based on a client's elapsed frame time. This follows from browser animation throttling and server authority. [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [Colyseus lifecycle](https://docs.colyseus.io/room/lifecycle)
- Start without accounts if the first build is a small playable test, using guest sessions and private room codes. Add identity, cloud saves and friend invitations when they become product requirements. Regardless of login, validate room join tokens and enforce message size/rate limits. Colyseus supports token-authenticated room joins and room-level message-rate caps. [Colyseus room authentication](https://docs.colyseus.io/auth/room), [Colyseus rooms](https://docs.colyseus.io/room)
- Use a database for account progression, unlocks, inventory and match results. Keep fast-changing positions and boss state in room memory; persist durable values on checkpoints, match end or controlled disposal rather than every rendered frame. This follows from ephemeral room state and documented persistence hooks. [Colyseus FAQ](https://docs.colyseus.io/faq)

### Gaps

- Appropriate room size and tick/patch rates depend on level complexity, physics, average latency, and hosting CPU/memory. Framework examples are not load-test results.
- Server-side collision fidelity with the selected physics system must be proven. Prediction requires matching simulation steps; if physics differs across builds, simplify movement to a shared deterministic kinematic solver or use correction without full prediction. [Colyseus determinism contract](https://docs.colyseus.io/netcode/determinism)

## 3. Shipping from browser to PC and mobile

### Takeaway

Make the web game playable with mouse/keyboard, gamepad and touch from the beginning, then wrap the same web bundle for desktop/mobile if the browser-first stack still fits. Phaser + Capacitor has a documented iOS/Android path; Electron packages JavaScript/HTML/CSS for Windows, macOS and Linux. If native game feel, offline operation, background rules or platform SDKs become central, treat native builds as product work with their own QA.

### Cited Findings

- Phaser's docs say games may be deployed to iOS and Android through third-party tools. Its Capacitor tutorial walks through native Android/iOS projects, copying the game bundle, and adapting screen size, safe areas, touch controls and instructions. [Phaser docs](https://docs.phaser.io/), [Phaser + Capacitor tutorial](https://phaser.io/tutorials/bring-your-phaser-game-to-ios-and-android-with-capacitor)
- Capacitor can be added to an existing JavaScript web project and generates Android/iOS projects that load built web assets. Capacitor iOS apps use WKWebView, are configured in Xcode, and require macOS/Xcode for local iOS development. [Capacitor installation](https://capacitorjs.com/docs/getting-started), [Capacitor iOS docs](https://capacitorjs.com/docs/ios), [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- Electron packages JavaScript, HTML and CSS into desktop apps for Windows, macOS and Linux by embedding Chromium and Node.js. [Electron introduction](https://www.electronjs.org/docs/latest)
- Godot supports exports to desktop, Android, iOS and Web from one project; its Web build uses WebAssembly and the browser's WebGL2 Compatibility path. [Godot platform FAQ](https://docs.godotengine.org/en/stable/about/faq.html), [Godot Web export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- Unity 6.3 documents support for selected mobile browsers, while retaining separate Web restrictions such as no managed C# threading and no raw socket access. [Unity browser compatibility](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-browsercompatibility.html), [Unity technical limitations](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-technical-overview.html)
- Godot's Web export can be configured as a PWA with an offline service-worker cache after first load, though browsers may evict cached data when disk space is low or the site is unused. [Godot Web export docs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)

### Inferences

- Suggested rollout:
  - **Prototype:** Phaser browser build, one small level, one player, one enemy and one server room. Test fresh page load, audio unlock, keyboard and controller.
  - **Vertical slice:** desktop browser plus mobile Safari/Chrome; add touch controls, responsive safe-area layout, join/rejoin, guest identity, one full boss encounter and durable checkpoint/result saving.
  - **Browser release:** serve static game files over HTTPS/CDN and run room servers separately over WSS. Measure loading, reconnect success, room CPU/memory, latency and frame time on low-end phones.
  - **PC packaging:** use Electron if desktop distribution is desired; add desktop window behavior, controller remapping, launch/update, crash reporting and store integration.
  - **Mobile packaging:** use Capacitor if real-device performance tests pass. Add native project configuration, icons/signing, safe-area handling, app suspend/reconnect logic, touch UX and store review metadata. If memory/frame-time needs exceed WebView limits, port client/rendering integration to a native engine while keeping the network protocol, shared simulation rules and authoritative server.
  
  Phaser/Capacitor docs show packaging is possible but explicitly require mobile-specific touch and layout work. [Phaser + Capacitor tutorial](https://phaser.io/tutorials/bring-your-phaser-game-to-ios-and-android-with-capacitor), [Capacitor docs](https://capacitorjs.com/docs)
- Keep action bindings independent of devices. Map keyboard, gamepad and touch widgets into the same action structure; touch controls should support simultaneous directions plus jump/attack, be large enough for fingers, and avoid display safe areas. [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API), [Phaser mobile tutorial](https://phaser.io/tutorials/bring-your-phaser-game-to-ios-and-android-with-capacitor)
- Add a first-tap Play/Enable sound step to resume Web Audio and handle rejected playback. Pause or preserve music state when the page becomes hidden instead of blindly resuming on return. [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [MDN Page Visibility guidance](https://developer.mozilla.org/en-US/blog/using-the-page-visibility-api/)
- Test each platform separately for keyboard focus, mobile memory/frame pacing, app suspend/reopen, touch reach, reconnect after network switching, gamepad mapping and audio resume. A desktop browser pass does not establish native/mobile quality; this QA recommendation is inferred from the documented platform differences. [Godot Web export considerations](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Capacitor iOS docs](https://capacitorjs.com/docs/ios), [Unity Web limitations](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-technical-overview.html)

### Gaps

- Store submission requirements, fees, privacy declarations, age ratings, tax/payment terms and content rules change by platform, store and country. Re-check Apple, Google and Steam primary policies when choosing a release date.
- The best PC wrapper and whether mobile should remain a WebView game depend on measured build size, memory, frame pacing, native service needs and target-store rules; prototype on low-end devices before locking the plan.

