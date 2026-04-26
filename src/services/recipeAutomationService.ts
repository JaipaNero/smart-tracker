import { GoogleGenAI } from "@google/genai";
import TelegramBot from "node-telegram-bot-api";
import { db, APP_USER_UID } from "../../functions/firebase-admin-setup.js";
import { Expense } from "../types"; // tsx handles the resolution correctly

// Bot is now cloud-hosted via Firebase Functions (gigiBot).
// Local polling is disabled to prevent overriding the cloud webhook.
// To run locally for testing, set LOCAL_BOT=true in .env
const bot = process.env.LOCAL_BOT === 'true' 
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })
  : new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);

// Database initialized via unified setup

// Helper to analyze message
async function analyzeMessage(message: string, ai: GoogleGenAI) {
  const today = new Date().toISOString().split('T')[0];
  const prompt = `Analyze this user message for Aura financial bot: "${message}". 
  Today's date is ${today}.
  
  Determine if the user wants to:
  1. Add an expense: return JSON { "type": "expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD) } }. 
     Supported categories: [Food & Dining, Living & Household, Transport, Shopping, Entertainment, Health, Bills & Utilities, Travel, Education, Investments, Other]. 
     If the user says "today", use ${today}. If they say "yesterday", calculate the date.
  2. Add a split expense with someone: return JSON { "type": "split_expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD), "splitWith": string } }.
  3. Ask a question about spending/finances: return JSON { "type": "spending_query", "data": { "question": string } }.
  4. Ask a question about pantry stock, inventory, or what's in the fridge: return JSON { "type": "stock_query", "data": { "question": string } }.
  Return ONLY valid JSON.`;
  
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest", // Use the updated flash model
    contents: prompt,
  });
  const jsonText = response.text!.replace(/```json/g, "").replace(/```/g, "");
  return JSON.parse(jsonText);
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString();
  const text = msg.text || msg.caption;

  // Ignore if it's a photo (handled by dedicated listener) or if no text/photo
  if (msg.photo || (!text && !msg.photo)) return;

  // Handle special commands
  if (text === '/recipe' || text === '/start recipe' || text.toLowerCase().includes('generate recipe')) {
    await bot.sendMessage(chatId, "👨‍🍳 I'm checking your pantry now... Give me a moment to craft something delicious.");
    await sendDailyRecipeIdea();
    return;
  }

  // Security check: Only allow the configured user
  if (userId !== process.env.TELEGRAM_USER_ID) {
    await bot.sendMessage(chatId, "Unauthorized access.");
    return;
  }

  if (text.startsWith('/')) {
    if (text === '/status') {
      await bot.sendMessage(chatId, "Aura is active and listening! 🤖");
    }
    return;
  }

  // Handle intent
  try {
    const apiKey = (process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY)?.trim();
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");
    
    if (!db) {
      await bot.sendMessage(chatId, "⚠️ Server Error: Firebase Database is not initialized.");
      return;
    }

    const firebaseUid = APP_USER_UID;

    console.log("Analyzing message with apiKey starts with:", apiKey.substring(0, 5));
    const ai = new GoogleGenAI({ apiKey });
    const analysis = await analyzeMessage(text, ai);
    console.log("[Bot] Analysis Result:", JSON.stringify(analysis));
    
    if (analysis.type === 'expense' || analysis.type === 'split_expense') {
        const data = analysis.data;
        const now = new Date().toISOString();
        
        let targetUid = null;
        let householdId = null;

        if (analysis.type === 'split_expense' && data.splitWith) {
            // 1. Find household and roommate
            const hSnap = await db.collection("households").where("members", "array-contains", firebaseUid).get();
            if (!hSnap.empty) {
                const household = hSnap.docs[0];
                householdId = household.id;
                const members = household.data().members || [];
                
                // 2. Resolve name to UID
                for (const mUid of members) {
                    if (mUid === firebaseUid) continue;
                    const uSnap = await db.collection("users").doc(mUid).get();
                    const uData = uSnap.data();
                    if (uData?.displayName?.toLowerCase().includes(data.splitWith.toLowerCase())) {
                        targetUid = mUid;
                        break;
                    }
                }
            }
        }

        if (analysis.type === 'split_expense' && !targetUid) {
            await bot.sendMessage(chatId, `⚠️ I found your request to split, but I couldn't find a roommate named "${data.splitWith}" in your household.`);
            return;
        }

        const isSplit = !!targetUid;
        const amount = data.amount;
        const computedCost = isSplit ? amount / 2 : amount;

        const expenseData = {
            date: data.date,
            amount: computedCost,
            rawTotal: amount,
            splitRatio: isSplit ? 0.5 : 1,
            computedCost: computedCost,
            category: data.category,
            description: isSplit ? `Split: ${data.description}` : data.description,
            currency: 'EUR',
            isRecurring: false,
            hasItems: false,
            createdAt: now
        };
        
        await db.collection(`users/${firebaseUid}/expenses`).add(expenseData);

        if (isSplit && targetUid && householdId) {
            // Create DebtRecord for the roommate
            const debtData = {
                owedTo: firebaseUid,
                owedBy: targetUid,
                amount: amount / 2,
                resolved: false,
                createdAt: now,
                householdId: householdId,
                description: `Split from Bot: ${data.description}`
            };
            await db.collection("settlements").add(debtData);
            await bot.sendMessage(chatId, `👥 *Split recorded!* \n✅ Added: ${data.description} (€${amount})\n💰 Wesley owes you: €${(amount/2).toFixed(2)}\n📂 Category: ${data.category}`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `✅ Added: ${data.description} (€${amount}) to ${data.category}`, { parse_mode: 'Markdown' });
        }
    } else if (analysis.type === 'spending_query' || analysis.type === 'query') {
        // Fetch recent expenses for context
        const expensesRef = db.collection(`users/${firebaseUid}/expenses`);
        const snapshot = await expensesRef.orderBy('date', 'desc').limit(100).get();
        const expenses = snapshot.docs.map(doc => ({...doc.data(), id: doc.id} as Expense));
        
        const prompt = `Today is ${new Date().toISOString()}.
        User asked: "${analysis.data.question}".
        Here is the user's recent financial expense data: ${JSON.stringify(expenses)}.
        
        Analyze the data and answer clearly.
        FORMATTING RULES:
        1. DO NOT use '#' for headers. Use BOLD for titles instead.
        2. DO NOT use '*' for bullets. Use emojis like 🔹 or •.
        3. Keep it clean and concise for a mobile screen.
        4. Use 'Markdown' format (e.g. *Bold Text*).`;
        
        const response = await ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt });
        await bot.sendMessage(chatId, response.text!, { parse_mode: 'Markdown' });
    } else if (analysis.type === 'stock_query') {
        // Fetch pantry items where user is owner OR allowed user
        const ownedItems = await db.collection("pantryItems").where("ownerId", "==", firebaseUid).get();
        const allowedItems = await db.collection("pantryItems").where("allowedUsers", "array-contains", firebaseUid).get();
        
        // Merge unique items
        const itemMap = new Map();
        ownedItems.docs.forEach(doc => itemMap.set(doc.id, doc.data()));
        allowedItems.docs.forEach(doc => itemMap.set(doc.id, doc.data()));
        const items = Array.from(itemMap.values());

        const prompt = `Today is ${new Date().toISOString()}.
        User asked about their stock/pantry: "${analysis.data.question}".
        Here is the current pantry inventory: ${JSON.stringify(items)}.
        
        List what they have accurately.
        FORMATTING RULES:
        1. DO NOT use '#' for headers. Use BOLD for section titles.
        2. DO NOT use '*' for bullets. Use emojis like 📦, 🍎, or 🧼.
        3. Show "Remaining" percentage clearly if relevant.
        4. Use 'Markdown' format (e.g. *Bold Text*).`;
        
        const response = await ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt });
        await bot.sendMessage(chatId, response.text!, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error("Failed to process message:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't process your request. Please try again.");
  }
});

// Photo handler for receipts
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id.toString();
    const firebaseUid = APP_USER_UID;
    const apiKey = (process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY)?.trim();
    
    console.log(`[Bot] Photo received from ${userId}`);

    // Security check
    if (userId !== process.env.TELEGRAM_USER_ID) {
      await bot.sendMessage(chatId, "Unauthorized access.");
      return;
    }

    if (!firebaseUid || !apiKey || !db) {
      console.log("[Bot] Photo handler missing config:", { firebaseUid: !!firebaseUid, apiKey: !!apiKey, db: !!db });
      return;
    }

    try {
        await bot.sendMessage(chatId, "📸 *Receipt received!* Analyzing with Gemini Vision...", { parse_mode: 'Markdown' });

        // 1. Get the largest photo
        const photo = msg.photo![msg.photo!.length - 1];
        const fileId = photo.file_id;
        const fileLink = await bot.getFileLink(fileId);

        // 2. Download image
        const response = await fetch(fileLink);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const prompt = `Extract data from this receipt. Available categories: Food & Dining, Living & Household, Transport, Shopping, Entertainment, Health, Bills & Utilities, Travel, Education, Investments, Other.
              
IMPORTANT CLASSIFICATION RULES:
- 'food': Strictly edible products like groceries, snacks, drinks, meat, vegetables.
- 'supply': Non-edible household items that get used up: cleaning products, garbage bags, toilet paper, batteries, napkins, toiletries.
- 'service': All non-physical costs: delivery fees, tips, service charges, taxes, bag fees, surcharges.
- 'durable': Physical long-term assets: electronics, furniture, household equipment, clothing.

DISCOUNT & CORRECTION HANDLING:
- If a discount or correction follows an item, associate it with that item.
- The 'totalPrice' MUST be the NET amount (Original Price - Discount).

AISLE CLASSIFICATION RULES:
- 'Produce', 'Proteins', 'Dairy', 'Starch', 'Pantry', 'Drinks', 'Household', 'Other'.

Return ONLY valid JSON matching this schema:
{
  "date": "YYYY-MM-DD",
  "amount": number,
  "currency": "EUR",
  "category": "string",
  "description": "string",
  "items": [
    {
      "name": "string",
      "genericName": "string",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number,
      "type": "food" | "service" | "durable" | "supply",
      "aisle": "string"
    }
  ]
}`;

        const result = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: "image/jpeg", data: buffer.toString('base64') } }
                    ]
                }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        const data = JSON.parse(result.text!);

        // 4. Save to Firestore
        const now = new Date().toISOString();
        const expenseData = {
            date: data.date,
            amount: data.amount,
            rawTotal: data.amount,
            splitRatio: 1,
            computedCost: data.amount,
            category: data.category,
            description: `Receipt: ${data.description}`,
            currency: data.currency || 'EUR',
            isRecurring: false,
            hasItems: data.items && data.items.length > 0,
            items: (data.items || []).map((i: any) => ({
                ...i,
                id: Math.random().toString(36).substring(2, 15) // Simple ID for Node environment
            })),
            createdAt: now
        };

        await db.collection(`users/${firebaseUid}/expenses`).add(expenseData);

        const itemsSummary = data.items?.length > 0 
            ? `📦 *Items:* ${data.items.length} items found`
            : "⚠️ No items were extracted.";

        await bot.sendMessage(chatId, `✅ *Receipt Processed!* \n🏪 *Store:* ${data.description}\n💰 *Total:* €${data.amount.toFixed(2)}\n📂 *Category:* ${data.category}\n${itemsSummary}`, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error("Failed to process photo:", error);
        await bot.sendMessage(chatId, "❌ Sorry, I couldn't scan that receipt. Make sure the text is clear!");
    }
});

export async function sendDailyRecipeIdea() {
  try {
    const apiKey = (process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY)?.trim();
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");
    const ai = new GoogleGenAI({ apiKey });
    
    const firebaseUid = APP_USER_UID;

    if (!db) throw new Error("Database not initialized");

    // 1. Fetch pantry items where user is owner OR allowed user
    const ownedItems = await db.collection("pantryItems").where("ownerId", "==", firebaseUid).get();
    const allowedItems = await db.collection("pantryItems").where("allowedUsers", "array-contains", firebaseUid).get();
    
    // Merge unique items
    const itemMap = new Map();
    ownedItems.docs.forEach(doc => itemMap.set(doc.id, doc.data()));
    allowedItems.docs.forEach(doc => itemMap.set(doc.id, doc.data()));
    const items = Array.from(itemMap.values());
    
    if (items.length === 0) {
      console.log("No pantry items found for recipe generation.");
      return;
    }

    // 2. Generate recipe using Gemini
    const pantryList = items.map(i => i.name).join(", ");
    const prompt = `You are a professional Michelin-star chef. 
    The user has the following items in their pantry: ${pantryList}.
    
    Task:
    1. Create a creative and delicious recipe primarily using these items.
    2. You are allowed to suggest 2-3 extra common ingredients (like salt, oil, or a specific fresh herb/vegetable).
    3. Provide a catchy name for the dish.
    4. List the ingredients clearly using emojis.
    5. Provide concise, easy-to-follow cooking instructions.
    6. Add a "Chef's Tip" at the end.
    
    FORMATTING RULES:
    1. DO NOT use '#' for headers. Use *BOLD* for titles.
    2. DO NOT use '*' for bullets. Use emojis.
    3. Use 'Markdown' format.
    4. Make it look beautiful and premium for Telegram.`;

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });
    const recipe = response.text;

    // 3. Send via Telegram
    const targetChatId = process.env.TELEGRAM_USER_ID || "";
    if (!targetChatId) throw new Error("TELEGRAM_USER_ID missing");

    await bot.sendMessage(targetChatId, recipe!, { parse_mode: 'Markdown' });
    console.log("Recipe sent successfully to", targetChatId);
  } catch (error) {
    console.error("Failed to send recipe:", error);
  }
}

