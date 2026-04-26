import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';

// --- CONFIG ---
const SERVICE_ACCOUNT_PATH = './service-account.json';
const CSV_PATH = './income.csv';
const DB_ID = 'ai-studio-eda4df82-53a4-4400-baa1-4e70d58fe3dc';
const USER_ID = 'WP6m5yh78BQ6Hg5hczKQbJUSx2Q2';

// --- AUTH ---
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = getFirestore(DB_ID);

// --- HELPERS ---
function parseCurrency(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

function parseVatRate(str: string): number {
  if (!str) return 0;
  // Handle both "21%" and "21,00%"
  const cleaned = str.replace('%', '').replace(',', '.').trim();
  return parseFloat(cleaned) || 0;
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

function categorizeIncome(description: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('festival') || desc.includes('dj set') || desc.includes('sessions') || desc.includes('club') || desc.includes('gig')) {
    return 'Gig Income';
  }
  if (desc.includes('bandcamp') || desc.includes('sales') || desc.includes('stream') || desc.includes('distrokid')) {
    return 'Music Sales';
  }
  return 'Other';
}

// --- MAIN ---
async function importIncome() {
  console.log('🚀 Starting Business Income Import...');
  
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
    if (!desc) continue;

    const date = formatDate(record['Factuurdatum'] || record['date']);
    const amountIncl = parseCurrency(record['bedrag incl BTW'] || record['amount']);
    const vatRate = parseVatRate(record['BTW%']);
    const vatAmount = parseCurrency(record['BTW bedrag']);
    
    const txId = crypto.randomUUID();
    const txRef = db.collection('businessTransactions').doc(txId);
    
    const txData = {
      id: txId,
      userId: USER_ID,
      date: date,
      type: 'income',
      amount: amountIncl,
      description: desc,
      category: categorizeIncome(desc),
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
      console.log(`📦 Imported ${count} income records...`);
    }
  }

  await batch.commit();
  console.log(`✅ Successfully imported ${count} business income transactions!`);
}

importIncome().catch(console.error);
