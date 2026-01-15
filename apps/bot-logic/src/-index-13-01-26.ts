// apps/bot-logic/src/index.ts
import "dotenv/config"; // Load environment variables first!
import { createSupabaseClient } from './utils/supabase'

const API_URL = "http://localhost:3001";
const TICK_RATE_MS = 2000; // Run every 2 seconds

// State to track previous price
let lastPrice = 10000; 

async function startBots() {
  console.log("🤖 Initializing Bot Army...");

  console.log("🤖 Initializing supabase client...");
  // Create Supabase client
  const supabase = createSupabaseClient()

  // Test connection to Supabase
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(`Failed to connect to supabase: ${error.message}`)
  }

  console.log('Successfully connected to supabase')

  // 1. Fetch Configuration from DB
  let bots, stocks;
  try {
    const { data: botsData, error: botsError } = await supabase
      .from('traders')
      .select('*')
      .eq('is_bot', true);
    
    if (botsError) throw botsError;
    bots = botsData;

    const { data: stocksData, error: stocksError } = await supabase
      .from('stocks')
      .select('*')
      .eq('symbol', 'VIBE');
    
    if (stocksError) throw stocksError;
    stocks = stocksData;
  } catch (e) {
    console.error("❌ CRITICAL: Could not connect to Database from Bot Logic.");
    console.error("   Check your .env file in apps/bot-logic.");
    console.error(e);
    process.exit(1);
  }

  if (bots.length === 0 || stocks.length === 0) {
    console.error("❌ No bots or stock found! Did you run the seed script?");
    process.exit(1);
  }

  const vibeStock = stocks[0];
  console.log(`✅ Loaded ${bots.length} Bots for stock ${vibeStock.symbol}`);
  
  // 2. THE LOOP
  setInterval(async () => {
    try {
      // A. Fetch Market Data (API)
      // We wrap this in a try/catch to handle network failures (e.g., API is down)
      let marketRes;
      try {
        marketRes = await fetch(`${API_URL}/market`);
      } catch (netError) {
        console.error(`⚠️  Cannot reach API at ${API_URL}. Is apps/boerse running?`);
        return;
      }

      // Check if API returned 200 OK
      if (!marketRes.ok) {
        console.error(`❌ API Error: ${marketRes.status} ${marketRes.statusText}`);
        return;
      }

      const marketData = await marketRes.json();

      // Check if data is actually an array
      if (!Array.isArray(marketData)) {
        console.error("❌ API returned unexpected format (not an array):", marketData);
        return;
      }

      // Find our stock
      const currentStock = marketData.find((s: any) => s.id === vibeStock.id);
      
      if (!currentStock) {
        console.error("❌ Stock VIBE not found in API response");
        return;
      }
      
      // Handle snake_case vs camelCase dynamically
      const priceRaw = currentStock.currentPriceCents ?? currentStock.current_price_cents;
      const currentPrice = Number(priceRaw);
      
      console.log(`\n📊 Market Price: ${currentPrice} cents`);

      // B. Execute Strategy for EACH Bot
      for (const bot of bots) {
        await makeDecision(bot, vibeStock, currentPrice);
      }

      // Update state
      lastPrice = currentPrice;

    } catch (e) {
      console.error("⚠️ Bot Loop Fatal Error:", e);
    }
  }, TICK_RATE_MS);
}

async function makeDecision(bot: any, stock: any, currentPrice: number) {
  // Strategy:
  // Price Drop -> BUY
  // Price Rise -> SELL
  
  let action: 'BUY' | 'SELL';
  
  if (currentPrice < lastPrice) {
    action = 'BUY';
  } else if (currentPrice > lastPrice) {
    action = 'SELL';
  } else {
    action = Math.random() > 0.5 ? 'BUY' : 'SELL';
  }

  // Randomize Quantity (1 to 10)
  const quantity = Math.floor(Math.random() * 10) + 1;

  // Price Buffer (2%)
  const priceBuffer = Math.floor(currentPrice * 0.02); 
  const limitPrice = action === 'BUY' 
    ? currentPrice + priceBuffer 
    : Math.max(1, currentPrice - priceBuffer);

  // Send Order
  try {
    const res = await fetch(`${API_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockId: stock.id,
        traderId: bot.id,
        type: action,
        limitPrice: limitPrice,
        quantity: quantity
      })
    });

    if (res.ok) {
        console.log(`   🤖 ${bot.name}: ${action} ${quantity} @ ${limitPrice}`);
    } else {
        const err = await res.text();
        console.log(`   ❌ ${bot.name} Failed: ${err}`);
    }
  } catch (error) {
    console.log(`   ❌ Network error for ${bot.name}`);
  }
}

// Start
startBots();