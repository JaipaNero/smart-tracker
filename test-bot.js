import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
bot.on('message', (msg) => {
  console.log(msg);
});
console.log("Bot started in test script.");
