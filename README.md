# Tribe Web

Next.js web version of the Tribe app (`../crypto-wallet`). Frontend only. It talks to the same Express backend (`../backend`) and the same Firebase project as the mobile app.

It is also the public site at sysfi.network, replacing the old Vite `website/`, which has been removed.

## Public site (signed-out visitors)

- **Landing:** `/` is `components/landing/Landing.js`, a server component. Its copy and the "Tribes to explore" strip (revalidated every 5 minutes) are in the HTML. Signed-in users are sent on to `/feed`.
- **Readable pages:** `lib/flow.js` `isPublicRoute` (tested in `test/flow.test.mjs`) lists the pages visitors can read:
  - the feed, which shows public posts
  - tribes, a tribe's overview, posts and members, and posts
  - DAOs and proposals
  - Explore, apps and bots
  - the API docs, and trade
- **Rendering:** FlowGate renders these pages even while auth is loading, so they're server-rendered for crawlers and link previews.
- **Private pages:** everything else still redirects to `/welcome` and remembers where the visitor was going.
- **Actions:** on public pages, actions go through `hooks/useSignInGate`. Join, react, repost, comment, open or add an app or bot, and trade send visitors to sign in, then FlowGate brings them back. Every on-chain action is gated once, in `useActionSheet().run`.
- **Shell:** visitors get "Sign in / Create account" in the dock and header in place of the account menu.
- **Backend:** public tribes' posts, single posts and comments are readable without an account. Private tribes need membership, and a post must belong to the tribe in its URL. Reads use `api.maybeGet`, which authenticates when signed in so per-user fields still come back.
- **SEO:**
  - `lib/seo.js` holds the helpers. Pass `NEXT_PUBLIC_SITE_URL` for previews (it defaults to `https://sysfi.network`).
  - `generateMetadata` runs for tribes (`tribe/[id]/layout.js`), posts, DAOs and proposals.
  - Generated preview images: `app/opengraph-image.js` (default) and `tribe/[id]/opengraph-image.js`.
  - `app/robots.js`, plus `app/sitemap.js`: the public pages, top public tribes and mainnet DAOs, rebuilt hourly.
- **Old URLs:** `next.config.mjs` redirects `/dao/…`, `/dao/…/proposals/new|:id` and `/daos/create` permanently.
- **Rendering rule:** any public page that reads `useSearchParams` must be wrapped in `<Suspense>`, because public pages prerender and the build fails otherwise.

## Run

```bash
cp .env.example .env.local   # add NEXT_PUBLIC_ALCHEMY_KEY
npm install
npm run dev                  # http://localhost:3000
npm run test:crypto          # wallet encryption compatibility with the app
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/(auth)/*` | Welcome, login, register, verify-email, profile-setup, wallet-setup |
| `src/app/(main)/*` | Signed-in app: Feed, Tribes, DAOs, App, Wallet tabs, tribe preview |
| `src/components/flow/FlowGate.js` | Route guard. Mirrors the app's `AuthNavigator` state machine (`src/lib/flow.js`) and restores a link opened before sign-in |
| `src/components/shell/*` | Phone: the app's header, tab bar and drawer. Desktop: X-style `SideNav`, centre column and `RightRail` |
| `src/components/layout/PageHeader.js` | Sticky column header with title and/or tabs |
| `src/contexts/*` | Theme, Query cache, Feedback (loading overlay and alerts), Auth, Wallet |
| `src/lib/cache/*`, `src/hooks/queries.js` | IndexedDB and TanStack Query caching (see below) |
| `src/lib/crypto/walletCrypto.js` | Byte-compatible port of `crypto-wallet/utils/Encryption.js` |
| `src/app/globals.css` | Theme tokens, 1:1 with `crypto-wallet/constants/Theme.js` |

## Theming

Colours are CSS variables named after the app's `COLORS` keys (`--primary`, `--on-primary`, `--surface`, …) and exposed as Tailwind colours (`bg-primary text-on-primary`). Font sizes and radii match the app's `FONTS.sizes` and `BORDER_RADIUS`. Dark is the default. Light and system modes are also available, stored under the app's key `@app_theme_preference`. Follow the pairing rules at the top of `globals.css`.

## Layout

| Width | Layout |
| --- | --- |
| < 768px | The mobile app: header (avatar opens the drawer, logo, bell) and frosted bottom tab bar |
| 768–1099px | Glass workspace: a floating 76px icon dock and the content panel (up to 680px) |
| 1100–1279px | Adds the right column of glass widgets: tribe search, Top Tribes, Trending |
| ≥ 1280px | The dock widens to 248px with labels, the Create button and the account chip |

On desktop the panels float over an ambient backdrop (`AmbientBackdrop.js`), and each panel scrolls on its own. The glass styling comes from the `glass-panel`, `glass-strong`, `glow-primary` and `panel-scroll` utilities and the `--panel-*` tokens in `globals.css`, all built on the app's colours.

Because `backdrop-filter` makes each panel a containing block and its own stacking context, overlays must render through `components/ui/Portal.js`. `Modal`, `Popover` and the transaction success screen already do. Any new full-screen layer has to do the same.

## Client-side caching

1. **Firestore**: persistent multi-tab IndexedDB cache, so the profile and wallet address load instantly and work offline.
2. **API data**: TanStack Query with a per-query IndexedDB persister (`src/lib/cache/queryClient.js`). Each query is stored as its own record in the `tribe-web` database, in the `queries` store. Behaviour:
   - Stale-while-revalidate, controlled by each hook's `staleTime`.
   - Offline-first, so cached data renders without a connection.
   - Duplicate requests are merged, with retry and backoff for server errors.
   - Optimistic `setQueryData` writes are persisted too.
   - Invalidations reach other open tabs through `invalidateEverywhere()`.
3. **App records**: the `kv` store (for example account names and the active account).

Rules:
- Query keys start with `["public", …]` or `["user", uid, …]`.
- Volatile queries opt out with `meta: { persist: false }`.
- Bump `CACHE_BUSTER` when a cached response shape changes.
- Entries expire after 7 days, and the store is capped at 800 records (least recently saved are dropped first).
- Signing out, in any tab, wipes that user's records and Firestore's cache, then reloads.
- Never cache key material.

## Wallet screens (`src/app/(main)/wallet/*`)

| Route | Ported from (app) |
| --- | --- |
| `/wallet` | HomeScreen (community mode): member card, quick actions, Badges & NFTs, wallet strip |
| `/wallet/assets`, `/wallet/assets/manage` | TokensScreen, TokenImportScreen |
| `/wallet/token/[address\|native]` | TokenDetailScreen (CoinGecko chart for ETH) |
| `/wallet/send` (+ `/wallet/send/[token]` deep link) | SendScreen, TransactionModal, TransactionSuccessScreen |
| `/wallet/receive` | ReceiveScreen, with QR and payment links |
| `/wallet/activity` | TransactionsScreen |
| `/wallet/nfts`, `/wallet/nft/[contract]/[tokenId]` | NFTScreen, NFTDetailScreen, NFTSendScreen |
| `/wallet/recovery-phrase` | RecoveryPhraseScreen |

Data sources:
- **Balances**: Alchemy RPC. Held ERC-20s are discovered automatically with `alchemy_getTokenBalances`.
- **History**: `alchemy_getAssetTransfers`. Blockscout's API sits behind a Cloudflare challenge.
- **Token list and NFTs**: the backend (`/swap/tokens`, `/nfts`).
- **ETH price**: the backend's CoinGecko proxy.
- **Chart**: CoinGecko's public API, as in the app.

Spam handling: tokens outside the curated Robinhood list are marked "Unverified", kept off the home screen, and listed in a collapsed section on Assets.

Every transfer goes through `lib/chain/tx.js` (build, then estimate with 20% gas headroom) and `components/wallet/TxFlow.js` (review, password, submit, wait for one confirmation).

## Sign in with a wallet (SIWE)

Login, Register and Welcome offer **Continue with wallet** alongside email and password. The flow:

1. RainbowKit connects the wallet.
2. The wallet signs a gas-less EIP-4361 message containing a one-time nonce.
3. The backend (`backend/src/services/siweService.js`) checks the signature and finds or creates the account bound to that address in `walletAccounts/{address}`.
4. The backend returns a Firebase custom token, and the client signs in with it. The session persists like any other.
5. New users go to profile setup, where an email is optional and must be verified by link before it's attached.

Wallet-signed accounts (`users/{uid}.authProvider === "wallet"`) skip email verification and have no Tribe-held keys. `ExternalWalletProvider` in `WalletContext.js` signs every transaction in the connected wallet, after checking that it's the bound address and switching to Robinhood Chain if needed. Backup Phrase and Add Account are hidden for them.

Requirements:
- **Backend deploy**: the backend must be running the new `/auth/siwe/nonce`, `/auth/siwe/verify` and `/auth/siwe/link` (POST/DELETE) routes.
- **Allowed domains**: set `SIWE_ALLOWED_DOMAINS` on the backend to include the web app's host (the default covers `sysfi.network`, `www.`, `app.` and `localhost:3000`).
- **WalletConnect**: set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` here.
- **Tests**: `node scripts/verify-siwe.mjs` in `backend/` tests signature verification against the chain.

Email and Google accounts can add a wallet login later from **Settings → Link a wallet**. The wallet signs a link message, then the backend records `walletAccounts/{address}` → uid and `users/{uid}.linkedWalletAddress`. A wallet already bound to another account returns 409. **Unlink** removes the binding. Transactions still use the Tribe wallet.

## Social (`feed`, `tribes`, `tribe/[id]/*`, `post/*`, `profile`, `settings`)

- Hooks live in `src/hooks/tribes.js` (queries, mutations and optimistic reactions) and `src/hooks/useTribeChat.js` (chat, described below).

### Realtime chat

- **Live updates:** `src/lib/realtime.js` keeps one WebSocket per tab to the backend's `/ws`. It opens on the first tribe subscription and closes 30 s after the last one.
  - It authenticates with the Firebase ID token and re-sends it whenever the token rotates.
  - It reconnects with backoff, and immediately when the browser comes back online.
  - On reconnect it re-subscribes with `since` (the newest message timestamp the page has), so missed messages arrive as a backlog.
  - Override the URL with `NEXT_PUBLIC_REALTIME_URL`. By default it's derived from `NEXT_PUBLIC_BACKEND_URL`.
- **What's pushed:** new, edited, deleted and pinned messages, purges, chat settings, and typing indicators.
- **Fallback:** while the socket isn't open, `useTribeChat` falls back to the 3 s poll and the 30 s reconcile.
- **Outbox:** every send carries a `clientId`. If it can't be delivered (offline, socket dropped, timeout, 5xx), it stays queued in IndexedDB, survives reloads, and is sent in order when the connection is back. The server de-duplicates by `clientId` for 10 minutes. Only real rejections (locked chat, slow mode, too long) show as failed.
- **Backend:**
  - `realtime/gateway.js` is the socket protocol.
  - `realtime/bus.js` fans events out to every worker and instance over Redis pub/sub.
  - `services/chatService.js` is the single write path. It stores, broadcasts, then queues side effects.
  - `jobs/chatQueue.js` is the BullMQ `chat-events` queue: unread counters and bot events, with retries. It runs inline when Redis is down.
- **Deploying:** your proxy must pass WebSocket upgrades on `/ws` (`Upgrade`/`Connection` headers, a read timeout above 30 s).
- Posting uses the global compose dialog in `components/post/ComposeContext.js`, opened from the side nav's **Create** button.
- **Change Password** in Settings re-authenticates, re-encrypts `wallets/{uid}` under the new password (`rekeyWallet`) and then changes the Firebase password. The app's change-password flow skips the re-encrypt step, which leaves the cloud wallet locked to the old password.

## Networks (`src/lib/chains.js`)

The wallet and trade support Robinhood Chain (the default), Ethereum, Base, BNB Chain, Polygon, Arbitrum, HyperEVM and Arc. Each chain is one entry in `lib/chains.js`, which also feeds wagmi, the RPC layer, market data, swaps and DAOs. The active chain is global: switching it in the wallet, on Trade or on DAOs moves all three.

- **RPC** (`lib/chain/transport.js`):
  - Every read goes to the fastest healthy public RPC first.
  - If it hasn't answered within 2.5 s, Alchemy (or the next public node) is raced and the first answer wins.
  - Rate limits, 5xx and network errors put an endpoint in a cooldown.
  - `eth_sendRawTransaction` is never raced, and an "already known" from a second node counts as success.
  - The key in `NEXT_PUBLIC_ALCHEMY_KEY` is optional.
- **Balances** go through one Multicall3 call (same address on every chain) over the chain's curated token list plus the user's added tokens. Lists come from the backend `/swap/tokens`, merged with `src/utils/token/*`; Ethereum, HyperEVM and Arc were generated from LI.FI's token registry.
- **Alchemy-only features**: discovering unlisted tokens (one page, 5 s budget) and transfer history. Without Alchemy on a chain, history links to the explorer.
- **Prices**: gas tokens come from the backend CoinGecko proxy, with gaps filled from CoinGecko's public API. Listed tokens are priced through GeckoTerminal (unlisted ones stay unpriced so spam can't inflate totals).
- **Arc**:
  - The gas token is USDC (18 decimals). The ERC-20 at `0x3600…0000` is the same balance with 6 decimals.
  - The wallet lists it once, as the native coin.
  - Trade uses the ERC-20 (`swap.nativeAs`) and keeps a gas reserve on "Max".
- **Swaps**: 0x everywhere it's available; LI.FI (same-chain) on Arc, where 0x isn't.
- **Market data** goes through the backend's cached GeckoTerminal proxy (`/markets/gt/*`, three allowlisted endpoints). It falls back to GeckoTerminal directly on backends without the route.
- **DAOs**: governance shows on chains whose entry has a `daoFactory`. Deploying `contracts/DAOFactory.sol` to another chain means setting that one field.

To add a chain: append an entry with public `rpcs`, an `alchemy` subdomain if any, `explorer`, `nativeCurrency`, `wrappedNative`, `gtNetwork`, `swap` and `gasReserve`. Optionally add a token list in `src/utils/token`.

## Asset registry + chain abstraction

- **Registry:** `backend/scripts/build-assets.mjs` (`npm run build:assets` in `backend/`) builds one entry per economic asset (USDC, ETH, cbBTC, NVDA…) with its address and decimals on every chain.
  - **Sources:** the Uniswap default list (`default-token-list/`, GPL-3.0, data credited), our `src/utils/token` lists, and a short hand-verified list. LI.FI's `coinKey` groups them.
  - **Spam guard:** only curated tokens are included. Bridged and pegged variants (USDC.e, USDbC) stay separate assets.
  - **Output:** `backend/src/data/assets.json`, served by `GET /api/v1/assets` (ETag, filters `chainId`, `ids`, `q`, `verified`), plus a copy at `web/public/data/assets.json` that the web falls back to until the backend deploys.
  - **Reading it:** `src/lib/assets.js` loads it. Per-chain token lists (`loadTokenList`) now come from it.
- **All networks wallet:** the wallet home defaults to "All networks". `useAllChainsPortfolio` reads every chain (one Multicall each, public RPC), groups balances by asset, prices them and shows a per-chain breakdown.
- **Trade "pay from anywhere":**
  - The ticket's "with" token can live on any chain (`lib/swap/sources.js`).
  - For a buy it auto-picks the source: the market chain's gas token, else your largest stablecoin or gas-token holding anywhere. You can change it.
  - Different chains quote through LI.FI (bridge and swap, signed on the source chain). The same chain keeps 0x (LI.FI on Arc).
  - `BridgeTracker` follows the trade via `/lifi/status` until it lands.
- **Transport note:** ethers batches concurrent calls, so `lib/chain/transport.js` splits `alchemy_*` calls out of mixed batches. An indexer call never moves ordinary reads to Alchemy, or fails them when Alchemy refuses a chain.

## Explore + mini-apps v2 (`explore`, `explore/[id]`, `explore/dev`, `tribe/[id]/apps`)

- **Explore** replaces the App tab (`/apps` redirects to it) and has two groups:
  - **Mini-apps** run inside Tribe.
  - **Built on Tribe** are external listings (`kind: "external"`) that open in a new tab.
- **Host:** `components/explore/MiniAppHost.js` runs a mini-app in a sandboxed iframe.
  - It accepts messages only from that iframe's window **and** the app's origin, and replies only to that origin.
  - Every call is checked against granted scopes. Chain reads need none; accounts need `wallet:read`, signing `wallet:sign`, transactions and payments `wallet:send`.
  - Signatures go through `SignRequestSheet`. Transactions and `tribe.pay` go through `ActionTxSheet`, so the simulation and wallet authorisation flow apply.
- **Consent:** from Explore, the user grants scopes on first open (`ConsentSheet` → `PUT /miniapps/:id/grant`, revocable on the app page). Inside a tribe, the owner's install grants apply.
- **Payments:** `lib/miniapp/pay.js` resolves the asset in the registry. It transfers on the target chain if you hold enough, otherwise bridges the same asset from another chain to the recipient via LI.FI, sized so they get at least the amount.
- **Developer preview** (`/explore/dev`) runs any https (or `http://localhost`) URL in the real host with hand-picked scopes and an "unreviewed" banner. Storage stays in IndexedDB there.
- **Protocol:** `src/lib/miniapp/protocol.js` is **generated** by `miniapp-sdk/scripts/build.mjs`. Don't edit it; change `miniapp-sdk/src/protocol.js` and run `npm run build` there.
- **Mobile:** the mobile app's WebView host is still bridge v1. The SDK falls back to its injected `window.MiniApp`, but `eth.request`, `tribe.pay` and `tribe.context` arrive with milestone 6.

## Developer portal (`developers`, `developers/apps/[id]`)

- **Flow:** apply (`POST /developers/apply`) → team review → **verified**. Only verified developers (or admins) can submit to Explore (`POST /miniapps`). Listings show the verified display name, not a client-supplied one.
- **Tabs** (once verified):
  - **Apps:** status, opens, installs and reviewer notes. The editor validates live with the generated `lib/miniapp/manifest.js`.
  - **API keys:** for the public API (milestone 4). Secrets are `tribe_live_…`, stored only as SHA-256 hashes and shown once, with up to 10 active keys and per-key scopes from `backend/src/config/apiScopes.js`.
  - **Profile.**
- **Review** tab, for UIDs in the backend's `ADMIN_UIDS`: developer applications (verify or reject) and app submissions (approve, request changes or suspend). Notes are shown to the developer.
  - Suspending a developer also suspends their live apps and revokes their keys.
  - "Try in preview" opens `/explore/dev?url=…` prefilled.
- **Backend:** `api/v1/developers/*`, `services/developerService.js`, migration `007_developer_platform.sql`.

## Bots

- **Building:** verified developers create bots in the portal's **Bots** tab (`/developers/bots/[id]`). There they set commands, permissions and a webhook URL (or leave it empty to poll), rotate the token or secret, send a test event, and see the 24-hour delivery log.
- **Testing:** before approval, a bot can only be added by its developer, to tribes they own or moderate.
- **Explore → Bots:** approved bots are listed here. `/explore/bots/[id]` has an "Add to a tribe" button for owners and moderators. Only owners can grant the sensitive permissions, `messages:read` and `messages:manage`.
- **Managing:** tribe settings (owners) and the tribe's Apps tab (moderators) list installed bots, let you change their permissions, and remove them.
- **Chat:** bot messages show a BOT badge, cards and buttons. A click goes to the bot, and its `toast` shows only to the member who clicked. The composer's `/` menu lists installed bots' commands.
- **Backend:**
  - `api/v1/bots` (people)
  - `api/bot/v1` (bots, routes generated from `tribe-sdk/spec/bot-openapi.js`)
  - `services/{botService,botEvents,botMessages}.js`
  - migration `008_bots.sql`
  - the Mongo `bot_events` collection, with a 24-hour TTL

## Shared with the mobile app

The mobile app (`crypto-wallet/`) bundles some of `src/lib` directly through its `metro.config.js`, so there's one implementation of each:

- **What's shared:** the chain registry, RPC failover, asset registry, the portfolio (`lib/portfolio.js`), transactions, `tribe.pay`, the mini-app protocol and API, the bots API and formatting.
- **Chains and providers:** the app's `constants/Chain.js` is built from `lib/chains.js`, and its `createProviderForChain` returns the shared failover provider. Every on-chain call in the app goes public-RPC first, with Alchemy as the fallback.
- **Tests:** `npm test` runs `test/*.test.mjs` with plain `node --test`. `test/alias-hooks.mjs` maps `@/` to `src/` and stubs `@/lib/api`.

How Metro resolves imports:

- **Stand-ins:** `@/lib/config` and `@/lib/api` resolve to the app's own stand-ins in `crypto-wallet/shared/`.
- **Refused:** `@/lib/firebase` is refused outright.
- **npm packages:** these resolve from the app's `node_modules`.

Rules for modules in `src/lib`:

- **Keep them pure:** no React, no `window`/`document` at import time, no `@/lib/firebase`.
- **Re-bundle after changes:** after changing a shared module, run `npx expo export --platform android` in `crypto-wallet/`. A module that breaks these rules fails the bundle with a message naming the import.
- **EAS builds:** these must upload the whole repo, not just `crypto-wallet/`, because the app reaches into `web/src/lib`.

## Public API reference (`developers/docs`)

- **Source:** `/developers/docs` renders `lib/publicApi/spec.js`, which is **generated**. Edit `tribe-sdk/spec/openapi.js`, then run `npm run build` in `tribe-sdk/`.
- **One spec, three consumers:** the backend registers `/api/public/v1/*` routes from the same spec, and `@tribe/sdk` builds its methods and types from it. The docs, the API and the SDK can't drift.
- **Keys:** keys from the portal authenticate there. Each key gets 300 requests per minute, and the portal's key list shows requests made today and this week.

## Trade (`swap`)

A spot trading screen.
- **Desktop:** watchlist, then market header, chart and pools, then the order ticket.
- **Phone:** header, then chart, then ticket, then pools.

How it works:
- **Execution:** the backend's 0x proxy (`/swap/price` while typing, `/swap/quote` on submit), then `ActionTxSheet`. It approves only the amount being sold; the app approves an unlimited amount.
- **Market data:** GeckoTerminal's public API (`src/lib/swap/market.js`) covers every Robinhood Chain pool, including tokenized stocks. It rate-limits around 30 calls a minute per IP, so queries cache and back off on 429.
- **Chart:** `lightweight-charts` 5.2.1 (Apache-2.0). Keep the TradingView attribution logo; the licence requires it.
- **Restricted tokens:** 0x refuses tokenized stocks ("not authorized for trade due to legal restrictions"). They chart normally, but the ticket explains why they can't be traded.
- **Price impact:** 0x v2 doesn't return it, so the ticket compares value in and out at market prices and labels it "incl. fees".
- **Colours:** `--up`, `--down` and `--neutral` in `globals.css` are the only non-monochrome status colours. They're for buy/sell, gains/losses and vote options.

## DAOs (`daos`, `daos/launch`, `daos/[chainId]/[address]/*`)

- **Contracts**: `DelegatedDAO` and `DAOFactory` (source in `../contracts/`). The factory is at `0x38D6…4A94` on Robinhood Chain and on its testnet.
- **Data sources**:
  - The DAO list comes from the backend (`/daos/chain/:id`).
  - Everything else is read from the contracts in `src/lib/dao/chain.js`: settings, token, treasury, proposals and your balance, delegation and ballots.
  - Hooks are in `src/hooks/daos.js`.
- **Pages**:
  - List: search, genre filter, a "Holding" filter, and grid or list view.
  - DAO page: Overview, Active, Past and My Stats tabs. My Stats includes delegate and revoke.
  - Proposal detail: results, quorum, timeline, and vote / finalize / execute / cancel.
  - Create proposal.
  - Launch wizard.
- **Transactions**:
  - Every action goes through `components/wallet/ActionTxSheet.js`. It simulates the first step, so a doomed call shows the contract's reason before you sign.
  - Multi-step actions (approve, then delegate or create) run under one authorisation.
- **Vote maths**:
  - A vote weighs `sqrt(balance in base units)`, so displayed votes are that weight ÷ 10^(decimals/2). The app assumes 18 decimals.
  - Quorum is `sqrt(totalSupply) × quorum% / 100` "For" weight.
- **Launch**:
  - Takes the proposal threshold in tokens. The app sends the raw number, so its DAOs have a threshold of 100 base units.
  - Optional description and links are sent to `/daos/register` as off-chain metadata.

## Wallet security model on the web

- The Firebase session persists across reloads, so there is no unlock step to use the app. The wallet address comes from the encrypted cloud blob.
- Every on-chain action is authorised on the spot, matching the app's `createSignerForTransaction(passcode)`:
  - `withSigner(provider, fn)` and `withSecret(fn)` open a confirm sheet.
  - The sheet decrypts `wallets/{uid}` (scrypt N=2^17 and AES-256-GCM, address as AAD) using the account password, or the Google key for Google-only accounts.
  - The action runs, then the key is dropped. Nothing decrypted is kept in state or storage.
- The app's 6-digit device PIN is deliberately not offered. A PIN-encrypted copy in browser storage could be brute-forced offline.
- Account derivation copies the app exactly, including its non-standard BIP-39 password (see `src/lib/wallet.js`).
