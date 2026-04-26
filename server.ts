import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { load } from "cheerio";
import { Resend } from "resend";
import cron from "node-cron";
import { sendDailyRecipeIdea } from "./src/services/recipeAutomationService.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function startServer() {
  console.log("Starting server...");
  console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + "..." : "undefined");
  console.log("CUSTOM_GEMINI_API_KEY:", process.env.CUSTOM_GEMINI_API_KEY ? process.env.CUSTOM_GEMINI_API_KEY.substring(0, 10) + "..." : "undefined");
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: { 
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      appUrl: process.env.APP_URL 
    }});
  });

  const getOAuthClient = () => {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.APP_URL?.replace(/\/$/, "")}/auth/callback`
    );
  };

  // API Routes
  app.get("/api/auth/url", (req, res) => {
    try {
      const client = getOAuthClient();
      const scopes = [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/gmail.readonly",
      ];

      const url = client.generateAuthUrl({
          access_type: "offline",
          scope: scopes,
          prompt: "select_account consent"
      });

      console.log("Generated Auth URL with redirect:", `${process.env.APP_URL?.replace(/\/$/, "")}/auth/callback`);
      res.json({ url });
    } catch (error: any) {
      console.error("Error in /api/auth/url:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gmail/sync", async (req, res) => {
    const { tokens } = req.body;
    if (!tokens) return res.status(401).json({ error: "Missing tokens" });

    try {
      const client = getOAuthClient();
      client.setCredentials(tokens);
      const gmail = google.gmail({ version: "v1", auth: client });
      
      // Search for potential receipts (last 7 days)
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
      const query = `after:${sevenDaysAgo} (subject:receipt OR subject:invoice OR subject:"order confirmation" OR subject:"payment confirmation")`;
      
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 10
      });

      const messages = listRes.data.messages || [];
      const receiptData = [];

      for (const msg of messages) {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
        });

        // Extract body - handling both simple and multipart
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
        const from = headers.find(h => h.name === "From")?.value || "";
        const date = headers.find(h => h.name === "Date")?.value || "";

        receiptData.push({
          id: msg.id,
          subject,
          from,
          date,
          snippet: detail.data.snippet,
          body: body.substring(0, 10000) // Truncate for AI processing
        });
      }

      res.json({ receipts: receiptData });
    } catch (error: any) {
      console.error("Gmail sync failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const client = getOAuthClient();
      const { tokens } = await client.getToken(code as string);
      
      // Save tokens to local file for standalone scripts to use
      fs.writeFileSync(path.join(process.cwd(), "google-tokens.json"), JSON.stringify(tokens, null, 2));

      // Pass tokens back to the client via postMessage
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.post("/api/backup/sheets", async (req, res) => {
    const { tokens, expenses, budget, recurring } = req.body;
    if (!tokens) return res.status(401).json({ error: "Missing tokens" });

    try {
      const client = getOAuthClient();
      client.setCredentials(tokens);
      const sheets = google.sheets({ version: "v4", auth: client });
      const drive = google.drive({ version: "v3", auth: client });

      // 1. Search for existing spreadsheet or create a new one
      const driveRes = await drive.files.list({
        q: "name = 'Smart Expense Tracker Backup' and mimeType = 'application/vnd.google-apps.spreadsheet'",
        fields: "files(id, name)",
      });

      let spreadsheetId = driveRes.data.files?.[0]?.id;

      if (!spreadsheetId) {
        const spreadsheet = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title: "Smart Expense Tracker Backup" },
          },
        });
        spreadsheetId = spreadsheet.data.spreadsheetId!;
      }

      // 2. Prepare data for Sheets
      const values = [
        ["Date", "Amount", "Category", "Description", "Currency", "Is Recurring"],
        ...expenses.map((e: any) => [
          e.date,
          e.amount,
          e.category,
          e.description,
          e.currency,
          e.isRecurring ? "Yes" : "No",
        ]),
      ];

      // 3. Update the sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        requestBody: { values },
      });

      res.json({ success: true, spreadsheetId });
    } catch (error: any) {
      console.error("Backup failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/proxy/deals", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing URL" });

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      const html = await response.text();
      const $ = load(html);
      
      // Remove scripts, styles, and other noise
      $("script, style, nav, footer, header, iframe").remove();
      const text = $("body").text().replace(/\s+/g, ' ').trim();
      
      res.json({ content: text.substring(0, 50000) }); // Limit to 50k chars for safety
    } catch (error: any) {
      console.error("Proxy failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notify/expiry", async (req, res) => {
    const { email, items } = req.body;
    
    if (!resend) {
      return res.status(500).json({ error: "Resend API key not configured" });
    }

    if (!email || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: "Missing email or items" });
    }

    try {
      const expiringItems = items.filter((item: any) => item.daysLeft <= 3);
      if (expiringItems.length === 0) {
        return res.json({ message: "No items expiring soon" });
      }

      const itemListHtml = expiringItems.map((item: any) => `
        <li style="margin-bottom: 10px; padding: 10px; background: #f9f9f9; border-radius: 8px; list-style: none;">
          <strong style="font-size: 16px;">${item.name}</strong><br/>
          <span style="color: ${item.daysLeft <= 0 ? '#ef4444' : '#10b981'}; font-weight: bold;">
            ${item.daysLeft <= 0 ? 'EXPIRED' : `Expires in ${item.daysLeft} days`}
          </span>
          <p style="margin: 5px 0 0; font-size: 12px; color: #666;">Quantity: ${item.quantity} | ${item.pct}% remaining</p>
        </li>
      `).join('');

      const { data, error } = await resend.emails.send({
        from: "Pantry AI <notifications@resend.dev>",
        to: [email],
        subject: `⚠️ Pantry Alert: ${expiringItems.length} items need your attention!`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h1 style="color: #10b981;">Pantry Expiry Alert</h1>
            <p>Our AI has predicted that the following items in your pantry are reaching their baseline usage limit:</p>
            <ul style="padding: 0;">
              ${itemListHtml}
            </ul>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">
              This is an automated notification from your Smart Pantry Assistant. 
              If these items are still fresh, you can reset their baseline in the app.
            </p>
          </div>
        `,
      });

      if (error) {
        return res.status(400).json({ error });
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Email notification failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      define: {
        "process.env.GEMINI_API_KEY": JSON.stringify(process.env.GEMINI_API_KEY),
        "process.env.CUSTOM_GEMINI_API_KEY": JSON.stringify(process.env.CUSTOM_GEMINI_API_KEY)
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Schedule daily notifications at 13:52 Amsterdam for testing
  cron.schedule("52 13 * * *", () => {
    sendDailyRecipeIdea();
  }, {
    timezone: "Europe/Amsterdam"
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
