import "dotenv/config";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// Initialize Firebase
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")))
    });
}
const db = getFirestore();

async function syncBusinessGmail() {
    console.log("🚀 Starting Deep Business Gmail Sync...");
    
    // 1. Get Tokens (In a real app, these would be in Firestore. 
    // For this local tool, we'll try to find them or ask the user to provide them)
    const tokenPath = "./google-tokens.json";
    if (!fs.existsSync(tokenPath)) {
        console.error("❌ google-tokens.json not found. Please sync via the web app first to generate it.");
        return;
    }
    const tokens = JSON.parse(fs.readFileSync(tokenPath, "utf8"));

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = genAI.models.get("gemini-flash-latest");

    // 2. Search for Business Keywords
    // We search for common music/DJ related transaction keywords
    const query = `(subject:receipt OR subject:invoice OR subject:order OR subject:confirmation) (Paradiso OR Bandcamp OR Beatport OR Gear OR Equipment OR Music OR DJ OR Apple OR Software OR "Monthly Statement")`;
    
    console.log(`🔍 Searching with query: ${query}`);
    
    const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50 // Start with 50 past receipts
    });

    const messages = res.data.messages || [];
    console.log(`found ${messages.length} potential business emails.`);

    for (const msg of messages) {
        const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
        const snippet = detail.data.snippet;
        
        // Extract body
        let body = "";
        const payload = detail.data.payload!;
        if (payload.parts) {
            const textPart = payload.parts.find(p => p.mimeType === "text/plain");
            if (textPart && textPart.body?.data) {
                body = Buffer.from(textPart.body.data, "base64").toString();
            }
        } else if (payload.body?.data) {
            body = Buffer.from(payload.body.data, "base64").toString();
        }

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find(h => h.name === "Subject")?.value || "";
        const date = headers.find(h => h.name === "Date")?.value || "";

        console.log(`📄 Analyzing: ${subject}...`);

        const prompt = `You are a professional accountant. Analyze this email content and determine if it is a business transaction (income or expense) for a professional DJ/Musician.
        
        If it is, extract:
        1. Type: "income" or "expense"
        2. Description: Clean merchant or gig name
        3. Amount: Total number
        4. Date: YYYY-MM-DD
        5. Category: One of [Gig Income, Music Sales, Gear & Equipment, Software & Subs, Marketing, Travel (Prof.), Other]
        6. VAT Rate: 21, 9, or 0 (estimate if not clear)
        
        Content: ${subject}\n${snippet}\n${body.substring(0, 5000)}
        
        Return JSON format only: { "isBusiness": boolean, "data": { ... } }`;

        try {
            const result = await model.generateContent({ contents: prompt });
            const analysis = JSON.parse(result.text!.replace(/```json/g, "").replace(/```/g, ""));

            if (analysis.isBusiness && analysis.data) {
                const tx = analysis.data;
                const firebaseUid = process.env.FIREBASE_USER_ID;
                
                await db.collection("businessTransactions").add({
                    ...tx,
                    userId: firebaseUid,
                    vatAmount: tx.amount - (tx.amount / (1 + (tx.vatRate / 100))),
                    source: "gmail_sync",
                    gmailId: msg.id,
                    createdAt: new Date().toISOString()
                });
                console.log(`✅ Saved: ${tx.description} (€${tx.amount})`);
            }
        } catch (e) {
            console.error(`Failed to process ${msg.id}:`, e);
        }
    }

    console.log("✨ Sync complete! Check your Business tab in the app.");
}

syncBusinessGmail().catch(console.error);
