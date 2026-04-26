import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI } from "@google/genai";
import TelegramBot from "node-telegram-bot-api";
import { google } from "googleapis";
import axios from "axios";
import { db, getAppUserUid } from "./firebase-admin-setup.js";
import { randomUUID } from "crypto";

// These are resolved lazily at function invocation time (secrets are injected then)
function getBot() {
  return new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
}

function getOAuthClient() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = `https://oauth2callback-t7zuw6sfpa-uc.a.run.app`;
  
  if (!clientID || !clientSecret) {
    console.error("FATAL: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing from environment secrets!");
  }

  return new google.auth.OAuth2(
    clientID,
    clientSecret,
    REDIRECT_URI
  );
}

// --- Helper Functions ---
async function analyzeMessage(message, ai) {
  const today = new Date().toISOString().split('T')[0];
  const CATEGORIES = ['Food & Dining', 'Living & Household', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Bills & Utilities', 'Travel', 'Education', 'Investments', 'Other'];
  
  const prompt = `Analyze this user message for Aura financial bot. 
  Today's date is ${today}.

  INTENT CLASSIFICATION RULES:
  1. Add an expense: If the user provides an amount and description. 
     - Handle European formats: "17,75" should be interpreted as 17.75.
     - Return JSON: { "type": "expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD) } }.
     - Categories: [${CATEGORIES.join(', ')}].
  2. Add a split expense: If the user mentions "split with [name]" or similar.
     - Return JSON: { "type": "split_expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD), "splitWith": string } }.
  3. Spending Query: ONLY if the user asks a specific QUESTION about their spending patterns, history, or totals (e.g., "How much did I spend on food?"). 
     - Return JSON: { "type": "spending_query", "data": { "question": string } }.
  4. Stock Query: If the user asks about what they have in stock, pantry, or fridge.
     - Return JSON: { "type": "stock_query", "data": { "question": string } }.
  
  CRITICAL: If the message starts with "Add" or mentions a price, it is ALMOST ALWAYS an expense (#1), NOT a query (#3).
  Return ONLY valid JSON.`;
  
  const response = await ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt });
  const jsonText = response.text.replace(/```json/g, "").replace(/```/g, "");
  return JSON.parse(jsonText);
}

function validateTransactionDate(dateStr) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const d = new Date(dateStr);
  if (isNaN(d.getTime()) || d.getFullYear() > currentYear + 1 || d.getFullYear() < currentYear - 5) {
    return now.toISOString().split('T')[0];
  }
  return dateStr.split('T')[0];
}

async function processBotUpdate(msg) {
  const APP_USER_UID = getAppUserUid();
  const bot = getBot();
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString();
  const text = msg.text || msg.caption;
  const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  logger.info(`🤖 processBotUpdate | User: ${userId}, Text: ${text}, Allowed: ${TELEGRAM_USER_ID}`);

  if (msg.photo) {
    logger.info("📸 Handling photo update...");
    await handlePhotoUpdate(msg);
    return;
  }

  if (!text) return;

  // Security check
  if (userId !== TELEGRAM_USER_ID) {
    logger.warn(`⛔ Unauthorized access attempt from ${userId} (Expected: ${TELEGRAM_USER_ID})`);
    await bot.sendMessage(chatId, "Unauthorized access.");
    return;
  }

  // Handle commands
  if (text === '/status') {
    await bot.sendMessage(chatId, "☁️ GigiBot Cloud is active and listening! 🤖");
    return;
  }

  if (text === '/recipe' || text.toLowerCase().includes('generate recipe')) {
    await bot.sendMessage(chatId, "👨‍🍳 I'm checking your pantry now...");
    await sendDailyRecipeIdea();
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const analysis = await analyzeMessage(text, ai);
    
    if (analysis.type === 'expense' || analysis.type === 'split_expense') {
      const data = analysis.data;
      const now = new Date().toISOString();
      let targetUid = null;
      let householdId = null;

      if (analysis.type === 'split_expense' && data.splitWith) {
        const hSnap = await db.collection("households").where("members", "array-contains", APP_USER_UID).get();
        const potentialMatches = [];

        for (const hDoc of hSnap.docs) {
          const hData = hDoc.data();
          const members = hData.members || [];
          for (const mUid of members) {
            if (mUid === APP_USER_UID) continue;
            const uSnap = await db.collection("users").doc(mUid).get();
            const uData = uSnap.data();
            if (uData?.displayName?.toLowerCase().includes(data.splitWith.toLowerCase())) {
              potentialMatches.push({
                targetUid: mUid,
                targetName: uData.displayName,
                householdId: hDoc.id,
                householdName: hData.name
              });
            }
          }
        }

        if (potentialMatches.length === 0) {
          await bot.sendMessage(chatId, `⚠️ I couldn't find a roommate named "${data.splitWith}" in any of your households.`);
          return;
        }

        if (potentialMatches.length > 1) {
          // Ambiguity detected - save to pending and ask
          const pendingRef = await db.collection('pendingTransactions').add({
            type: 'split_selection',
            analysis,
            potentialMatches,
            uid: APP_USER_UID,
            createdAt: now
          });

          const buttons = potentialMatches.map((m, idx) => ([{
            text: `👥 ${m.targetName} (${m.householdName})`,
            callback_data: JSON.stringify({ a: 'hsel', id: pendingRef.id, idx })
          }]));

          await bot.sendMessage(chatId, `🤔 I found multiple possible matches for "${data.splitWith}". Which one did you mean?`, {
            reply_markup: { inline_keyboard: buttons }
          });
          return;
        }

        // Exactly one match
        targetUid = potentialMatches[0].targetUid;
        householdId = potentialMatches[0].householdId;
      }

      const isSplit = !!targetUid;
      const amount = data.amount;
      const computedCost = isSplit ? amount / 2 : amount;

      const expenseData = {
        date: validateTransactionDate(data.date),
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
      
      await db.collection(`users/${APP_USER_UID}/expenses`).add(expenseData);

      if (isSplit && targetUid && householdId) {
        await db.collection("settlements").add({
          owedTo: APP_USER_UID,
          owedBy: targetUid,
          amount: amount / 2,
          resolved: false,
          createdAt: now,
          householdId,
          description: `Split from Bot: ${data.description}`
        });
        await bot.sendMessage(chatId, `👥 *Split recorded!* \n✅ Added: ${data.description} (€${amount})\n💰 Partner owes you: €${(amount/2).toFixed(2)}`, { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, `✅ Added: ${data.description} (€${amount}) to ${data.category}`, { parse_mode: 'Markdown' });
      }
    } else if (analysis.type === 'spending_query' || analysis.type === 'query') {
      const snapshot = await db.collection(`users/${APP_USER_UID}/expenses`).orderBy('date', 'desc').limit(50).get();
      const expenses = snapshot.docs.map(doc => doc.data());
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
      await bot.sendMessage(chatId, response.text, { parse_mode: 'Markdown' });
    } else if (analysis.type === 'stock_query') {
      const ownedItems = await db.collection("pantryItems").where("ownerId", "==", APP_USER_UID).get();
      const allowedItems = await db.collection("pantryItems").where("allowedUsers", "array-contains", APP_USER_UID).get();
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
      await bot.sendMessage(chatId, response.text, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    console.error("Bot processing error:", e);
    await bot.sendMessage(chatId, "❌ Error processing your request. Please try again.");
  }
}

async function handleCallbackQuery(query) {
  const APP_USER_UID = getAppUserUid();
  const bot = getBot();
  const chatId = query.message.chat.id;
  const data = JSON.parse(query.data);

  // Support both legacy long-data and new short-ID approvals
  if (data.action === 'approve_tx' || data.a === 'atx') {
    let txData = data.tx;
    
    if (data.a === 'atx' && data.id) {
      const snap = await db.collection('pendingTransactions').doc(data.id).get();
      if (snap.exists) {
        txData = snap.data();
        // Cleanup the pending record
        await db.collection('pendingTransactions').doc(data.id).delete();
      }
    }

    if (!txData) {
      await bot.sendMessage(chatId, "❌ Error: Could not find transaction data. It may have expired.");
      return;
    }

    // Update handleCallbackQuery part
    const expenseSchema = {
      date: txData.date,
      amount: txData.amount,
      rawTotal: txData.amount, // Required for UI parity
      splitRatio: 1, 
      computedCost: txData.amount, 
      category: txData.category,
      description: `[Business] ${txData.description}`,
      currency: 'EUR', // Ensuring metric/standard consistency
      isRecurring: false,
      hasItems: false,
      vatAmount: txData.vatAmount || 0,
      vatRate: txData.vatRate || 0,
      source: 'gmail_sync',
      status: 'approved',
      createdAt: new Date().toISOString()
    };

    // Write to the Single Source of Truth collection!
    await db.collection(`users/${APP_USER_UID}/expenses`).add(expenseSchema);
    
    // Update the message to show it was approved
    await bot.editMessageText(`✅ *Approved & Saved!*\n💰 *Amount:* €${txData.amount}\n📂 *Category:* ${txData.category}\n🏢 *Merchant:* ${txData.description}`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown'
    });
  } else if (data.action === 'reject_tx' || data.a === 'rtx') {
    if (data.id || (data.a === 'rtx' && data.id)) {
      const pendingId = data.id;
      await db.collection('pendingTransactions').doc(pendingId).delete();
    }
    
    await bot.editMessageText(`❌ *Dismissed*`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown'
    });
  } else if (data.a === 'hsel') {
    // Household/Roommate selection for split
    const snap = await db.collection('pendingTransactions').doc(data.id).get();
    if (!snap.exists) {
      await bot.sendMessage(chatId, "❌ Error: Selection data expired.");
      return;
    }

    const pendingData = snap.data();
    const match = pendingData.potentialMatches[data.idx];
    const analysis = pendingData.analysis;
    const expenseData = analysis.data;
    const now = new Date().toISOString();

    const amount = expenseData.amount;
    const computedCost = amount / 2;

    const expenseSchema = {
      date: validateTransactionDate(expenseData.date),
      amount: computedCost,
      rawTotal: amount,
      splitRatio: 0.5,
      computedCost: computedCost,
      category: expenseData.category,
      description: `Split: ${expenseData.description}`,
      currency: 'EUR',
      isRecurring: false,
      hasItems: false,
      createdAt: now
    };

    await db.collection(`users/${APP_USER_UID}/expenses`).add(expenseSchema);
    await db.collection("settlements").add({
      owedTo: APP_USER_UID,
      owedBy: match.targetUid,
      amount: amount / 2,
      resolved: false,
      createdAt: now,
      householdId: match.householdId,
      description: `Split from Bot: ${expenseData.description}`
    });

    await db.collection('pendingTransactions').doc(data.id).delete();

    await bot.editMessageText(`👥 *Split recorded with ${match.targetName}!* \n✅ Added: ${expenseData.description} (€${amount})`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown'
    });
  }
  
  await bot.answerCallbackQuery(query.id);
}

async function handlePhotoUpdate(msg) {
  const APP_USER_UID = getAppUserUid();
  const bot = getBot();
  const chatId = msg.chat.id;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  try {
    await bot.sendMessage(chatId, "📸 *Receipt received!* Analyzing with Gemini Vision...", { parse_mode: 'Markdown' });
    
    const photo = msg.photo[msg.photo.length - 1];
    const fileLink = await bot.getFileLink(photo.file_id);
    const response = await fetch(fileLink);
    const buffer = Buffer.from(await response.arrayBuffer());
    
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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

Return valid JSON matching the schema.`;

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
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING" },
            amount: { type: "NUMBER" },
            currency: { type: "STRING" },
            category: { type: "STRING" },
            description: { type: "STRING" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  genericName: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unitPrice: { type: "NUMBER" },
                  totalPrice: { type: "NUMBER" },
                  type: { type: "STRING" },
                  aisle: { type: "STRING" }
                }
              }
            }
          }
        }
      }
    });

    const data = JSON.parse(result.text);
    const now = new Date().toISOString();
    
    const expenseData = {
      date: validateTransactionDate(data.date),
      amount: data.amount,
      rawTotal: data.amount,
      splitRatio: 1,
      computedCost: data.amount,
      category: data.category,
      description: `Receipt: ${data.description}`,
      currency: data.currency || 'EUR',
      isRecurring: false,
      hasItems: data.items && data.items.length > 0,
      items: (data.items || []).map((i) => ({
        ...i,
        id: randomUUID()
      })),
      createdAt: now
    };

    await db.collection(`users/${APP_USER_UID}/expenses`).add(expenseData);

    const itemsSummary = data.items?.length > 0 
      ? `📦 *Items:* ${data.items.length} items found`
      : "⚠️ No items were extracted.";

    await bot.sendMessage(chatId, `✅ *Receipt Processed!* \n🏪 *Store:* ${data.description}\n💰 *Total:* €${data.amount.toFixed(2)}\n📂 *Category:* ${data.category}\n${itemsSummary}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error("Failed to process photo:", error);
    await bot.sendMessage(chatId, "❌ Sorry, I couldn't scan that receipt. Make sure the text is clear!");
  }
}

async function sendDailyRecipeIdea() {
  const APP_USER_UID = getAppUserUid();
  const bot = getBot();
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;

  const ownedItems = await db.collection("pantryItems").where("ownerId", "==", APP_USER_UID).get();
  const allowedItems = await db.collection("pantryItems").where("allowedUsers", "array-contains", APP_USER_UID).get();
  const itemMap = new Map();
  ownedItems.docs.forEach(doc => itemMap.set(doc.id, doc.data()));
  allowedItems.docs.forEach(doc => itemMap.set(doc.id, doc.data()));
  const items = Array.from(itemMap.values());

  if (items.length === 0) {
    await bot.sendMessage(TELEGRAM_USER_ID, "📦 Your pantry is empty! Add some items first.");
    return;
  }

  const pantryList = items.map(i => i.name).join(", ");
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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

  const result = await ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt });
  await bot.sendMessage(TELEGRAM_USER_ID, result.text, { parse_mode: 'Markdown' });
}

// --- Cloud Functions ---

const ALL_SECRETS = [
  "TELEGRAM_BOT_TOKEN", 
  "GEMINI_API_KEY", 
  "TELEGRAM_USER_ID", 
  "APP_USER_UID", 
  "GOOGLE_CLIENT_ID", 
  "GOOGLE_CLIENT_SECRET"
];

export const gigiBot = onRequest({ secrets: ALL_SECRETS, timeoutSeconds: 120 }, async (req, res) => {
  res.status(200).send("OK"); // Respond immediately to prevent Telegram retries
  try {
    if (req.body.message) {
      await processBotUpdate(req.body.message);
    } else if (req.body.callback_query) {
      await handleCallbackQuery(req.body.callback_query);
    }
  } catch (e) {
    logger.error("❌ gigiBot top-level error", e);
  }
});

export const dailyChef = onSchedule({ schedule: "00 11 * * *", secrets: ALL_SECRETS, timeoutSeconds: 120, timeZone: "Europe/Amsterdam" }, async (event) => {
  await sendDailyRecipeIdea();
});

// --- Autonomous Accountant ---

export const connectGmail = onRequest({ secrets: ALL_SECRETS, cors: true }, async (req, res) => {
  const type = req.query.type || 'dj'; // Default to 'dj' for legacy compatibility
  const oauth2Client = getOAuthClient();
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
    state: type // Round-trip the account type through the state parameter
  });
  
  res.redirect(url);
});

export const oauth2callback = onRequest({ secrets: ALL_SECRETS }, async (req, res) => {
  const APP_USER_UID = getAppUserUid();
  const { code, state } = req.query;
  
  // Logic: Default to 'dj' if state is missing for backwards compatibility with existing sync functions.
  // Otherwise, use the type provided in the state (e.g., 'personal', 'business').
  const type = state || 'dj';
  const docName = `gmail_${type}`;
  
  const oauth2Client = getOAuthClient();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Securely save tokens to the dynamic connection document
    logger.info(`Saving ${type} Gmail tokens to ${docName} for user ${APP_USER_UID}`);
    await db.collection(`users/${APP_USER_UID}/connections`).doc(docName).set({
      tokens,
      updatedAt: new Date().toISOString()
    });
    
    // Positive Framing: Confirm exactly which account type was linked
    const readableType = type === 'dj' ? 'Business' : type.charAt(0).toUpperCase() + type.slice(1);
    const appUrl = "https://smart-tracker-gigi.web.app";
    
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0a0a0a; color: white; text-align: center;">
          <div style="background: #1a1a1a; padding: 40px; border-radius: 32px; border: 1px solid #333; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <div style="font-size: 50px; margin-bottom: 20px;">🚀</div>
            <h1 style="margin: 0 0 10px; font-weight: 900; letter-spacing: -1px;">${readableType} Gmail Connected!</h1>
            <p style="color: #888; font-size: 14px; margin-bottom: 30px;">GigiBot will now start scanning for ${readableType.toLowerCase()} invoices.</p>
            <a href="${appUrl}/settings" style="display: inline-block; background: #10b981; color: black; padding: 15px 30px; border-radius: 16px; text-decoration: none; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; transition: transform 0.2s;">Return to App</a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error("OAuth Callback Error:", error);
    res.status(500).send("Authentication failed. Please try again or check server logs.");
  }
});

async function runSyncCore(type, days = 1, shouldNotify = false, ignoreProcessed = false) {
  const APP_USER_UID = getAppUserUid();
  const docName = type === 'business' ? 'gmail_business' : 'gmail_personal';
  const connSnap = await db.collection(`users/${APP_USER_UID}/connections`).doc(docName).get();
  
  if (!connSnap.exists) {
    logger.info(`⚠️ ${docName} connection not found for sync.`);
    return { success: false, error: "Connection missing" };
  }
  
  const { tokens } = connSnap.data();
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  // Calculate date filter
  const afterDate = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  const dateQuery = `after:${afterDate}`;
  
  const query = type === 'business' 
    ? `${dateQuery} has:attachment filename:pdf (factuur OR invoice OR receipt) -category:social -category:promotions`
    : `${dateQuery} (Netflix OR Spotify OR Uber OR Utilities OR receipt OR "order confirmation" OR bestelling OR bevestiging OR "uw betaling" OR factuur OR rekening OR Vattenfall OR Odido OR Ziggo OR KPN OR T-Mobile)`;

  logger.info(`🔍 Starting ${type} sync with query: ${query}`);
  
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: type === 'business' ? 10 : 30 // Increased limit for better manual scan results
  });

  if (!res.data.messages) return { success: true, count: 0 };

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const bot = getBot();
  const chatId = process.env.TELEGRAM_USER_ID;
  let processedCount = 0;

  for (const msg of res.data.messages) {
    const msgId = msg.id;
    if (!ignoreProcessed) {
      const processedSnap = await db.collection(`users/${APP_USER_UID}/processedEmails`).doc(msgId).get();
      if (processedSnap.exists) continue;
    }

    try {
      const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msgId });
      
      // Helper to extract body text from parts, prioritizing plain text but falling back to HTML
      const getBody = (payload) => {
        let textBody = "";
        let htmlBody = "";
        
        const processPart = (part) => {
          if (part.mimeType === 'text/plain' && part.body && part.body.data) {
            textBody += Buffer.from(part.body.data, 'base64').toString();
          } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
            htmlBody += Buffer.from(part.body.data, 'base64').toString();
          } else if (part.parts) {
            part.parts.forEach(processPart);
          }
        };
        if (payload.body && payload.body.data) {
          const data = Buffer.from(payload.body.data, 'base64').toString();
          if (payload.mimeType === 'text/plain') textBody = data;
          else if (payload.mimeType === 'text/html') htmlBody = data;
        } else if (payload.parts) payload.parts.forEach(processPart);
        return textBody || htmlBody;
      };

      // Extract PDF Attachment for Business Invoices
      let pdfBase64 = null;
      if (type === 'business' && fullMsg.data.payload.parts) {
        const pdfPart = fullMsg.data.payload.parts.find(p => p.mimeType === 'application/pdf');
        if (pdfPart && pdfPart.body.attachmentId) {
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msgId,
            id: pdfPart.body.attachmentId
          });
          pdfBase64 = attachment.data.data;
        }
      }

      const bodyText = getBody(fullMsg.data.payload) || fullMsg.data.snippet;
      const context = bodyText.substring(0, 5000);
      
      const genModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const promptParts = [];
      
      if (type === 'business') {
        promptParts.push({ text: `Analyze this business invoice. 
        Email Context: ${context}
        
        TASK: Extract merchant, total amount (numeric), date (YYYY-MM-DD), and category.
        Categories: [Music Sales, Bandcamp (Music), Gear & Equipment, Software & Subs, Travel (Prof.), Other].
        Return ONLY valid JSON: { "description": string, "amount": number, "date": string, "category": string, "vatAmount": number, "vatRate": number }` });
        
        if (pdfBase64) {
          promptParts.push({ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } });
        }
      } else {
        promptParts.push({ text: `Extract personal expense data from this email.
        Context: ${context}
        Categories: [Food & Dining, Transport, Shopping, Entertainment, Bills & Utilities, Other].
        Return ONLY valid JSON: { "description": string, "amount": number, "date": string, "category": string }` });
      }

      const result = await genModel.generateContent({ contents: [{ role: "user", parts: promptParts }] });
      const cleanJson = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      const txData = JSON.parse(cleanJson);
      
      if (type === 'business') {
        const pendingRef = await db.collection('pendingTransactions').add({
          description: txData.description || 'Unknown Merchant',
          amount: Number(txData.amount) || 0,
          date: validateTransactionDate(txData.date),
          category: txData.category || 'Other',
          uid: APP_USER_UID,
          status: 'pending',
          source: 'gmail_sync',
          createdAt: new Date().toISOString()
        });

        if (shouldNotify && chatId) {
          await bot.sendMessage(chatId, `🧾 *New Invoice Detected!*\n\n🏢 *Merchant:* ${txData.description || 'Unknown'}\n💰 *Amount:* €${txData.amount || 0}\n📅 *Date:* ${txData.date || 'Unknown'}\n📂 *Category:* ${txData.category || 'Other'}\n\nShould I add this to your business expenses?`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: "✅ Approve", callback_data: JSON.stringify({ a: 'atx', id: pendingRef.id }) },
                { text: "❌ Reject", callback_data: JSON.stringify({ a: 'rtx', id: pendingRef.id }) }
              ]]
            }
          });
        }
      } else {
        await db.collection(`users/${APP_USER_UID}/pendingBills`).add({
          description: txData.description || 'Unknown Bill',
          amount: Number(txData.amount) || 0,
          date: validateTransactionDate(txData.date),
          category: txData.category || 'Other',
          source: 'gmail_personal_sync',
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }

      await db.collection(`users/${APP_USER_UID}/processedEmails`).doc(msgId).set({
        processedAt: new Date().toISOString(),
        syncSource: docName
      });
      processedCount++;
    } catch (err) {
      logger.error(`❌ Error processing ${type} message ${msgId}:`, err);
    }
  }
  
  return { success: true, count: processedCount };
}

export const manualSync = onRequest({ secrets: ALL_SECRETS, cors: true, timeoutSeconds: 300 }, async (req, res) => {
  const { type, days } = req.query;
  if (!type) return res.status(400).send("Missing type (personal or business)");
  
  const result = await runSyncCore(type, parseInt(days) || 30, false, true); // No bot spam, bypass processed check for manual scans
  res.json(result);
});

export const syncBusinessInvoices = onSchedule({ schedule: "every 6 hours", secrets: ALL_SECRETS, timeoutSeconds: 300 }, async (event) => {
  await runSyncCore('business', 1, true); // Notify for scheduled syncs
});

export const syncPersonalBills = onSchedule({ 
  schedule: "every 12 hours", 
  secrets: ALL_SECRETS, 
  timeoutSeconds: 300 
}, async (event) => {
  await runSyncCore('personal', 1, false);
});

