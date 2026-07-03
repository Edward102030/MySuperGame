# MySuperGame
# Prize Rush — Pokémon TCG Tournament & Collection

A client-side web app: collect cards via the live Pokémon TCG API, build decks,
battle an AI opponent, run single-elimination tournaments, and grow a binder —
all in New Zealand Dollars.

## Run it
Just open `index.html` in a browser, or serve the folder (e.g. `npx serve .`)
and push it to GitHub Pages. No build step, no dependencies.

Optional: set a free API key from https://pokemontcg.io in `app.js`
(`APP_CONFIG.pokemonTcgApiKey`) to raise the API rate limit. It works fine
unauthenticated for normal use.

## Honest scope note
Accounts, wallets, decks, and the collection are **local-first**: real,
working, persisted in the browser via `localStorage`, with a `Persistence`
layer already shaped like a sync client (queue, conflict comparison, push/pull).
There's no live Firebase/Supabase project behind it, since that requires
infrastructure and secrets only you can provision. To add real multi-device
cloud sync later, you only need to rewrite `Persistence.SyncAdapter` and the
`login`/`register` methods in `auth.js` — no other file touches storage
directly, per the module boundaries below.

Deck size is trimmed to 20 cards / 3 prizes (instead of 60/6) so a full match
plays out in a few minutes — the spec explicitly frames the starter decks as
"introductory," and this keeps games fast and learnable while still exercising
the full rules loop (bench, evolution, energy, weakness/resistance, retreat,
knockouts, prizes, win conditions).

## File map
- `index.html`, `style.css` — shell, screens, and the full design system
- `storage.js` — persistence layer, event bus, autosave/resume, sync queue
- `api.js` — Pokémon TCG API client with caching, retry, offline fallback
- `animations.js` — animation queue + timing, respects the speed setting
- `ui.js` — screen/page manager, dialogs, toasts, shared render helpers
- `auth.js` — accounts, guest mode, session, salted-hash local auth
- `economy.js` — wallet, transactions, currency formatting (NZD)
- `binder.js` — collection manager + Binder page (search/filter/sort/stats)
- `deckbuilder.js` — starter decks, deck CRUD/validation, Decks pages
- `engine.js` — game state, rules engine, match controller, Match page
- `ai.js` — AI opponent (observe → evaluate → score → act pipeline)
- `tournament.js` — bracket generation/lifecycle, Tournament page
- `shop.js` — booster catalog, purchases, pack opening, Shop pages
- `profile.js`, `settings.js` — profile/stats and preferences
- `app.js` — boot sequence, auth/starter-deck flow, Home & Play pages
