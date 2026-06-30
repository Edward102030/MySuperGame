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
    ["Base Set", 1999, 1250.00, "Charizard Holo", 950],
    ["Jungle", 1999, 280.00, "Flareon Holo", 95],
    ["Fossil", 1999, 280.00, "Gengar Holo", 120],
    ["Base Set 2", 2000, 320.00, "Mewtwo Holo", 110],
    ["Team Rocket", 2000, 350.00, "Dark Raichu Holo", 165],
    ["Gym Heroes", 2000, 380.00, "Blaine's Moltres", 140],
    ["Gym Challenge", 2000, 420.00, "Sabrina's Gengar", 210],
    ["Neo Genesis", 2000, 650.00, "Lugia Holo", 480],
    ["Neo Discovery", 2001, 380.00, "Umbreon Holo", 230],
    ["Neo Revelation", 2001, 550.00, "Shining Gyarados", 450],
    ["Southern Islands", 2001, 250.00, "Mew", 180],
    ["Neo Destiny", 2002, 950.00, "Shining Charizard", 1200],
    ["Legendary Collection", 2002, 780.00, "Reverse Holo Charizard", 850],
    ["Expedition Base Set", 2002, 580.00, "Tyranitar Holo", 220],
    ["Aquapolis", 2002, 850.00, "Lugia Crystal", 900],
    ["Skyridge", 2003, 1650.00, "Charizard Crystal", 1500],
  ]),
  // EX ERA
  era("EX", [
    ["EX Ruby & Sapphire", 2003, 380.00, "Mewtwo ex", 140],
    ["EX Sandstorm", 2003, 240.00, "Typhlosion ex", 95],
    ["EX Dragon", 2003, 260.00, "Rayquaza ex", 180],
    ["EX Team Magma vs Team Aqua", 2004, 240.00, "Houndoom", 65],
    ["EX Hidden Legends", 2004, 280.00, "Regice ex", 110],
    ["EX FireRed & LeafGreen", 2004, 480.00, "Charizard ex", 420],
    ["EX Team Rocket Returns", 2004, 580.00, "Mudkip Gold Star", 650],
    ["EX Deoxys", 2005, 820.00, "Rayquaza Gold Star", 1100],
    ["EX Emerald", 2005, 280.00, "Milotic ex", 130],
    ["EX Unseen Forces", 2005, 550.00, "Celebi Gold Star", 480],
    ["EX Delta Species", 2005, 490.00, "Metagross Gold Star", 420],
    ["EX Legend Maker", 2006, 420.00, "Registeel Gold Star", 360],
    ["EX Holon Phantoms", 2006, 450.00, "Pikachu Gold Star", 680],
    ["EX Crystal Guardians", 2006, 480.00, "Charizard Delta", 290],
    ["EX Dragon Frontiers", 2006, 650.00, "Charizard Gold Star", 1250],
    ["EX Power Keepers", 2007, 320.00, "Charizard Holo", 110],
  ]),
  // DP / PLATINUM / HGSS
  era("DP/Platinum/HGSS", [
    ["Diamond & Pearl", 2007, 195.00, "Torterra LV.X", 55],
    ["Mysterious Treasures", 2007, 165.00, "Lucario LV.X", 45],
    ["Secret Wonders", 2007, 180.00, "Charizard Secret", 90],
    ["Great Encounters", 2008, 160.00, "Darkrai LV.X", 40],
    ["Majestic Dawn", 2008, 210.00, "Glaceon LV.X", 120],
    ["Legends Awakened", 2008, 240.00, "Mewtwo LV.X", 95],
    ["Stormfront", 2008, 290.00, "Charizard Secret", 260],
    ["Platinum Base", 2009, 180.00, "Giratina LV.X", 65],
    ["Rising Rivals", 2009, 210.00, "Alakazam 4 LV.X", 90],
    ["Supreme Victors", 2009, 195.00, "Charizard G LV.X", 185],
    ["Arceus", 2009, 180.00, "Gengar LV.X", 85],
    ["HeartGold SoulSilver", 2010, 290.00, "Lugia LEGEND", 145],
    ["HGSS Unleashed", 2010, 195.00, "Crobat Prime", 35],
    ["HGSS Undaunted", 2010, 240.00, "Umbreon Prime", 110],
    ["HGSS Triumphant", 2010, 270.00, "Gengar Prime", 130],
    ["Call of Legends", 2011, 380.00, "Shiny Rayquaza", 240],
  ]),
  // BLACK & WHITE
  era("Black & White", [
    ["Black & White Base", 2011, 85.00, "Zekrom Full Art", 45],
    ["Emerging Powers", 2011, 60.00, "Tornadus Full Art", 15],
    ["Noble Victories", 2011, 105.00, "N Full Art", 95],
    ["Next Destinies", 2012, 125.00, "Mewtwo EX", 75],
    ["Dark Explorers", 2012, 195.00, "Darkrai EX Full Art", 110],
    ["Dragons Exalted", 2012, 165.00, "Rayquaza EX", 85],
    ["Boundaries Crossed", 2012, 155.00, "Computer Search", 65],
    ["Plasma Storm", 2013, 180.00, "Charizard Shiny Secret", 380],
    ["Plasma Freeze", 2013, 195.00, "Ultra Ball Secret", 160],
    ["Plasma Blast", 2013, 155.00, "Iris Full Art", 95],
    ["Legendary Treasures", 2013, 220.00, "Mew EX Gold", 55],
  ]),
  // XY
  era("XY", [
    ["XY Base", 2014, 60.00, "Yveltal EX", 20],
    ["Flashfire", 2014, 155.00, "Charizard EX Secret", 280],
    ["Furious Fists", 2014, 55.00, "Lucario EX", 18],
    ["Phantom Forces", 2014, 90.00, "Gengar EX Shiny", 55],
    ["Primal Clash", 2015, 60.00, "Kyogre EX Primal", 45],
    ["Roaring Skies", 2015, 75.00, "Shaymin EX", 30],
    ["Ancient Origins", 2015, 70.00, "Rayquaza EX Shiny", 95],
    ["BREAKthrough", 2015, 48.00, "Mewtwo EX Red", 35],
    ["BREAKpoint", 2016, 52.00, "Gyarados EX Shiny", 40],
    ["Generations", 2016, 95.00, "Charizard Radiant", 45],
    ["Fates Collide", 2016, 45.00, "Alakazam EX Secret", 35],
    ["Steam Siege", 2016, 35.00, "Volcanion EX", 10],
    ["Evolutions", 2016, 58.00, "Charizard Holo Reprint", 95],
  ]),
  // SUN & MOON
  era("Sun & Moon", [
    ["Sun & Moon Base", 2017, 30.00, "Solgaleo GX Rainbow", 35],
    ["Guardians Rising", 2017, 32.00, "Tapu Lele GX", 25],
    ["Burning Shadows", 2017, 48.00, "Charizard GX Rainbow", 450],
    ["Shining Legends", 2017, 85.00, "Mewtwo Secret", 135],
    ["Crimson Invasion", 2017, 25.00, "Lusamine Full Art", 40],
    ["Ultra Prism", 2018, 62.00, "Lillie Full Art", 380],
    ["Forbidden Light", 2018, 38.00, "Ultra Necrozma Rainbow", 35],
    ["Celestial Storm", 2018, 45.00, "Rayquaza GX Rainbow", 115],
    ["Dragon Majesty", 2018, 75.00, "Reshiram GX Rainbow", 45],
    ["Lost Thunder", 2018, 48.00, "Lugia GX Rainbow", 185],
    ["Team Up", 2019, 135.00, "Latias & Latios GX Alt Art", 950],
    ["Unbroken Bonds", 2019, 85.00, "Reshiram & Charizard GX", 145],
    ["Unified Minds", 2019, 75.00, "Mewtwo & Mew GX Alt", 195],
    ["Hidden Fates", 2019, 42.00, "Charizard GX Shiny SV49", 520],
    ["Cosmic Eclipse", 2019, 90.00, "Arceus & Dialga & Palkia Alt", 165],
  ]),
  // SWORD & SHIELD
  era("Sword & Shield", [
    ["Sword & Shield Base", 2020, 19.50, "Zacian V Gold", 25],
    ["Rebel Clash", 2020, 16.50, "Sonia Full Art", 35],
    ["Darkness Ablaze", 2020, 21.00, "Charizard VMAX", 45],
    ["Champions Path", 2020, 45.00, "Charizard V Shiny", 240],
    ["Vivid Voltage", 2020, 19.50, "Pikachu VMAX Rainbow", 185],
    ["Shining Fates", 2021, 25.00, "Charizard VMAX Shiny", 150],
    ["Battle Styles", 2021, 12.50, "Tyranitar V Alt Art", 120],
    ["Chilling Reign", 2021, 19.50, "Blaziken VMAX Alt Art", 280],
    ["Evolving Skies", 2021, 39.00, "Umbreon VMAX Alt Art", 1100],
    ["Celebrations", 2021, 22.50, "Charizard Classic", 95],
    ["Fusion Strike", 2021, 16.50, "Gengar VMAX Alt Art", 320],
    ["Brilliant Stars", 2022, 19.50, "Charizard V Alt Art", 220],
    ["Astral Radiance", 2022, 15.50, "Machamp V Alt Art", 145],
    ["Pokémon GO", 2022, 14.50, "Mewtwo V Alt Art", 45],
    ["Lost Origin", 2022, 16.50, "Giratina V Alt Art", 480],
    ["Silver Tempest", 2022, 15.50, "Lugia V Alt Art", 260],
  ]),
  // SCARLET & VIOLET +
  era("Scarlet & Violet", [
    ["Crown Zenith", 2023, 22.00, "Giratina VSTAR GG", 145],
    ["Scarlet & Violet Base", 2023, 11.00, "Miriam SIR", 45],
    ["Paldea Evolved", 2023, 11.00, "Iono SIR", 110],
    ["Obsidian Flames", 2023, 11.00, "Charizard ex SIR", 75],
    ["151 Special Set", 2023, 18.00, "Charizard ex SIR", 165],
    ["Paradox Rift", 2023, 11.00, "Roaring Moon ex SIR", 95],
    ["Paldean Fates", 2024, 14.00, "Charizard ex Shiny SIR", 185],
    ["Temporal Forces", 2024, 11.00, "Iron Leaves ex SIR", 65],
    ["Twilight Masquerade", 2024, 11.00, "Greninja ex SIR", 290],
    ["Shrouded Fable", 2024, 11.00, "Cassiopeia SIR", 85],
    ["Stellar Crown", 2024, 11.00, "Terapagos ex SIR", 110],
    ["Surging Sparks", 2024, 11.00, "Pikachu ex SIR", 380],
    ["Prismatic Evolutions", 2025, 14.00, "Eevee Friends SIR", 220],
    ["Chaos Rising", 2026, 10.50, "Chaos Dragon Secret", 165],
    ["Horizon Zero", 2026, 10.50, "Stellar Rayquaza ex", 150],
  ]),
];

function era(name, rows) {
  return rows.map(([packName, year, price, featCard, featVal]) => ({
    id: slug(packName),
    name: packName,
    era: name,
    year,
    price,
    setId: slug(packName).slice(0, 8),
    feature: { name: featCard, value: featVal }
  }));
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

const ALL_PACKS = PACKS.flat();
const TOTAL_SETS = ALL_PACKS.length;

/* ====================================================
   3. STARTER DECK (legal 60-card balance)
   ==================================================== */
function buildStarterDeck() {
  const deck = [];
  const basics = [
    { name: "Charmander", hp: 60, type: "Fire", flag: "basic" },
    { name: "Squirtle", hp: 60, type: "Water", flag: "basic" },
    { name: "Pidgey", hp: 50, type: "Colorless", flag: "basic" },
    { name: "Machop", hp: 60, type: "Fighting", flag: "basic" },
  ];
  // 14 basic pokemon (non-sellable starter assets)
  for (let i = 0; i < 14; i++) {
    const b = basics[i % basics.length];
    deck.push(card(`${b.name} #${i}`, "Base Starter Deck", 0, "Common", b));
  }
  // 22 energy
  for (let i = 0; i < 22; i++) {
    deck.push(card(`Basic Energy #${i}`, "Base Starter Deck", 0, "Energy", { type: "Energy", flag: "energy" }));
  }
  // 24 trainers
  for (let i = 0; i < 24; i++) {
    deck.push(card(`Trainer Item #${i}`, "Base Starter Deck", 0, "Trainer", { flag: "trainer" }));
  }
  deck.forEach(c => c.sellable = false);
  return deck;
}

function card(name, set, value, rarity, extra) {
  return Object.assign({
    id: cryptoId(),
    name, set, value, rarity,
    img: cardImgUrl(set, name),
    sellable: true
  }, extra || {});
}
function cryptoId() { return "c" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function cardImgUrl(setId, name) {
  // Best-effort open CDN guess; falls back to CSS box on error.
  const setSlug = slug(setId).slice(0, 8);
  const numGuess = Math.floor(Math.random() * 99) + 1;
  return `https://images.pokemontcg.io/${setSlug}/${numGuess}.png`;
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

function buyPack(packId) {
  const pack = ALL_PACKS.find(p => p.id === packId);
  if (!pack) return;
  if (wallet < pack.price) {
    log(`Insufficient funds to purchase ${pack.name} (${fmtMoney(pack.price)}).`, "warn");
    return;
  }
  wallet -= pack.price;
  log(`Purchased ${pack.name} for ${fmtMoney(pack.price)}.`, "money");
  const pulled = openPack(pack);
  stats.packsOpened++;
  pulled.forEach(c => inventory.push(c));
  renderHeader();
  renderHome();
  saveGame();
  showPackOpenModal(pack, pulled);
}

function openPack(pack) {
  const results = [];
  const slots = 10;
  for (let i = 0; i < slots; i++) {
    const roll = Math.random() * 100;
    let rarity, valueMult;
    if (roll < 1) { rarity = "Secret Rare"; valueMult = 1.0; }
    else if (roll < 7) { rarity = "Ultra Rare"; valueMult = 0.55; }
    else if (roll < 25) { rarity = "Holo Rare"; valueMult = 0.18; }
    else { rarity = "Common/Uncommon"; valueMult = 0.01; }

    let name, value;
    if (rarity === "Secret Rare" || rarity === "Ultra Rare") {
      name = pack.feature.name;
      value = round2(pack.feature.value * (rarity === "Secret Rare" ? 1.0 : 0.5) * (0.85 + Math.random() * 0.3));
    } else if (rarity === "Holo Rare") {
      name = `${pack.name} Holo Common`;
      value = round2(pack.feature.value * 0.05 * (0.7 + Math.random() * 0.6));
    } else {
      name = `${pack.name} Common`;
      value = round2(0.5 + Math.random() * 2.5);
    }
    results.push(card(name, pack.name, value, rarity));
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
    div.innerHTML = `
      <img src="${c.img}" onerror="this.style.display='none'" alt="${c.name}" />
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
      <div class="binder-card-img"><img src="${c.img}" onerror="this.style.display='none'" alt="${c.name}"/></div>
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
      <div class="binder-card-img"><img src="${c.img}" onerror="this.style.display='none'" alt="${c.name}"/></div>
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
function getActiveDeck() {
  if (activeDeck && activeDeck.length === 60) return activeDeck;
  // gift starter
  activeDeck = buildStarterDeck();
  log("No legal deck found — Base Starter Deck granted to prevent lockout.", "event");
  saveGame();
  return activeDeck;
}

function renderDeckSummary() {
  const deck = getActiveDeck();
  const pokemon = deck.filter(c => c.flag === "basic").length;
  const trainers = deck.filter(c => c.flag === "trainer").length;
  const energies = deck.filter(c => c.flag === "energy").length;
  document.getElementById("deck-count-pokemon").textContent = pokemon;
  document.getElementById("deck-count-trainer").textContent = trainers;
  document.getElementById("deck-count-energy").textContent = energies;
  document.getElementById("deck-count-total").textContent = deck.length;
}

function validateDeck(deck) {
  if (deck.length !== 60) return { ok: false, reason: "Deck must contain exactly 60 cards." };
  const counts = {};
  deck.forEach(c => {
    const key = c.name.replace(/\s#\d+$/, "");
    counts[key] = (counts[key] || 0) + 1;
  });
  for (const k in counts) {
    if (counts[k] > 4 && !/^Basic Energy/.test(k)) {
      return { ok: false, reason: `Too many duplicates of ${k} (max 4).` };
    }
  }
  return { ok: true };
}

/* ====================================================
   11. MATCH SIMULATION ENGINE
   ==================================================== */
const EVENT_FEES = { ranked: 0, casual: 0, premier: 25.00 };
const EVENT_REWARDS = { ranked: 8.00, casual: 0, premier: 65.00 };

function startQueue(eventType) {
  const fee = EVENT_FEES[eventType] || 0;
  if (fee > 0) {
    if (wallet < fee) { log(`Cannot enter ${eventType}: insufficient funds for ${fmtMoney(fee)} entry.`, "warn"); return; }
    wallet -= fee;
    log(`Entry fee of ${fmtMoney(fee)} paid for Premier Event.`, "money");
  }

  const deck = getActiveDeck();
  const validation = validateDeck(deck);
  if (!validation.ok) { log(`Deck illegal: ${validation.reason}`, "warn"); wallet += fee; return; }

  log(`Matchmaking for ${eventType} complete. Opponent found.`, "event");
  setupMatch(eventType, deck);
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setupMatch(eventType, deckCards) {
  const playerDeck = shuffled(deckCards);
  const oppDeck = shuffled(buildStarterDeck());

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

  // prizes
  const prizeEl = document.getElementById("p-prizes");
  prizeEl.innerHTML = "";
  for (let i = 0; i < p.prizes; i++) {
    const d = document.createElement("div");
    d.className = "mat-zone prize-slot";
    d.innerHTML = `<span class="zone-label">Prize</span>`;
    prizeEl.appendChild(d);
  }

  // active
  const activeEl = document.getElementById("p-active");
  activeEl.innerHTML = p.active
    ? `<span class="zone-label">${p.active.name}<br/>${p.active.hp}/${p.active.maxHp} HP</span>`
    : `<span class="zone-label">Active</span>`;
  document.getElementById("active-status").textContent = p.active
    ? `Opponent Active: ${o.active ? o.active.name : "—"} (${o.active ? o.active.hp : 0} HP)`
    : "";

  // bench
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById("b" + i);
    const benchCard = p.bench[i - 1];
    el.innerHTML = benchCard ? `<span class="zone-label">${benchCard.name}</span>` : `<span class="zone-label">Bench</span>`;
  }

  // deck/discard
  document.getElementById("deck-count-label").textContent = p.deck.length;
  document.getElementById("p-discard").querySelector(".zone-label").textContent = p.discard.length;

  // hand
  const handEl = document.getElementById("hand-row");
  handEl.innerHTML = "";
  p.hand.forEach(c => {
    const d = document.createElement("div");
    d.className = "hand-card";
    d.textContent = c.name;
    d.title = c.flag || c.rarity || "";
    d.addEventListener("click", () => handCardClicked(c));
    handEl.appendChild(d);
  });
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
  document.getElementById("card-render-img").src = c.img;
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
  if (viewName === "league") renderDeckSummary();
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

  document.querySelectorAll(".queue-btn").forEach(btn => {
    btn.addEventListener("click", () => startQueue(btn.dataset.event));
  });

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
  log(`PokeTCGNZ engine online. ${ALL_PACKS.length} booster sets loaded.`, "event");
}

document.addEventListener("DOMContentLoaded", boot);

})();
