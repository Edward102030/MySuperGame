/* ==========================================================================
   1. Global Engine State Initialization
   ========================================================================== */
let wallet = 100.00;
let inventory = [];
let match = null;

// Complete Set Matrix Index mapping authentic 2D asset endpoints from pokemontcg.io
const cardDatabase = {
    'Base Set (1999)': [
        { name: 'Charizard Holo', value: 420.00, hp: 120, type: 'Fire', img: 'https://images.pokemontcg.io/base1/4.png' },
        { name: 'Blastoise Holo', value: 145.00, hp: 100, type: 'Water', img: 'https://images.pokemontcg.io/base1/2.png' },
        { name: 'Pikachu Common', value: 3.50, hp: 40, type: 'Lightning', img: 'https://images.pokemontcg.io/base1/58.png' }
    ],
    'Neo Genesis (2000)': [
        { name: 'Lugia Holo', value: 280.00, hp: 90, type: 'Colorless', img: 'https://images.pokemontcg.io/neo1/9.png' }
    ],
    'EX Ruby & Sapphire (2003)': [
        { name: 'Sceptile ex', value: 95.00, hp: 150, type: 'Grass', img: 'https://images.pokemontcg.io/ex1/96.png' }
    ],
    'Diamond & Pearl (2007)': [
        { name: 'Torterra LV.X', value: 45.00, hp: 160, type: 'Grass', img: 'https://images.pokemontcg.io/dp1/122.png' }
    ],
    'Black & White (2011)': [
        { name: 'Zekrom Full Art', value: 55.00, hp: 130, type: 'Lightning', img: 'https://images.pokemontcg.io/bw1/114.png' }
    ],
    'XY Evolutions (2016)': [
        { name: 'M Charizard EX', value: 65.00, hp: 220, type: 'Fire', img: 'https://images.pokemontcg.io/xy12/13.png' }
    ],
    'Sword & Shield (2020)': [
        { name: 'Charizard VMAX Shiny', value: 180.00, hp: 330, type: 'Fire', img: 'https://images.pokemontcg.io/swsh45/SV107.png' }
    ],
    'Scarlet & Violet (2023)': [
        { name: 'Miraidon ex SIR', value: 48.00, hp: 220, type: 'Lightning', img: 'https://images.pokemontcg.io/sv1/244.png' }
    ],
    'Chaos Rising (2026)': [
        { name: 'Chaos Dragon Secret Rare', value: 115.00, hp: 280, type: 'Dragon', img: 'https://images.pokemontcg.io/swsh11/195.png' },
        { name: 'Standard Item Energy Switch', value: 0.20, hp: 0, type: 'Trainer', img: 'https://images.pokemontcg.io/swsh11/180.png' }
    ]
};

const setPricing = {
    'Base Set (1999)': 450.00, 'Neo Genesis (2000)': 320.00, 'EX Ruby & Sapphire (2003)': 180.00,
    'Diamond & Pearl (2007)': 90.00, 'Black & White (2011)': 45.00, 'XY Evolutions (2016)': 25.00,
    'Sword & Shield (2020)': 12.00, 'Scarlet & Violet (2023)': 4.99, 'Chaos Rising (2026)': 4.49
};

/* ==========================================================================
   2. Core System Data Persistence IO
   ========================================================================== */
function uiLog(txt) {
    const l = document.getElementById('log');
    l.innerHTML += `<br>>> ${txt}`;
    l.scrollTop = l.scrollHeight;
}

function saveGame() {
    localStorage.setItem('shortcuts_tcg_save', JSON.stringify({ wallet, inventory }));
}

function loadGame() {
    const saved = localStorage.getItem('shortcuts_tcg_save');
    if (saved) {
        const parsed = JSON.parse(saved);
        wallet = parsed.wallet ?? 100.00;
        inventory = parsed.inventory ?? [];
        uiLog("Profile found. Syncing assets...");
    } else {
        uiLog("No profile found. Starting fresh card career!");
    }
    syncData();
}

function syncData() {
    document.getElementById('cash').innerText = `$${wallet.toFixed(2)}`;
    let totalWorth = wallet + inventory.reduce((sum, card) => sum + card.value, 0);
    document.getElementById('worth').innerText = `$${totalWorth.toFixed(2)}`;
}

/* ==========================================================================
   3. View Manager Switching Contexts
   ========================================================================== */
function tab(t, event) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${t}`).classList.add('active');
    
    if (event) {
        event.target.classList.add('active');
    } else {
        // Fallback programmatic switching highlight selector
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.innerText.toLowerCase().includes(t)) btn.classList.add('active');
        });
    }
    
    if (t === 'binder') renderBinder();
    if (t === 'market') renderMarket();
}

/* ==========================================================================
   4. Booster Pack Store Mechanics
   ========================================================================== */
function initShop() {
    const container = document.getElementById('pack-container');
    container.innerHTML = '';
    for (let set in setPricing) {
        container.innerHTML += `
            <div class="list-item">
                <div><strong>${set}</strong><br><span class="green-txt">$${setPricing[set].toFixed(2)}</span></div>
                <button class="btn" style="width:auto;" onclick="buyPack('${set}', ${setPricing[set]})">Buy Pack</button>
            </div>`;
    }
}

function buyPack(set, price) {
    if (wallet < price) return uiLog("Purchase Denied: Insufficient Funds inside wallet.");
    wallet -= price;
    
    let pool = cardDatabase[set];
    let card = { ...pool[Math.floor(Math.random() * pool.length)], id: Date.now() + Math.random() };
    inventory.push(card);
    
    uiLog(`💥 PULLED: ${card.name} (${set}) valued at $${card.value.toFixed(2)}!`);
    saveGame();
    syncData();
}

/* ==========================================================================
   5. Official TCG Match-Play Engine Rules Loops
   ========================================================================== */
function startMatch(fee, prize, name) {
    if (wallet < fee) return uiLog("Tournament Entry Denied: Insufficient Registration Fees.");
    wallet -= fee;
    syncData();
    
    // Choose your top card value asset as active combatant, or standard starter
    let activeCard = inventory[0] || { name: 'Starter Pikachu', hp: 40, type: 'Lightning', img: 'https://images.pokemontcg.io/base1/58.png', value: 0 };
    match = { prize, pPrizes: 6, card: activeCard };
    
    document.getElementById('tourney-list').style.display = 'none';
    document.getElementById('arena').style.display = 'block';
    
    document.getElementById('p-active').innerText = `${activeCard.name}\n(HP: ${activeCard.hp})`;
    document.getElementById('p-prizes').innerText = match.pPrizes;
    
    // Bind Image Sources and text data endpoints
    document.getElementById('card-render-img').src = activeCard.img;
    document.getElementById('card-meta').innerText = `${activeCard.name} | Type: ${activeCard.type} | Value: $${activeCard.value.toFixed(2)}`;
    
    uiLog(`Entered ${name}. Shuffling deck... Setup 6 Prize Cards.`);
}

function turnAction(action) {
    if (!match) return;
    
    if (action === 'concede') {
        document.getElementById('arena').style.display = 'none';
        document.getElementById('tourney-list').style.display = 'block';
        match = null;
        return uiLog("Match ended. Field returned safely to league hub.");
    }
    
    // Random calculated outcome coin flips simulating damage tracking mechanics
    if (Math.random() > 0.48) {
        match.pPrizes--;
        document.getElementById('p-prizes').innerText = match.pPrizes;
        uiLog(`⚔️ Knockout! You took 1 Prize Card. (${match.pPrizes} left)`);
    } else {
        uiLog("⚠️ Opponent countered! Your active card sustained heavy damage.");
    }
    
    if (match.pPrizes <= 0) {
        wallet += match.prize;
        uiLog(`🏆 VICTORY! You won the championship! Prize collected: +$${match.prize.toFixed(2)}`);
        saveGame();
        turnAction('concede');
    }
    syncData();
}

/* ==========================================================================
   6. Binder Showcasing and Liquidation Market Logic
   ========================================================================== */
function renderBinder() {
    const container = document.getElementById('binder-container');
    container.innerHTML = inventory.length ? '' : '<p style="padding:10px; color:#888;">Your binder vault is completely empty.</p>';
    
    inventory.forEach(c => {
        container.innerHTML += `
            <div class="grid-card-item">
                <img src="${c.img}" alt="${c.name}">
                <b>${c.name}</b>
                <span class="green-txt">$${c.value.toFixed(2)}</span>
            </div>`;
    });
}

function renderMarket() {
    const container = document.getElementById('market-container');
    container.innerHTML = inventory.length ? '' : '<p style="padding:10px; color:#888;">No items in assets index to trade.</p>';
    
    inventory.forEach((c, idx) => {
        container.innerHTML += `
            <div class="grid-card-item">
                <img src="${c.img}" alt="${c.name}">
                <b>${c.name}</b>
                <span class="green-txt" style="margin-bottom:4px;">$${c.value.toFixed(2)}</span>
                <button class="btn" onclick="sell(${idx})">Liquidate</button>
            </div>`;
    });
}

function sell(idx) {
    wallet += inventory[idx].value;
    uiLog(`⚖️ SOLD: Liquidated ${inventory[idx].name} at current spot index marketplace pricing.`);
    inventory.splice(idx, 1);
    saveGame();
    renderMarket();
    syncData();
}

/* ==========================================================================
   7. System Boot Engine Hook Execution
   ========================================================================== */
initShop();
loadGame();
