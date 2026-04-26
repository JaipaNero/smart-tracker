import { db, writeBatch, doc } from '../lib/firebase';
import { PantryItem, Expense, DebtRecord, ReceiptItem } from '../types';
import { categorizeItem, categorizeNutrition } from './nutritionService';

/**
 * Executes an atomic batch write to split a receipt item with a household member.
 * Action 1: Write PantryItem to shared pool with 0.5 split.
 * Action 2: Write Expense to personal ledger with computed 50% cost.
 * Action 3: Write DebtRecord for the roommate's portion.
 */
export async function addSplitReceiptItem(
  userId: string,
  roomieId: string,
  householdId: string,
  itemData: Partial<ReceiptItem>,
  merchant: string,
  category: string,
  currency: string,
  purchaseDate?: string,
  householdMembers: string[] = [] // New parameter for indexing
) {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const finalizedPurchaseDate = purchaseDate || now;
  
  const itemId = crypto.randomUUID();
  const expenseId = crypto.randomUUID();
  const debtId = crypto.randomUUID();
  const historyId = crypto.randomUUID();
  
  const rawTotal = itemData.totalPrice || 0;
  const splitRatio = 0.5;
  const computedCost = rawTotal * splitRatio;

  const categorizedFields = categorizeItem(itemData.name || '', itemData.type);
  const nTag = categorizedFields.itemType === 'food' ? categorizeNutrition(itemData.name || '') : undefined;

  // 1. Write the PantryItem (Shared)
  const pantryRef = doc(db, 'pantryItems', itemId);
  const pantryItem = {
    id: itemId,
    name: itemData.name || 'Unknown Item',
    purchaseDate: finalizedPurchaseDate,
    burnRateDays: 7, // Default
    quantity: itemData.quantity || 1,
    remainingPercentage: 100,
    ownerId: userId,
    sharedWithHouseholdId: householdId,
    allowedUsers: householdMembers.length > 0 ? householdMembers : [userId, roomieId], // Indexing household
    splitRatio: splitRatio,
    genericName: itemData.genericName,
    aisle: itemData.aisle,
    agentStatus: 'idle',
    targetPrice: (itemData.unitPrice || 0) * 0.95,
    createdAt: now,
    ...categorizedFields
  } as PantryItem;
  batch.set(pantryRef, pantryItem);

  // 2. Write the Expense record (Personal)
  const expenseRef = doc(db, `users/${userId}/expenses`, expenseId);
  const expenseRecord: Expense = {
    id: expenseId,
    date: finalizedPurchaseDate,
    amount: computedCost,
    rawTotal: rawTotal,
    splitRatio: splitRatio,
    computedCost: computedCost,
    category: category,
    description: `Split Item: ${itemData.name} @ ${merchant}`,
    currency: currency,
    isRecurring: false,
    hasItems: true,
    items: [{ ...itemData, id: historyId } as ReceiptItem],
    createdAt: now
  };
  batch.set(expenseRef, expenseRecord);

  // 2.1 Write the Price History (Enables Tap/Hydration)
  const historyRef = doc(db, `users/${userId}/priceHistory`, historyId);
  batch.set(historyRef, {
    expenseId: expenseId,
    itemName: itemData.name || 'Unknown Item',
    merchant: merchant,
    date: finalizedPurchaseDate,
    unitPrice: itemData.unitPrice,
    totalPrice: itemData.totalPrice,
    quantity: itemData.quantity || 1,
    currency: currency,
    ...(nTag ? { nutritionTag: nTag } : {}),
    type: categorizedFields.itemType,
    ...(itemData.discount ? { discount: itemData.discount } : {}),
    createdAt: now
  });

  // 3. Write the DebtRecord (Settlements)
  const debtRef = doc(db, 'settlements', debtId);
  const debtRecord: DebtRecord = {
    id: debtId,
    owedTo: userId,
    owedBy: roomieId,
    amount: computedCost,
    relatedItemId: itemId,
    resolved: false,
    createdAt: now,
    householdId: householdId,
    description: `Split: ${itemData.name}`,
    participantUids: householdMembers.length > 0 ? householdMembers : [userId, roomieId] // Indexing household
  };
  batch.set(debtRef, debtRecord);

  await batch.commit();
  return { itemId, expenseId, debtId };
}
