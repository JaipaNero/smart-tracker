import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { NutritionTag, UserOverride } from '../types';

const INDULGENCE_KEYWORDS = [
  'candy', 'chips', 'chocolate', 'soda', 'sweet', 'cookie', 'biscuit', 'snack', 'coke', 'pepsi', 'fanta', 'sprite', 'sugar', 'dessert', 'ice cream',
  'snoep', 'chocolade', 'frisdrank', 'koekje', 'gebak', 'ijs', 'toetje', 'bier', 'wijn', 'lekkerbek'
];
const ESSENTIAL_KEYWORDS = [
  'apple', 'chicken', 'broccoli', 'oats', 'banana', 'spinach', 'kale', 'fish', 'rice', 'egg', 'milk', 'water', 'bread', 'vegetable', 'fruit', 'meat', 'potato', 'carrot', 'onion',
  'appel', 'kip', 'havermout', 'banaan', 'spinazie', 'vis', 'rijst', 'ei', 'melk', 'water', 'brood', 'groente', 'fruit', 'vlees', 'aardappel', 'wortel', 'ui', 'asperge'
];

let overrideCache: Record<string, NutritionTag> = {};

export const loadNutritionOverrides = async (userId: string) => {
  try {
    const q = query(collection(db, `users/${userId}/userCategorizationOverrides`));
    const querySnapshot = await getDocs(q);
    const newOverrides: Record<string, NutritionTag> = {};
    querySnapshot.forEach((doc) => {
      const data = doc.data() as UserOverride;
      newOverrides[data.itemName.toLowerCase()] = data.tag;
    });
    overrideCache = newOverrides;
    return newOverrides;
  } catch (error) {
    console.error("Error loading nutrition overrides:", error);
    return {};
  }
};

export const categorizeNutrition = (itemName: string): NutritionTag => {
  const normalized = itemName.toLowerCase().trim();

  // Check simple overrides cache first
  if (overrideCache[normalized]) {
    return overrideCache[normalized];
  }

  // Heuristic keywords
  if (INDULGENCE_KEYWORDS.some(k => normalized.includes(k))) {
    return 'Indulgence';
  }

  if (ESSENTIAL_KEYWORDS.some(k => normalized.includes(k))) {
    return 'Essential';
  }

  // Default
  return 'Balance';
};

export const categorizeItem = (itemName: string, aiType?: string): Partial<import('../types').PantryItem> => {
  const lower = itemName.toLowerCase().trim();
  
  const supplyKeywords = [
    'batteries', 'napkins', 'candles', 'trash bags', 'cleaning', 'detergent', 'tissue', 'toilet paper',
    'zakken', 'zak', 'vuilniszak', 'trekband', 'schoonmaak', 'wasmiddel', 'vaatwas', 'wc papier', 'toiletpapier', 'batterij', 'batterijen', 'folie', 'kaars'
  ];
  const assetKeywords = ['ikea', 'furniture', 'electronics'];
  const serviceKeywords = [
    'delivery', 'fee', 'tip', 'tax', 'service charge', 'courier', 'shipping', 'surcharge', 'bag',
    'bezorgkosten', 'bezorging', 'servicekosten', 'toeslag', 'tasje', 'kosten', 'statiegeld',
    'frais', 'livraison', 'service'
  ];

  // 1. HARD OVERRIDES (Fallback Keywords as first priority to catch AI hallucinations)
  if (supplyKeywords.some(kw => lower.includes(kw))) {
    return { itemType: 'supply' };
  }
  if (assetKeywords.some(kw => lower.includes(kw))) {
    return { itemType: 'asset', warrantyMonths: 12 };
  }
  if (serviceKeywords.some(kw => lower.includes(kw))) {
    return { itemType: 'service' };
  }

  // 2. AI-determined type from Receipt scanning
  if (aiType === 'service') return { itemType: 'service' };
  if (aiType === 'durable' || aiType === 'asset') return { itemType: 'asset', warrantyMonths: 12 };
  if (aiType === 'supply') return { itemType: 'supply' };
  if (aiType === 'consumable' || aiType === 'food') return { 
    itemType: 'food', 
    nutritionTag: categorizeNutrition(itemName) 
  };

  // 3. Absolute Default
  return {
    itemType: 'food',
    nutritionTag: categorizeNutrition(itemName)
  };
};
