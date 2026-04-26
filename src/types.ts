export type NutritionTag = 'Essential' | 'Balance' | 'Indulgence';

export type PantryAisle = 
  | 'Produce' 
  | 'Proteins' 
  | 'Dairy' 
  | 'Starch' 
  | 'Pantry' 
  | 'Drinks' 
  | 'Household' 
  | 'Other';

export type AgentStatus = 'idle' | 'searching' | 'found' | 'completed';

export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount?: number;
  type?: 'consumable' | 'food' | 'durable' | 'asset' | 'supply' | 'service';
  nutritionTag?: NutritionTag;
  genericName?: string;
  aisle?: PantryAisle;
}

export interface ItemPriceRecord {
  id: string;
  expenseId: string;
  itemName: string;
  merchant: string;
  date: string;
  unitPrice: number;
  currency: string;
  discount?: number;
  nutritionTag?: NutritionTag;
  type?: string;
}

export interface Expense {
  id: string;
  date: string;
  amount: number; // This will act as computedCost
  rawTotal: number;
  splitRatio: number;
  computedCost: number;
  category: string;
  description: string;
  currency: string;
  isRecurring: boolean;
  recurringFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  receiptUrl?: string; // Local base64 or blob URL
  hasItems?: boolean;
  items?: ReceiptItem[];
  vatAmount?: number;
  vatRate?: number;
  source?: 'manual' | 'gmail_sync' | 'telegram' | 'gmail_personal_sync';
  status?: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Budget {
  category: string;
  amount: number;
}

export interface AppState {
  expenses: Expense[];
  budgets: Budget[];
  baseCurrency: string;
  googleTokens: any | null;
  priceHistory?: ItemPriceRecord[];
}

export interface BaseItem {
  id: string;
  name: string; // The user specified itemName in the prompt, but keeping it 'name' avoids breaking the existing components heavily. We will honor the schema fields closely.
  purchaseDate: string; // ISO string
  burnRateDays: number;
  quantity: number;
  remainingPercentage: number; // 25, 50, 75, 100
  ownerId: string;
  sharedWithHouseholdId: string | null;
  allowedUsers?: string[];
  splitRatio: number;
  genericName?: string;
  aisle?: PantryAisle;
  targetPrice?: number;
  agentStatus?: AgentStatus;
  createdAt?: string;
}

export interface FoodItem extends BaseItem {
  itemType: 'food';
  nutritionTag: NutritionTag;
}

export interface SupplyItem extends BaseItem {
  itemType: 'supply';
}

export interface AssetItem extends BaseItem {
  itemType: 'asset';
  warrantyMonths: number;
}

export interface ServiceItem extends BaseItem {
  itemType: 'service';
}

export type InventoryItem = FoodItem | SupplyItem | AssetItem | ServiceItem;

// Alias for backwards compatibility in components not directly checking types yet
export type PantryItem = InventoryItem;

export interface DebtRecord {
  id: string;
  owedTo: string;
  owedBy: string;
  amount: number;
  relatedItemId: string;
  resolved: boolean;
  createdAt: string;
  householdId?: string;
  description?: string;
  participantUids?: string[]; // Added for group visibility indexing
}

export interface ShoppingListItem {
  id: string;
  name: string;
  addedAt: string;
  createdAt?: string;
}

export interface Asset {
  id: string;
  name: string;
  purchaseDate: string;
  merchant: string;
  price: number;
  warrantyMonths?: number;
  warrantyExpiryDate?: string;
  createdAt: string;
}

export interface RecipeFilterState {
  appliances: string[];
  maxPrepTime: number;
  cuisine: string;
  dietaryPreference: string;
  batchDays: number;
}

export interface MealPlan {
  recipeTitle: string;
  prepTimeMinutes: number;
  instructions: string[];
  ingredientsUsed: string[];
  missingIngredientsToBuy: string[];
}

export interface UserOverride {
  itemName: string;
  tag: NutritionTag;
}

export interface Household {
  id: string;
  name: string;
  members: string[]; // Array of UIDs
  ownerId: string;
  createdAt: string;
}

export const CATEGORIES = [
  'Food & Dining',
  'Living & Household',
  'Transport',
  'Shopping',
  'Entertainment',
  'Health',
  'Bills & Utilities',
  'Travel',
  'Education',
  'Investments',
  'Other'
];

export interface BusinessTransaction {
  id: string;
  date: string;
  type: 'income' | 'expense';
  amount: number;
  category: string; // 'Gig', 'Bandcamp', 'Gear', 'Streaming', 'Other'
  description: string;
  currency: string;
  createdAt: string;
  taxDeductible?: boolean;
  vatRate?: 9 | 21 | 0;
  vatAmount?: number;
}

export const BUSINESS_CATEGORIES = [
  'Gig Income',
  'Music Sales',
  'Bandcamp (Music)',
  'Gear & Equipment',
  'Software & Subs',
  'Marketing',
  'Travel (Prof.)',
  'Other'
];

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  // Add more as needed
];
