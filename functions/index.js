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

  Determine if the user wants to:
  1. Add an expense: return JSON { "type": "expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD) } }. 
     Supported categories: [${CATEGORIES.join(', ')}]. 
     If the user says "today", use ${today}. If they say "yesterday", calculate the date.
  2. Add a split expense with someone: return JSON { "type": "split_expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD), "splitWith": string } }.
  3. Ask a question about spending/finances: return JSON { "type": "spending_query", "data": { "question": string } }.
  4. Ask a question about pantry stock, inventory, or what's in the fridge: return JSON { "type": "stock_query", "data": { "question": string } }.
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
  logger.info("📥 GigiBot Request Received", { body: req.body });
  try {
    if (req.method === "POST") {
      if (req.body?.message) {
        logger.info("💬 Message found in body, processing...");
        await processBotUpdate(req.body.message);
      } else if (req.body?.callback_query) {
        logger.info("🔘 Callback query found in body, processing...");
        await handleCallbackQuery(req.body.callback_query);
      }
    }
  } catch (e) {
    logger.error("❌ gigiBot top-level error", e);
  }
  res.sendStatus(200);
});

export const dailyChef = onSchedule({ schedule: "00 11 * * *", secrets: ALL_SECRETS, timeoutSeconds: 120, timeZone: "Europe/Amsterdam" }, async (event) => {
  await sendDailyRecipeIdea();
});

// --- Autonomous Accountant ---

export const connectGmail = onRequest({ secrets: ALL_SECRETS }, async (req, res) => {
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
    res.send(`🚀 ${readableType} Gmail Connected Successfully! GigiBot will now start scanning for ${readableType.toLowerCase()} invoices.`);
  } catch (error) {
    logger.error("OAuth Callback Error:", error);
    res.status(500).send("Authentication failed. Please try again or check server logs.");
  }
});

export const syncBusinessInvoices = onSchedule({ schedule: "every 6 hours", secrets: ALL_SECRETS, timeoutSeconds: 300 }, async (event) => {
  const APP_USER_UID = getAppUserUid();
  const connSnap = await db.collection(`users/${APP_USER_UID}/connections`).doc('gmail_dj').get();
  
  if (!connSnap.exists) return;
  const { tokens } = connSnap.data();
  
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'has:attachment filename:pdf (factuur OR invoice OR receipt) -category:social -category:promotions',
    maxResults: 5
  });

  if (!res.data.messages) return;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const bot = getBot();
  const chatId = process.env.TELEGRAM_USER_ID;

  for (const msg of res.data.messages) {
    const msgId = msg.id;
    // Check if we already processed this
    const processedSnap = await db.collection(`users/${APP_USER_UID}/processedEmails`).doc(msgId).get();
    if (processedSnap.exists) continue;

    const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msgId });
    const snippet = fullMsg.data.snippet;
    
    // Simple extraction prompt
    const prompt = `Extract business expense data from this invoice snippet: "${snippet}". 
    Target fields: merchant, amount (EUR), date (YYYY-MM-DD), category (Music Sales, Bandcamp (Music), Gear & Equipment, Software & Subs, Travel (Prof.), Other).
    Return ONLY JSON: { "description": string, "amount": number, "date": string, "category": string, "vatAmount": number, "vatRate": number }`;
    
    try {
      const result = await ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt });
      const txData = JSON.parse(result.text.replace(/```json/g, "").replace(/```/g, ""));
      
      // Save to pendingTransactions to avoid Telegram's 64-byte callback_data limit
      const pendingRef = await db.collection('pendingTransactions').add({
        ...txData,
        uid: APP_USER_UID,
        status: 'pending',
        source: 'gmail_sync',
        createdAt: new Date().toISOString()
      });

      // Notify via GigiBot
      await bot.sendMessage(chatId, `🧾 *New Invoice Detected!*\n\n🏢 *Merchant:* ${txData.description}\n💰 *Amount:* €${txData.amount}\n📅 *Date:* ${txData.date}\n📂 *Category:* ${txData.category}\n\nShould I add this to your business expenses?`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Approve", callback_data: JSON.stringify({ a: 'atx', id: pendingRef.id }) },
            { text: "❌ Reject", callback_data: JSON.stringify({ a: 'rtx', id: pendingRef.id }) }
          ]]
        }
      });

      // Mark as processed so we don't scan this email again
      await db.collection(`users/${APP_USER_UID}/processedEmails`).doc(msgId).set({
        processedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Gemini/Bot extraction error:", err);
    }
  }
});

export const syncPersonalBills = onSchedule({ 
  schedule: "every 12 hours", 
  secrets: ALL_SECRETS, 
  timeoutSeconds: 300 
}, async (event) => {
  const APP_USER_UID = getAppUserUid();
  const connSnap = await db.collection(`users/${APP_USER_UID}/connections`).doc('gmail_personal').get();
  
  if (!connSnap.exists) {
    logger.info("⚠️ gmail_personal connection not found for sync.");
    return;
  }
  
  const { tokens } = connSnap.data();
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: '(Netflix OR Spotify OR Uber OR Utilities OR receipt OR "order confirmation") -category:social -category:promotions',
    maxResults: 10
  });

  if (!res.data.messages) return;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  for (const msg of res.data.messages) {
    const msgId = msg.id;
    // Check if we already processed this
    const processedSnap = await db.collection(`users/${APP_USER_UID}/processedEmails`).doc(msgId).get();
    if (processedSnap.exists) continue;

    try {
      const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msgId });
      const snippet = fullMsg.data.snippet;
      
      const prompt = `Extract personal expense data from this email snippet: "${snippet}". 
      IMPORTANT: Exclude any invoices related to Music Sales, DJ Gigs, Gear & Equipment, or Business software. We only want personal B2C expenses.
      Available categories: [Food & Dining, Transport, Shopping, Entertainment, Bills & Utilities, Other].
      Return ONLY JSON: { "description": string, "amount": number, "date": string, "category": string }`;
      
      const result = await ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt });
      const cleanJson = result.text.replace(/```json/g, "").replace(/```/g, "").trim();
      const txData = JSON.parse(cleanJson);
      
      // Save to staging collection: users/${APP_USER_UID}/pendingBills
      await db.collection(`users/${APP_USER_UID}/pendingBills`).add({
        description: txData.description,
        amount: txData.amount,
        date: txData.date,
        category: txData.category,
        source: 'gmail_personal_sync',
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      // Mark as processed
      await db.collection(`users/${APP_USER_UID}/processedEmails`).doc(msgId).set({
        processedAt: new Date().toISOString(),
        syncSource: 'gmail_personal'
      });
      
      logger.info(`✅ Successfully staged personal bill: ${txData.description} (€${txData.amount})`);
    } catch (err) {
      logger.error(`❌ Error processing personal bill message ${msgId}:`, err);
    }
  }
});
