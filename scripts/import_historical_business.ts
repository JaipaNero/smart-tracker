import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';

// @ts-ignore - Importing from JS file in TS script
import { db, getAppUserUid } from "../functions/firebase-admin-setup.js";

// --- CONFIG ---
const CSV_PATH = './expenses.csv';

// --- HELPERS ---
function parseCurrency(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

function parseVatRate(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace('%', '').trim();
  return parseInt(cleaned, 10) || 0;
}

function formatDate(str: string): string {
  if (!str) return new Date().toISOString().split('T')[0];
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

function categorize(description: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('bandcamp')) return 'Bandcamp (Music)';
  if (desc.includes('soundcloud') || desc.includes('apple') || desc.includes('adobe') || desc.includes('google')) return 'Software & Subs';
  if (desc.includes('pioneer') || desc.includes('usb') || desc.includes('gear') || desc.includes('kabel') || desc.includes('samsung')) return 'Gear & Equipment';
  if (desc.includes('train') || desc.includes('ns ') || desc.includes('flight') || desc.includes('hotel') || desc.includes('taxi') || desc.includes('uber')) return 'Travel (Prof.)';
  if (desc.includes('gig') || desc.includes('perfomance') || desc.includes('fee')) return 'Gig Income';
  return 'Other';
}

// --- MAIN ---
async function importCsv() {
  const APP_USER_UID = getAppUserUid();
  console.log('🚀 Starting Business Transaction Import...');
  
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const batchSize = 100;
  let batch = db.batch();
  let count = 0;

  for (const record of records) {
    const desc = record['Naam'] || record['description'];
    if (!desc || desc === 'Total Spend') continue; // Skip header/footer trash

    const date = formatDate(record['datum']);
    const amountIncl = parseCurrency(record['bedrag incl btw'] || record['amount']);
    const thuiskopie = parseCurrency(record['Thuiskopieheffing (ex btw)']);
    const vatRate = parseVatRate(record['BTW%']);
    const vatAmount = parseCurrency(record['BTW bedrag']);
    
    // Final amount includes the levy if present
    const finalAmount = amountIncl + thuiskopie;

    const txId = crypto.randomUUID();
    const txRef = db.collection('businessTransactions').doc(txId);
    
    const txData = {
      id: txId,
      userId: APP_USER_UID,
      date: date,
      type: 'expense', // Based on the user request for "Uitgaven"
      amount: finalAmount,
      description: desc,
      category: categorize(desc),
      currency: 'EUR',
      vatRate: vatRate,
      vatAmount: vatAmount,
      createdAt: new Date().toISOString()
    };

    batch.set(txRef, txData);
    count++;

    if (count % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`📦 Imported ${count} records...`);
    }
  }

  await batch.commit();
  console.log(`✅ Successfully imported ${count} business transactions!`);
}

importCsv().catch(console.error);
