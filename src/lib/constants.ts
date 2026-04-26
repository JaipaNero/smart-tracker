/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CATEGORIES } from '../types';

export const CLASSIFICATION_RULES = `
IMPORTANT CLASSIFICATION RULES:
- 'food': Strictly edible products like groceries, snacks, drinks, meat, vegetables.
- 'supply': Non-edible household items that get used up: cleaning products, garbage bags, toilet paper, batteries, napkins, toiletries.
- 'service': All non-physical costs: delivery fees, tips, service charges, taxes, bag fees, surcharges.
- 'durable': Physical long-term assets: electronics, furniture, household equipment, clothing.

DISCOUNT & CORRECTION HANDLING:
- Modern receipts often show discounts as negative lines (e.g., '-0,60' or 'KORTING').
- If a discount or correction follows an item, associate it with that item:
  1. Add the discount amount (as a positive number) to the item's 'discount' field.
  2. The 'totalPrice' MUST be the NET amount (Original Price - Discount).
- If a line is a deposit/statiegeld (e.g. 'statiegeld', 'fles'), classify it as an item with type 'service' and aisle 'Other'.
`;

export const AISLE_RULES = `
AISLE CLASSIFICATION RULES:
- 'Produce': Fresh fruits and vegetables.
- 'Proteins': Meat, fish, eggs, tofu, legumes.
- 'Dairy': Milk (including plant milks), cheese, yogurt, butter, zuivel.
- 'Starch': Pasta, rice, bread, cereals, potatoes, flour.
- 'Pantry': Oils, spices, herbs, canned goods, sauces, honey, coffee/tea.
- 'Drinks': Sodas, juices, water, alcoholic beverages.
- 'Household': Cleaners, paper products, items classified as 'supply'.
- 'Other': Anything that doesn't fit the above.
`;

export const RECEIPT_SCAN_PROMPT = (categories: string[]) => `
Extract data from this receipt. Available categories: ${categories.join(', ')}. 

${CLASSIFICATION_RULES}

${AISLE_RULES}

Return valid JSON matching the schema.
`;

export const BOT_ANALYSIS_PROMPT = (today: string, categories: string[]) => `
Analyze this user message for Aura financial bot. 
Today's date is ${today}.

Determine if the user wants to:
1. Add an expense: return JSON { "type": "expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD) } }. 
   Supported categories: [${categories.join(', ')}]. 
   If the user says "today", use ${today}. If they say "yesterday", calculate the date.
2. Add a split expense with someone: return JSON { "type": "split_expense", "data": { "description": string, "amount": number, "category": string, "date": string (YYYY-MM-DD), "splitWith": string } }.
3. Ask a question about spending/finances: return JSON { "type": "spending_query", "data": { "question": string } }.
4. Ask a question about pantry stock, inventory, or what's in the fridge: return JSON { "type": "stock_query", "data": { "question": string } }.
Return ONLY valid JSON.
`;

/**
 * Validates a purchase date to prevent AI hallucinations (e.g. years far in the past or future).
 * @param dateStr ISO or YYYY-MM-DD string
 * @returns Validated date string (YYYY-MM-DD)
 */
export const validateTransactionDate = (dateStr: string): string => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const d = new Date(dateStr);
  
  // If date is invalid or year is suspicious (> 1 year in future or > 5 years in past), use today
  if (isNaN(d.getTime()) || d.getFullYear() > currentYear + 1 || d.getFullYear() < currentYear - 5) {
    return now.toISOString().split('T')[0];
  }
  
  return dateStr.split('T')[0];
};
