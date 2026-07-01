/* =========================================================
   PokeTCGNZ — app.js
   Engine logic, persistence, and the full historical pack DB
   ========================================================= */

(function () {
"use strict";

/* ====================================================
   1. STATE
   ==================================================== */
let wallet = 100.00;
let inventory = [];           // [{id, name, set, value, rarity, img, dupeKey}]
let activeDeck = null;        // array of card refs (60) or null -> starter
let trainerName = "Trainer";

let stats = {
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  packsOpened: 0,
  totalEarnings: 0.0
};

let match = null; // active match object while in arena

/* ====================================================
   2. PACK DATABASE (NZD)
   ==================================================== */
const PACKS = [
  // CLASSIC ERA
  era("Classic", [
    ["Base Set", 1999, 1250.00, "Charizard Holo", 950, "base1"],
    ["Jungle", 1999, 280.00, "Flareon Holo", 95, "base2"],
    ["Fossil", 1999, 280.00, "Gengar Holo", 120, "base3"],
    ["Base Set 2", 2000, 320.00, "Mewtwo Holo", 110, "base4"],
    ["Team Rocket", 2000, 350.00, "Dark Raichu Holo", 165, "base5"],
    ["Gym Heroes", 2000, 380.00, "Blaine's Moltres", 140, "gym1"],
    ["Gym Challenge", 2000, 420.00, "Sabrina's Gengar", 210, "gym2"],
    ["Neo Genesis", 2000, 650.00, "Lugia Holo", 480, "neo1"],
    ["Neo Discovery", 2001, 380.00, "Umbreon Holo", 230, "neo2"],
    ["Neo Revelation", 2001, 550.00, "Shining Gyarados", 450, "neo3"],
    ["Southern Islands", 2001, 250.00, "Mew", 180, "si1"],
    ["Neo Destiny", 2002, 950.00, "Shining Charizard", 1200, "neo4"],
    ["Legendary Collection", 2002, 780.00, "Reverse Holo Charizard", 850, "base6"],
    ["Expedition Base Set", 2002, 580.00, "Tyranitar Holo", 220, "ecard1"],
    ["Aquapolis", 2002, 850.00, "Lugia Crystal", 900, "ecard2"],
    ["Skyridge", 2003, 1650.00, "Charizard Crystal", 1500, "ecard3"],
  ]),
  // EX ERA
  era("EX", [
    ["EX Ruby & Sapphire", 2003, 380.00, "Mewtwo ex", 140, "ex1"],
    ["EX Sandstorm", 2003, 240.00, "Typhlosion ex", 95, "ex2"],
    ["EX Dragon", 2003, 260.00, "Rayquaza ex", 180, "ex3"],
    ["EX Team Magma vs Team Aqua", 2004, 240.00, "Houndoom", 65, "ex4"],
    ["EX Hidden Legends", 2004, 280.00, "Regice ex", 110, "ex5"],
    ["EX FireRed & LeafGreen", 2004, 480.00, "Charizard ex", 420, "ex6"],
    ["EX Team Rocket Returns", 2004, 580.00, "Mudkip Gold Star", 650, "ex7"],
    ["EX Deoxys", 2005, 820.00, "Rayquaza Gold Star", 1100, "ex8"],
    ["EX Emerald", 2005, 280.00, "Milotic ex", 130, "ex9"],
    ["EX Unseen Forces", 2005, 550.00, "Celebi Gold Star", 480, "ex10"],
    ["EX Delta Species", 2005, 490.00, "Metagross Gold Star", 420, "ex11"],
    ["EX Legend Maker", 2006, 420.00, "Registeel Gold Star", 360, "ex12"],
    ["EX Holon Phantoms", 2006, 450.00, "Pikachu Gold Star", 680, "ex13"],
    ["EX Crystal Guardians", 2006, 480.00, "Charizard Delta", 290, "ex14"],
    ["EX Dragon Frontiers", 2006, 650.00, "Charizard Gold Star", 1250, "ex15"],
    ["EX Power Keepers", 2007, 320.00, "Charizard Holo", 110, "ex16"],
  ]),
  // DP / PLATINUM / HGSS
  era("DP/Platinum/HGSS", [
    ["Diamond & Pearl", 2007, 195.00, "Torterra LV.X", 55, "dp1"],
    ["Mysterious Treasures", 2007, 165.00, "Lucario LV.X", 45, "dp2"],
    ["Secret Wonders", 2007, 180.00, "Charizard Secret", 90, "dp3"],
    ["Great Encounters", 2008, 160.00, "Darkrai LV.X", 40, "dp4"],
    ["Majestic Dawn", 2008, 210.00, "Glaceon LV.X", 120, "dp5"],
    ["Legends Awakened", 2008, 240.00, "Mewtwo LV.X", 95, "dp6"],
    ["Stormfront", 2008, 290.00, "Charizard Secret", 260, "dp7"],
    ["Platinum Base", 2009, 180.00, "Giratina LV.X", 65, "pl1"],
    ["Rising Rivals", 2009, 210.00, "Alakazam 4 LV.X", 90, "pl2"],
    ["Supreme Victors", 2009, 195.00, "Charizard G LV.X", 185, "pl3"],
    ["Arceus", 2009, 180.00, "Gengar LV.X", 85, "pl4"],
    ["HeartGold SoulSilver", 2010, 290.00, "Lugia LEGEND", 145, "hgss1"],
    ["HGSS Unleashed", 2010, 195.00, "Crobat Prime", 35, "hgss2"],
    ["HGSS Undaunted", 2010, 240.00, "Umbreon Prime", 110, "hgss3"],
    ["HGSS Triumphant", 2010, 270.00, "Gengar Prime", 130, "hgss4"],
    ["Call of Legends", 2011, 380.00, "Shiny Rayquaza", 240, "col1"],
  ]),
  // BLACK & WHITE
  era("Black & White", [
    ["Black & White Base", 2011, 85.00, "Zekrom Full Art", 45, "bw1"],
    ["Emerging Powers", 2011, 60.00, "Tornadus Full Art", 15, "bw2"],
    ["Noble Victories", 2011, 105.00, "N Full Art", 95, "bw3"],
    ["Next Destinies", 2012, 125.00, "Mewtwo EX", 75, "bw4"],
    ["Dark Explorers", 2012, 195.00, "Darkrai EX Full Art", 110, "bw5"],
    ["Dragons Exalted", 2012, 165.00, "Rayquaza EX", 85, "bw6"],
    ["Boundaries Crossed", 2012, 155.00, "Computer Search", 65, "bw7"],
    ["Plasma Storm", 2013, 180.00, "Charizard Shiny Secret", 380, "bw8"],
    ["Plasma Freeze", 2013, 195.00, "Ultra Ball Secret", 160, "bw9"],
    ["Plasma Blast", 2013, 155.00, "Iris Full Art", 95, "bw10"],
    ["Legendary Treasures", 2013, 220.00, "Mew EX Gold", 55, "bw11"],
  ]),
  // XY
  era("XY", [
    ["XY Base", 2014, 60.00, "Yveltal EX", 20, "xy1"],
    ["Flashfire", 2014, 155.00, "Charizard EX Secret", 280, "xy2"],
    ["Furious Fists", 2014, 55.00, "Lucario EX", 18, "xy3"],
    ["Phantom Forces", 2014, 90.00, "Gengar EX Shiny", 55, "xy4"],
    ["Primal Clash", 2015, 60.00, "Kyogre EX Primal", 45, "xy5"],
    ["Roaring Skies", 2015, 75.00, "Shaymin EX", 30, "xy6"],
    ["Ancient Origins", 2015, 70.00, "Rayquaza EX Shiny", 95, "xy7"],
    ["BREAKthrough", 2015, 48.00, "Mewtwo EX Red", 35, "xy8"],
    ["BREAKpoint", 2016, 52.00, "Gyarados EX Shiny", 40, "xy9"],
    ["Generations", 2016, 95.00, "Charizard Radiant", 45, "g1"],
    ["Fates Collide", 2016, 45.00, "Alakazam EX Secret", 35, "xy10"],
    ["Steam Siege", 2016, 35.00, "Volcanion EX", 10, "xy11"],
    ["Evolutions", 2016, 58.00, "Charizard Holo Reprint", 95, "xy12"],
  ]),
  // SUN & MOON
  era("Sun & Moon", [
    ["Sun & Moon Base", 2017, 30.00, "Solgaleo GX Rainbow", 35, "sm1"],
    ["Guardians Rising", 2017, 32.00, "Tapu Lele GX", 25, "sm2"],
    ["Burning Shadows", 2017, 48.00, "Charizard GX Rainbow", 450, "sm3"],
    ["Shining Legends", 2017, 85.00, "Mewtwo Secret", 135, "sm35"],
    ["Crimson Invasion", 2017, 25.00, "Lusamine Full Art", 40, "sm4"],
    ["Ultra Prism", 2018, 62.00, "Lillie Full Art", 380, "sm5"],
    ["Forbidden Light", 2018, 38.00, "Ultra Necrozma Rainbow", 35, "sm6"],
    ["Celestial Storm", 2018, 45.00, "Rayquaza GX Rainbow", 115, "sm7"],
    ["Dragon Majesty", 2018, 75.00, "Reshiram GX Rainbow", 45, "sm75"],
    ["Lost Thunder", 2018, 48.00, "Lugia GX Rainbow", 185, "sm8"],
    ["Team Up", 2019, 135.00, "Latias & Latios GX Alt Art", 950, "sm9"],
    ["Unbroken Bonds", 2019, 85.00, "Reshiram & Charizard GX", 145, "sm10"],
    ["Unified Minds", 2019, 75.00, "Mewtwo & Mew GX Alt", 195, "sm11"],
    ["Hidden Fates", 2019, 42.00, "Charizard GX Shiny SV49", 520, "sm115"],
    ["Cosmic Eclipse", 2019, 90.00, "Arceus & Dialga & Palkia Alt", 165, "sm12"],
  ]),
  // SWORD & SHIELD
  era("Sword & Shield", [
    ["Sword & Shield Base", 2020, 19.50, "Zacian V Gold", 25, "swsh1"],
    ["Rebel Clash", 2020, 16.50, "Sonia Full Art", 35, "swsh2"],
    ["Darkness Ablaze", 2020, 21.00, "Charizard VMAX", 45, "swsh3"],
    ["Champions Path", 2020, 45.00, "Charizard V Shiny", 240, "swsh35"],
    ["Vivid Voltage", 2020, 19.50, "Pikachu VMAX Rainbow", 185, "swsh4"],
    ["Shining Fates", 2021, 25.00, "Charizard VMAX Shiny", 150, "swsh45"],
    ["Battle Styles", 2021, 12.50, "Tyranitar V Alt Art", 120, "swsh5"],
    ["Chilling Reign", 2021, 19.50, "Blaziken VMAX Alt Art", 280, "swsh6"],
    ["Evolving Skies", 2021, 39.00, "Umbreon VMAX Alt Art", 1100, "swsh7"],
    ["Celebrations", 2021, 22.50, "Charizard Classic", 95, "cel25"],
    ["Fusion Strike", 2021, 16.50, "Gengar VMAX Alt Art", 320, "swsh8"],
    ["Brilliant Stars", 2022, 19.50, "Charizard V Alt Art", 220, "swsh9"],
    ["Astral Radiance", 2022, 15.50, "Machamp V Alt Art", 145, "swsh10"],
    ["Pokémon GO", 2022, 14.50, "Mewtwo V Alt Art", 45, "pgo"],
    ["Lost Origin", 2022, 16.50, "Giratina V Alt Art", 480, "swsh11"],
    ["Silver Tempest", 2022, 15.50, "Lugia V Alt Art", 260, "swsh12"],
  ]),
  // SCARLET & VIOLET +
  era("Scarlet & Violet", [
    ["Crown Zenith", 2023, 22.00, "Giratina VSTAR GG", 145, "swsh12pt5"],
    ["Scarlet & Violet Base", 2023, 11.00, "Miriam SIR", 45, "sv1"],
    ["Paldea Evolved", 2023, 11.00, "Iono SIR", 110, "sv2"],
    ["Obsidian Flames", 2023, 11.00, "Charizard ex SIR", 75, "sv3"],
    ["151 Special Set", 2023, 18.00, "Charizard ex SIR", 165, "sv3pt5"],
    ["Paradox Rift", 2023, 11.00, "Roaring Moon ex SIR", 95, "sv4"],
    ["Paldean Fates", 2024, 14.00, "Charizard ex Shiny SIR", 185, "sv4pt5"],
    ["Temporal Forces", 2024, 11.00, "Iron Leaves ex SIR", 65, "sv5"],
    ["Twilight Masquerade", 2024, 11.00, "Greninja ex SIR", 290, "sv6"],
    ["Shrouded Fable", 2024, 11.00, "Cassiopeia SIR", 85, "sv6pt5"],
    ["Stellar Crown", 2024, 11.00, "Terapagos ex SIR", 110, "sv7"],
    ["Surging Sparks", 2024, 11.00, "Pikachu ex SIR", 380, "sv8"],
    ["Prismatic Evolutions", 2025, 14.00, "Eevee Friends SIR", 220, "sv8pt5"],
    ["Chaos Rising", 2026, 10.50, "Chaos Dragon Secret", 165, "me4"],
    ["Horizon Zero", 2026, 10.50, "Stellar Rayquaza ex", 150, "me2pt5"],
  ]),
];

// Real pokemontcg.io set IDs are embedded per-pack above (6th tuple field).
// At runtime, openPack() fetches genuine card data + artwork for that real
// set from the live Pokémon TCG API (api.pokemontcg.io), with a graceful
// text-card fallback if the network call fails.
function era(name, rows) {
  return rows.map(([packName, year, price, featCard, featVal, realSetId]) => ({
    id: slug(packName),
    name: packName,
    era: name,
    year,
    price,
    realSetId,
    feature: { name: featCard, value: featVal }
  }));
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

const ALL_PACKS = PACKS.flat();
const TOTAL_SETS = ALL_PACKS.length;

/* ====================================================
   3. STARTER DECKS — 100% legal, competitively built (60 cards each)
   ==================================================== */
const DECK_TEMPLATES = {
  // "Charizard ex" — a genuine top-tier Standard archetype (2023–24 format).
  charizard: {
    displayName: "Charizard ex",
    realSetId: "sv3",
    energyName: "Fire Energy",
    list: [
      ["Charmander", 4, 60, "basic"],
      ["Charmeleon", 2, 90, "stage"],
      ["Charizard ex", 3, 330, "stage"],
      ["Pidgey", 2, 60, "basic"],
      ["Pidgeotto", 2, 80, "stage"],
      ["Radiant Charizard", 1, 160, "stage"],
      ["Professor's Research", 4, 0, "trainer"],
      ["Iono", 2, 0, "trainer"],
      ["Boss's Orders", 2, 0, "trainer"],
      ["Ultra Ball", 4, 0, "trainer"],
      ["Nest Ball", 4, 0, "trainer"],
      ["Rare Candy", 3, 0, "trainer"],
      ["Battle VIP Pass", 3, 0, "trainer"],
      ["Switch", 2, 0, "trainer"],
      ["Super Rod", 2, 0, "trainer"],
      ["Earthen Vessel", 2, 0, "trainer"],
      ["Forest Seal Stone", 2, 0, "trainer"],
      ["Technical Machine: Evolution", 2, 0, "trainer"],
      ["Counter Catcher", 2, 0, "trainer"],
      ["Fire Energy", 10, 0, "energy"],
      ["Jet Energy", 2, 0, "energy"],
    ]
  },
  // "Dragapult ex / Miraidon ex" — the other genuine top-tier Standard archetype
  // from the same era, used for the AI opponent so matches feel like real games.
  miraidon: {
    displayName: "Miraidon ex",
    realSetId: "sv1",
    energyName: "Lightning Energy",
    list: [
      ["Miraidon ex", 3, 220, "basic"],
      ["Dreepy", 3, 60, "basic"],
      ["Drakloak", 2, 80, "stage"],
      ["Dragapult ex", 3, 280, "stage"],
      ["Bidoof", 2, 60, "basic"],
      ["Bibarel", 1, 110, "stage"],
      ["Professor's Research", 4, 0, "trainer"],
      ["Iono", 2, 0, "trainer"],
      ["Boss's Orders", 2, 0, "trainer"],
      ["Ultra Ball", 4, 0, "trainer"],
      ["Nest Ball", 4, 0, "trainer"],
      ["Rare Candy", 3, 0, "trainer"],
      ["Battle VIP Pass", 3, 0, "trainer"],
      ["Switch", 2, 0, "trainer"],
      ["Super Rod", 2, 0, "trainer"],
      ["Earthen Vessel", 2, 0, "trainer"],
      ["Counter Catcher", 2, 0, "trainer"],
      ["Technical Machine: Evolution", 2, 0, "trainer"],
      ["Lost Vacuum", 2, 0, "trainer"],
      ["Lightning Energy", 10, 0, "energy"],
      ["Psychic Energy", 2, 0, "energy"],
    ]
  }
};

// Sanity-check every template at load time: exactly 60 cards, max 4 non-energy copies.
function auditDeckTemplate(t) {
  const total = t.list.reduce((sum, [, count]) => sum + count, 0);
  if (total !== 60) console.warn(`Deck template "${t.displayName}" has ${total} cards, expected 60.`);
  t.list.forEach(([name, count, , flag]) => {
    if (flag !== "energy" && count > 4) console.warn(`Deck template "${t.displayName}": ${name} has ${count} copies (max 4).`);
  });
}
Object.values(DECK_TEMPLATES).forEach(auditDeckTemplate);

async function buildDeckFromTemplate(template) {
  const realPool = await fetchSetCards(template.realSetId);
  const deck = [];

  template.list.forEach(([name, count, hp, flag]) => {
    for (let i = 0; i < count; i++) {
      let img = "";
      let realHp = hp;

      if (realPool) {
        const match = realPool.find(rc => rc.name.toLowerCase() === name.toLowerCase())
          || realPool.find(rc => rc.name.toLowerCase().includes(name.toLowerCase()));
        if (match) {
          img = (match.images && (match.images.large || match.images.small)) || "";
          if (match.hp) realHp = parseInt(match.hp, 10) || hp;
        }
      }

      const isPokemon = flag === "basic" || flag === "stage";
      const c = card(
        name,
        `${template.displayName} Deck`,
        0,
        isPokemon ? "Pokémon" : (flag === "energy" ? "Energy" : "Trainer"),
        { flag, img }
      );
      if (isPokemon) { c.hp = realHp; c.maxHp = realHp; }
      c.sellable = false; // preset competitive decks aren't cash-out fodder
      deck.push(c);
    }
  });

  return deck;
}

function buildStarterDeck() {
  return buildDeckFromTemplate(DECK_TEMPLATES.charizard);
}
function buildOpponentDeck() {
  return buildDeckFromTemplate(DECK_TEMPLATES.miraidon);
}

function card(name, set, value, rarity, extra) {
  return Object.assign({
    id: cryptoId(),
    name, set, value, rarity,
    img: "",
    sellable: true
  }, extra || {});
}
function cryptoId() { return "c" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* ---- LIVE CARD DATA (real Pokémon TCG API — images + names) ---- */
const CARD_CACHE = {}; // realSetId -> array of real card objects, or null if fetch failed

async function fetchSetCards(realSetId) {
  if (!realSetId) return null;
  if (CARD_CACHE.hasOwnProperty(realSetId)) return CARD_CACHE[realSetId];
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(realSetId)}&pageSize=250`);
    if (!res.ok) throw new Error("API responded with " + res.status);
    const json = await res.json();
    CARD_CACHE[realSetId] = (json.data && json.data.length) ? json.data : null;
  } catch (e) {
    log(`Could not reach the live card database for this set — using placeholder art.`, "warn");
    CARD_CACHE[realSetId] = null;
  }
  return CARD_CACHE[realSetId];
}

// Buckets a real card's official rarity string into our gacha tiers.
function rarityTier(apiRarity) {
  if (!apiRarity) return "common";
  const r = apiRarity.toLowerCase();
  if (r.includes("secret") || r.includes("rainbow") || r.includes("gold") || r.includes("hyper")) return "secret";
  if (r.includes("ultra") || /\b(ex|gx|v|vmax|vstar|lv\.x|prime|legend|star)\b/.test(r)) return "ultra";
  if (r.includes("holo") || r.includes("rare")) return "holo";
  return "common";
}

// Picks a random real card from a set's cached pool matching the desired tier,
// falling back to progressively broader pools if that tier is empty.
function pickRealCard(pool, tier) {
  const byTier = (t) => pool.filter(c => rarityTier(c.rarity) === t);
  let candidates = byTier(tier);
  if (!candidates.length && tier === "secret") candidates = byTier("ultra");
  if (!candidates.length && (tier === "secret" || tier === "ultra")) candidates = byTier("holo");
  if (!candidates.length) candidates = pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/* ====================================================
   4. PERSISTENCE
   ==================================================== */
const SAVE_KEY = "poketcgnz_save_v1";

function saveGame() {
  const payload = {
    wallet, inventory, activeDeck, trainerName, stats
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    log("Save failed: storage error.", "warn");
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { firstRun(); return; }
    const data = JSON.parse(raw);
    wallet = data.wallet ?? 100.00;
    inventory = data.inventory ?? [];
    activeDeck = data.activeDeck ?? null;
    trainerName = data.trainerName ?? "Trainer";
    stats = Object.assign({ wins: 0, losses: 0, streak: 0, bestStreak: 0, packsOpened: 0, totalEarnings: 0 }, data.stats || {});
  } catch (e) {
    firstRun();
  }
}

function firstRun() {
  wallet = 100.00;
  inventory = [];
  activeDeck = null;
  trainerName = "Trainer";
  stats = { wins: 0, losses: 0, streak: 0, bestStreak: 0, packsOpened: 0, totalEarnings: 0 };
  log("New trainer profile initialized. Starter funds: $100.00 NZD.", "event");
  saveGame();
}

/* ====================================================
   5. LOGGING
   ==================================================== */
function log(msg, cls) {
  const el = document.getElementById("log");
  const line = document.createElement("div");
  if (cls) line.className = `log-${cls}`;
  const t = new Date().toLocaleTimeString("en-NZ", { hour12: false });
  line.textContent = `[${t}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 200) el.removeChild(el.firstChild);
}

/* ====================================================
   6. ASSET / WALLET CALCULATIONS
   ==================================================== */
function binderValue() {
  return inventory.reduce((sum, c) => sum + (c.sellable !== false ? c.value : 0), 0);
}
function fmtMoney(n) {
  return "$" + (Math.round(n * 100) / 100).toFixed(2);
}
function cardImgBlock(c) {
  return c.img
    ? `<div class="binder-card-img"><img src="${c.img}" onerror="this.parentElement.innerHTML='';" alt="${c.name}"/></div>`
    : `<div class="binder-card-img"></div>`;
}

/* ====================================================
   7. RENDERING — HEADER / HOME
   ==================================================== */
function renderHeader() {
  document.getElementById("hdr-wallet").textContent = fmtMoney(wallet);
  document.getElementById("hdr-assets").textContent = fmtMoney(wallet + binderValue());
}

function renderHome() {
  document.getElementById("welcome-text").textContent = `Welcome back, ${trainerName}.`;
  document.getElementById("stat-wl").textContent = `${stats.wins} – ${stats.losses}`;
  document.getElementById("stat-streak").textContent = stats.bestStreak;
  document.getElementById("stat-packs").textContent = stats.packsOpened;

  let mvc = inventory.reduce((best, c) => (!best || c.value > best.value) ? c : best, null);
  document.getElementById("stat-mvc").textContent = mvc ? `${mvc.name} (${fmtMoney(mvc.value)})` : "—";

  document.getElementById("stat-earnings").textContent = fmtMoney(stats.totalEarnings);

  const ownedSets = new Set(inventory.filter(c => c.sellable !== false).map(c => c.set));
  document.getElementById("stat-sets").textContent = `${ownedSets.size}/${TOTAL_SETS}`;
}

/* ====================================================
   8. RENDERING — PACKS STORE
   ==================================================== */
function renderPacks() {
  const container = document.getElementById("pack-container");
  container.innerHTML = "";
  ALL_PACKS.forEach(p => {
    const div = document.createElement("div");
    div.className = "pack-card";
    div.innerHTML = `
      <div class="pack-thumb">🎴</div>
      <div class="pack-era">${p.era} · ${p.year}</div>
      <div class="pack-name">${p.name}</div>
      <div class="pack-feature">Chase: ${p.feature.name}</div>
      <div class="pack-price">${fmtMoney(p.price)}</div>
      <button class="btn-primary pack-buy-btn" data-pack="${p.id}">Buy &amp; Open</button>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll(".pack-buy-btn").forEach(btn => {
    btn.addEventListener("click", () => buyPack(btn.dataset.pack));
  });
}

async function buyPack(packId) {
  const pack = ALL_PACKS.find(p => p.id === packId);
  if (!pack) return;
  if (wallet < pack.price) {
    log(`Insufficient funds to purchase ${pack.name} (${fmtMoney(pack.price)}).`, "warn");
    return;
  }
  wallet -= pack.price;
  log(`Purchased ${pack.name} for ${fmtMoney(pack.price)}.`, "money");
  renderHeader();
  saveGame();

  document.getElementById("pack-open-title").textContent = `Opening ${pack.name}…`;
  document.getElementById("pack-open-results").innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Pulling cards from the live card database…</div>`;
  document.getElementById("pack-open-modal").classList.remove("hidden");

  const pulled = await openPack(pack);
  stats.packsOpened++;
  pulled.forEach(c => inventory.push(c));
  renderHeader();
  renderHome();
  saveGame();
  showPackOpenModal(pack, pulled);
}

async function openPack(pack) {
  const realPool = await fetchSetCards(pack.realSetId);
  const results = [];
  const slots = 10;
  for (let i = 0; i < slots; i++) {
    const roll = Math.random() * 100;
    let rarity, tier;
    if (roll < 1) { rarity = "Secret Rare"; tier = "secret"; }
    else if (roll < 7) { rarity = "Ultra Rare"; tier = "ultra"; }
    else if (roll < 25) { rarity = "Holo Rare"; tier = "holo"; }
    else { rarity = "Common/Uncommon"; tier = "common"; }

    let name, value, img;
    if (realPool) {
      const realCard = pickRealCard(realPool, tier);
      name = realCard.name;
      img = (realCard.images && (realCard.images.large || realCard.images.small)) || "";
      if (tier === "secret") value = round2(pack.feature.value * (0.85 + Math.random() * 0.3));
      else if (tier === "ultra") value = round2(pack.feature.value * 0.5 * (0.85 + Math.random() * 0.3));
      else if (tier === "holo") value = round2(pack.feature.value * 0.05 * (0.7 + Math.random() * 0.6));
      else value = round2(0.5 + Math.random() * 2.5);
    } else {
      // live database unreachable — fall back to a labelled placeholder card
      img = "";
      if (tier === "secret" || tier === "ultra") {
        name = pack.feature.name;
        value = round2(pack.feature.value * (tier === "secret" ? 1.0 : 0.5) * (0.85 + Math.random() * 0.3));
      } else if (tier === "holo") {
        name = `${pack.name} Holo Common`;
        value = round2(pack.feature.value * 0.05 * (0.7 + Math.random() * 0.6));
      } else {
        name = `${pack.name} Common`;
        value = round2(0.5 + Math.random() * 2.5);
      }
    }
    results.push(card(name, pack.name, value, rarity, { img }));
  }
  return results;
}
function round2(n) { return Math.round(n * 100) / 100; }

function showPackOpenModal(pack, pulled) {
  document.getElementById("pack-open-title").textContent = `Opened: ${pack.name}`;
  const wrap = document.getElementById("pack-open-results");
  wrap.innerHTML = "";
  pulled.forEach(c => {
    const div = document.createElement("div");
    let rClass = "";
    if (c.rarity === "Secret Rare") rClass = "rarity-secret";
    else if (c.rarity === "Ultra Rare") rClass = "rarity-ultra";
    else if (c.rarity === "Holo Rare") rClass = "rarity-holo";
    div.className = `pulled-card ${rClass}`;
    const imgTag = c.img
      ? `<img src="${c.img}" onerror="this.style.display='none'" alt="${c.name}" />`
      : `<div class="binder-card-img" style="width:100%;"></div>`;
    div.innerHTML = `
      ${imgTag}
      <div>${c.name}</div>
      <div class="pulled-card-value">${fmtMoney(c.value)}</div>
    `;
    wrap.appendChild(div);
  });
  log(`Pull complete: ${pulled.length} cards added to binder from ${pack.name}.`, "event");
  document.getElementById("pack-open-modal").classList.remove("hidden");
}


/* ====================================================
   9. RENDERING — BINDER & MARKET
   ==================================================== */
function getSortedBinder() {
  const sortVal = document.getElementById("binder-sort").value;
  const filterVal = document.getElementById("binder-filter").value;
  let list = inventory.slice();
  if (filterVal === "deck-eligible") list = list.filter(c => c.sellable !== false);
  switch (sortVal) {
    case "value-desc": list.sort((a, b) => b.value - a.value); break;
    case "value-asc": list.sort((a, b) => a.value - b.value); break;
    case "name": list.sort((a, b) => a.name.localeCompare(b.name)); break;
    case "set": list.sort((a, b) => a.set.localeCompare(b.set)); break;
  }
  return list;
}

function renderBinder() {
  const container = document.getElementById("binder-container");
  const list = getSortedBinder();
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">Your binder is empty. Visit the Packs store to start pulling cards.</div>`;
    return;
  }
  list.forEach(c => {
    const div = document.createElement("div");
    div.className = "binder-card";
    div.innerHTML = `
      <span class="binder-rarity-tag">${c.rarity || "Card"}</span>
      ${cardImgBlock(c)}
      <div class="binder-card-name">${c.name}</div>
      <div class="binder-card-set">${c.set}</div>
      <div class="binder-card-value">${fmtMoney(c.value)}</div>
    `;
    container.appendChild(div);
  });
}

function renderMarket() {
  const container = document.getElementById("market-container");
  const list = inventory.filter(c => c.sellable !== false).slice().sort((a, b) => b.value - a.value);
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">No sellable cards in your binder yet.</div>`;
    return;
  }
  list.forEach(c => {
    const div = document.createElement("div");
    div.className = "market-card";
    div.innerHTML = `
      ${cardImgBlock(c)}
      <div class="binder-card-name">${c.name}</div>
      <div class="binder-card-set">${c.set}</div>
      <div class="binder-card-value">Sell: ${fmtMoney(c.value)}</div>
      <button class="btn-secondary" data-sell="${c.id}">Sell Card</button>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll("[data-sell]").forEach(btn => {
    btn.addEventListener("click", () => sellCard(btn.dataset.sell));
  });
}

function sellCard(cardId) {
  const idx = inventory.findIndex(c => c.id === cardId);
  if (idx === -1) return;
  const c = inventory[idx];
  wallet += c.value;
  inventory.splice(idx, 1);
  log(`Sold ${c.name} for ${fmtMoney(c.value)}.`, "money");
  renderHeader();
  renderHome();
  renderMarket();
  renderBinder();
  saveGame();
}

/* ====================================================
   10. DECK MANAGEMENT
   ==================================================== */
async function getActiveDeck() {
  if (activeDeck && activeDeck.length === 60) return activeDeck;
  activeDeck = await buildStarterDeck();
  log(`No legal deck found — granted a tournament-ready ${DECK_TEMPLATES.charizard.displayName} deck (60 cards, fully legal).`, "event");
  saveGame();
  return activeDeck;
}

async function renderDeckSummary() {
  const deck = await getActiveDeck();
  const pokemon = deck.filter(c => c.flag === "basic" || c.flag === "stage").length;
  const trainers = deck.filter(c => c.flag === "trainer").length;
  const energies = deck.filter(c => c.flag === "energy").length;
  document.getElementById("deck-count-pokemon").textContent = pokemon;
  document.getElementById("deck-count-trainer").textContent = trainers;
  document.getElementById("deck-count-energy").textContent = energies;
  document.getElementById("deck-count-total").textContent = deck.length;

  const nameEl = document.getElementById("deck-name");
  const tagEl = document.getElementById("deck-legal-tag");
  if (nameEl && tagEl) {
    nameEl.textContent = deck[0] && deck[0].set ? deck[0].set : "Charizard ex Deck";
    const validation = validateDeck(deck);
    tagEl.textContent = validation.ok ? "Legal" : "Illegal";
    tagEl.classList.toggle("illegal", !validation.ok);
  }
}

/* ---- Live Tournaments list (PTCGL-style event board) ---- */
const TOURNAMENTS = [
  { id: "premier", name: "Auckland Championship", tag: "Premier Event", fee: 25.00, startsInMin: 12 },
  { id: "weekly", name: "Wellington Weekly Cup", tag: "Standard", fee: 8.00, startsInMin: 34 },
  { id: "showdown", name: "South Island Showdown", tag: "Expanded", fee: 15.00, startsInMin: 58 },
];

function renderTournamentList() {
  const container = document.getElementById("tournament-list");
  if (!container) return;
  container.innerHTML = "";
  TOURNAMENTS.forEach(t => {
    const row = document.createElement("div");
    row.className = "tournament-row";
    row.innerHTML = `
      <div class="tournament-info">
        <span class="tournament-format-tag">${t.tag}</span>
        <span class="tournament-name">${t.name}</span>
        <span class="tournament-meta">Swiss rounds · Top cut playoffs</span>
      </div>
      <div class="tournament-countdown">Starts in ${t.startsInMin}m</div>
      <div class="tournament-fee">${t.fee > 0 ? fmtMoney(t.fee) : "Free"}</div>
      <button class="btn-primary queue-btn" data-event="${t.id}">Register</button>
    `;
    container.appendChild(row);
  });
}

const BASIC_ENERGY_NAMES = new Set([
  "Fire Energy", "Water Energy", "Grass Energy", "Lightning Energy",
  "Psychic Energy", "Fighting Energy", "Darkness Energy", "Metal Energy",
  "Fairy Energy", "Colorless Energy", "Basic Energy"
]);

function validateDeck(deck) {
  if (deck.length !== 60) return { ok: false, reason: `Deck must contain exactly 60 cards (has ${deck.length}).` };
  const counts = {};
  deck.forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; });
  for (const name in counts) {
    if (counts[name] > 4 && !BASIC_ENERGY_NAMES.has(name)) {
      return { ok: false, reason: `Too many duplicates of ${name} (max 4).` };
    }
  }
  return { ok: true };
}

/* ====================================================
   11. MATCH SIMULATION ENGINE
   ==================================================== */
const EVENT_FEES = { ranked: 0, casual: 0, premier: 25.00, weekly: 8.00, showdown: 15.00 };
const EVENT_REWARDS = { ranked: 8.00, casual: 0, premier: 65.00, weekly: 22.00, showdown: 40.00 };

async function startQueue(eventType) {
  const fee = EVENT_FEES[eventType] || 0;
  if (fee > 0) {
    if (wallet < fee) { log(`Cannot enter this event: insufficient funds for ${fmtMoney(fee)} entry.`, "warn"); return; }
    wallet -= fee;
    log(`Entry fee of ${fmtMoney(fee)} paid.`, "money");
    renderHeader();
  }

  const deck = await getActiveDeck();
  const validation = validateDeck(deck);
  if (!validation.ok) { log(`Deck illegal: ${validation.reason}`, "warn"); wallet += fee; renderHeader(); return; }

  log(`Matchmaking queue joined. Searching for opponent…`, "event");
  const oppDeck = await buildOpponentDeck();
  showMatchFoundThen(() => setupMatch(eventType, deck, oppDeck));
}

function showMatchFoundThen(callback) {
  const modal = document.getElementById("match-found-modal");
  const timerEl = document.getElementById("match-found-timer");
  let n = 3;
  timerEl.textContent = n;
  modal.classList.remove("hidden");
  const interval = setInterval(() => {
    n--;
    if (n > 0) {
      timerEl.textContent = n;
    } else {
      clearInterval(interval);
      modal.classList.add("hidden");
      log("Opponent found. Entering the arena.", "event");
      callback();
    }
  }, 700);
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setupMatch(eventType, deckCards, oppDeckCards) {
  const playerDeck = shuffled(deckCards);
  const oppDeck = shuffled(oppDeckCards);

  match = {
    eventType,
    turn: 1,
    activePlayer: "p", // p = player, o = opponent
    energyAttachedThisTurn: false,
    player: makeSide(playerDeck),
    opponent: makeSide(oppDeck),
    over: false
  };

  // initial setup: draw 7, place a basic active
  drawHand(match.player, 7);
  drawHand(match.opponent, 7);
  placeBasicActive(match.player);
  placeBasicActive(match.opponent);

  log("Both players drew opening hands of 7. Basic Pokémon placed Active.", "event");
  document.getElementById("league-lobby").style.display = "none";
  document.getElementById("match-arena").classList.remove("hidden");
  renderMatch();
}

function makeSide(deck) {
  return {
    deck,
    hand: [],
    discard: [],
    bench: [],
    active: null,
    prizes: 6
  };
}

function drawHand(side, n) {
  for (let i = 0; i < n; i++) {
    if (side.deck.length === 0) { triggerDeckOut(side); return; }
    side.hand.push(side.deck.shift());
  }
}

function placeBasicActive(side) {
  const idx = side.hand.findIndex(c => c.flag === "basic");
  if (idx === -1) {
    // no basic — mulligan: shuffle hand back, redraw 7 (simplified)
    side.deck = shuffled(side.deck.concat(side.hand));
    side.hand = [];
    drawHand(side, 7);
    return placeBasicActive(side);
  }
  const [basic] = side.hand.splice(idx, 1);
  basic.hp = basic.hp || 60;
  basic.maxHp = basic.hp;
  side.active = basic;
}

function triggerDeckOut(side) {
  if (match.over) return;
  match.over = true;
  const playerLost = side === match.player;
  endMatch(!playerLost, "Deck Out");
}

/* ---- RENDER MATCH ---- */
function renderMatch() {
  if (!match) return;
  const p = match.player, o = match.opponent;

  // ---- PRIZE ROWS (face-down backs) + counts ----
  renderPrizeRow("p-prizes", p.prizes);
  renderPrizeRow("o-prizes", o.prizes);
  document.getElementById("p-prize-count").textContent = p.prizes;
  document.getElementById("o-prize-count").textContent = o.prizes;

  // ---- ACTIVE CARDS (large, real art, HP pill) ----
  renderActiveCard("p-active", p.active);
  renderActiveCard("o-active", o.active);

  // ---- BENCH (small real art slots) ----
  for (let i = 1; i <= 5; i++) renderBenchSlot("b" + i, p.bench[i - 1]);
  for (let i = 1; i <= 5; i++) renderBenchSlot("ob" + i, o.bench[i - 1]);

  // ---- DECK BACKS + COUNTS ----
  document.getElementById("deck-count-label").textContent = p.deck.length;
  document.getElementById("o-deck-count").textContent = o.deck.length;

  // ---- DISCARD PILES (top card face-up if present) ----
  renderDiscardSlot("p-discard", "p-discard-count", p.discard);
  renderDiscardSlot("o-discard", "o-discard-count", o.discard);

  // ---- OPPONENT HAND (face-down fan + count) ----
  const oppFan = document.getElementById("opp-hand-fan");
  oppFan.querySelectorAll(".fan-back-card").forEach(el => el.remove());
  const oppCount = Math.min(o.hand.length, 8);
  for (let i = 0; i < oppCount; i++) {
    const d = document.createElement("div");
    d.className = "fan-back-card";
    oppFan.insertBefore(d, oppFan.firstChild);
  }
  document.getElementById("opp-hand-count").textContent = o.hand.length;

  // ---- PLAYER HAND (real art fan) ----
  const handEl = document.getElementById("hand-row");
  handEl.innerHTML = "";
  p.hand.forEach(c => {
    const d = document.createElement("div");
    d.className = "hand-card-real";
    d.title = c.flag || c.rarity || "";
    d.innerHTML = c.img
      ? `<img src="${c.img}" alt="${c.name}" onerror="this.parentElement.textContent='${c.name.replace(/'/g, "")}';" />`
      : c.name;
    d.addEventListener("click", () => handCardClicked(c));
    handEl.appendChild(d);
  });
  document.getElementById("player-hand-count").textContent = p.hand.length;

  // ---- TURN RAIL (prize counts double as the turn indicator, PTCGL-style) ----
  document.getElementById("opp-turn-count").textContent = o.prizes;
  document.getElementById("player-turn-count").textContent = p.prizes;
}

function renderPrizeRow(elId, count) {
  const el = document.getElementById(elId);
  el.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "prize-back";
    el.appendChild(d);
  }
}

function renderActiveCard(elId, mon) {
  const el = document.getElementById(elId);
  if (!mon) {
    el.innerHTML = `<span class="zone-label-empty">Active</span>`;
    return;
  }
  const imgTag = mon.img ? `<img src="${mon.img}" alt="${mon.name}" onerror="this.style.display='none'" />` : "";
  el.innerHTML = `${imgTag}<div class="hp-pill-lg">${mon.hp}/${mon.maxHp}</div>`;
}

function renderBenchSlot(elId, mon) {
  const el = document.getElementById(elId);
  if (!mon) { el.innerHTML = ""; return; }
  const imgTag = mon.img ? `<img src="${mon.img}" alt="${mon.name}" onerror="this.style.display='none'" />` : "";
  el.innerHTML = `${imgTag}<div class="hp-pill">${mon.hp}</div>`;
}

function renderDiscardSlot(elId, countId, discardPile) {
  const el = document.getElementById(elId);
  const top = discardPile[discardPile.length - 1];
  const imgTag = top && top.img ? `<img src="${top.img}" alt="${top.name}" onerror="this.style.display='none'" />` : "";
  el.innerHTML = `${imgTag}<span class="discard-count" id="${countId}">${discardPile.length}</span>`;
}

function handCardClicked(c) {
  if (match.activePlayer !== "p") { log("It is not your turn.", "warn"); return; }
  if (c.flag === "energy") {
    if (match.energyAttachedThisTurn) { log("Energy attachment limit reached this turn (max 1).", "warn"); return; }
    match.energyAttachedThisTurn = true;
    const idx = match.player.hand.indexOf(c);
    match.player.hand.splice(idx, 1);
    log(`Attached ${c.name} to Active Pokémon.`, "event");
    renderMatch();
    return;
  }
  const img = document.getElementById("card-render-img");
  if (c.img) { img.src = c.img; img.style.display = ""; }
  else { img.removeAttribute("src"); img.style.display = "none"; }
  document.getElementById("card-meta").textContent = `${c.name} — ${c.set}`;
}

function flipCoin() {
  const result = Math.random() < 0.5 ? "Heads" : "Tails";
  log(`Coin flip: ${result}.`, "event");
}

function attack() {
  if (!match || match.over) return;
  if (match.activePlayer !== "p") { log("It is not your turn.", "warn"); return; }
  const p = match.player, o = match.opponent;
  if (!p.active) { log("No Active Pokémon to attack with.", "warn"); return; }
  if (!o.active) { log("Opponent has no Active Pokémon.", "warn"); return; }

  const dmg = 10 + Math.floor(Math.random() * 30);
  o.active.hp -= dmg;
  log(`${p.active.name} attacks ${o.active.name} for ${dmg} damage.`, "event");

  if (o.active.hp <= 0) {
    handleKnockout(o, p);
  }
  renderMatch();
  checkWinConditions();
  if (!match.over) endTurn();
}

function handleKnockout(defeatedSide, attackerSide) {
  const koCard = defeatedSide.active;
  log(`${koCard.name} was Knocked Out!`, "event");
  defeatedSide.discard.push(koCard);
  defeatedSide.active = null;

  let prizeCount = 1;
  if (/\b(EX|ex|GX|VMAX)\b/.test(koCard.name)) prizeCount = 3;
  else if (/\b(V|LV\.X)\b/.test(koCard.name)) prizeCount = 2;

  for (let i = 0; i < prizeCount; i++) {
    if (attackerSide.prizes > 0) attackerSide.prizes--;
  }
  log(`${attackerSide === match.player ? "You" : "Opponent"} take ${prizeCount} prize card(s).`, "event");

  if (defeatedSide.bench.length > 0) {
    defeatedSide.active = defeatedSide.bench.shift();
    log(`${defeatedSide === match.player ? "Your" : "Opponent's"} bench Pokémon ${defeatedSide.active.name} promoted to Active.`, "event");
  }
}

function checkWinConditions() {
  if (match.over) return;
  const p = match.player, o = match.opponent;

  if (p.prizes <= 0) { endMatch(true, "All Prizes Taken"); return; }
  if (o.prizes <= 0) { endMatch(false, "Opponent Took All Prizes"); return; }
  if (!p.active && p.bench.length === 0) { endMatch(false, "No Pokémon Remaining"); return; }
  if (!o.active && o.bench.length === 0) { endMatch(true, "Opponent Has No Pokémon Remaining"); return; }
}

function endTurn() {
  if (!match || match.over) return;
  match.activePlayer = match.activePlayer === "p" ? "o" : "p";
  match.energyAttachedThisTurn = false;
  match.turn++;

  const side = match.activePlayer === "p" ? match.player : match.opponent;
  if (side.deck.length === 0) { triggerDeckOut(side); return; }
  side.hand.push(side.deck.shift());
  log(`${match.activePlayer === "p" ? "Your" : "Opponent's"} turn begins. Card drawn.`, "event");

  renderMatch();

  if (match.activePlayer === "o") {
    setTimeout(opponentTurn, 700);
  }
}

function opponentTurn() {
  if (!match || match.over) return;
  const o = match.opponent, p = match.player;
  if (!o.active) { endTurn(); return; }
  if (!p.active) { return; }

  const dmg = 8 + Math.floor(Math.random() * 28);
  p.active.hp -= dmg;
  log(`${o.active.name} attacks ${p.active.name} for ${dmg} damage.`, "event");

  if (p.active.hp <= 0) {
    handleKnockout(p, o);
  }
  renderMatch();
  checkWinConditions();
  if (!match.over) endTurn();
}

function concede() {
  if (!match || match.over) return;
  log("You conceded the match.", "warn");
  endMatch(false, "Concede");
}

function endMatch(playerWon, reason) {
  match.over = true;
  if (playerWon) {
    stats.wins++;
    stats.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    const reward = EVENT_REWARDS[match.eventType] || 0;
    wallet += reward;
    stats.totalEarnings += reward;
    log(`Victory! (${reason}) Prize earnings: ${fmtMoney(reward)}.`, "money");
  } else {
    stats.losses++;
    stats.streak = 0;
    log(`Defeat. (${reason})`, "warn");
  }
  renderHeader();
  renderHome();
  saveGame();

  setTimeout(() => {
    document.getElementById("match-arena").classList.add("hidden");
    document.getElementById("league-lobby").style.display = "";
    match = null;
  }, 1800);
}

/* ====================================================
   12. VIEW NAVIGATION
   ==================================================== */
function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const view = document.getElementById("view-" + viewName);
  const btn = document.getElementById("nav-" + viewName);
  if (view) view.classList.add("active-view");
  if (btn) btn.classList.add("active");

  if (viewName === "home") renderHome();
  if (viewName === "packs") renderPacks();
  if (viewName === "binder") renderBinder();
  if (viewName === "market") renderMarket();
  if (viewName === "league") { renderDeckSummary(); renderTournamentList(); }
}

/* ====================================================
   13. EVENT WIRING
   ==================================================== */
function wireEvents() {
  document.querySelectorAll(".nav-btn:not(.disabled-nav)").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.getElementById("nav-multiplayer").addEventListener("click", () => {
    log("Multiplayer mode is currently under construction. Please check back in a future patch.", "warn");
  });

  document.getElementById("league-lobby").addEventListener("click", (e) => {
    const btn = e.target.closest(".queue-btn");
    if (btn) startQueue(btn.dataset.event);
  });

  const formatToggle = document.getElementById("format-toggle");
  if (formatToggle) {
    formatToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".format-btn");
      if (!btn) return;
      formatToggle.querySelectorAll(".format-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      log(`Switched to ${btn.textContent} format.`, "event");
    });
  }

  document.getElementById("btn-flip-coin").addEventListener("click", flipCoin);
  document.getElementById("btn-attack").addEventListener("click", attack);
  document.getElementById("btn-concede").addEventListener("click", concede);
  document.getElementById("btn-end-turn").addEventListener("click", () => {
    if (match && match.activePlayer === "p" && !match.over) endTurn();
  });

  document.getElementById("btn-settings").addEventListener("click", () => {
    document.getElementById("input-trainer-name").value = trainerName;
    document.getElementById("settings-modal").classList.remove("hidden");
  });
  document.getElementById("btn-close-settings").addEventListener("click", () => {
    trainerName = document.getElementById("input-trainer-name").value.trim() || "Trainer";
    document.getElementById("settings-modal").classList.add("hidden");
    renderHome();
    saveGame();
  });
  document.getElementById("btn-reset-save").addEventListener("click", () => {
    localStorage.removeItem(SAVE_KEY);
    firstRun();
    renderHeader();
    renderHome();
    document.getElementById("settings-modal").classList.add("hidden");
  });

  document.getElementById("btn-close-pack-open").addEventListener("click", () => {
    document.getElementById("pack-open-modal").classList.add("hidden");
    renderBinder();
  });

  document.getElementById("btn-change-deck").addEventListener("click", () => {
    document.getElementById("deck-modal").classList.remove("hidden");
  });
  document.getElementById("btn-close-deck-modal").addEventListener("click", () => {
    document.getElementById("deck-modal").classList.add("hidden");
  });

  document.getElementById("binder-sort").addEventListener("change", renderBinder);
  document.getElementById("binder-filter").addEventListener("change", renderBinder);
}

/* ====================================================
   14. BOOT
   ==================================================== */
function boot() {
  loadGame();
  wireEvents();
  renderHeader();
  renderHome();
  renderDeckSummary();
  renderTournamentList();
  log(`PokeTCGNZ engine online. ${ALL_PACKS.length} booster sets loaded.`, "event");
}

document.addEventListener("DOMContentLoaded", boot);

})();
