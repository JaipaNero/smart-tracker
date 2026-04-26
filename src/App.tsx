/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, FormEvent } from 'react';
import { 
  Plus, 
  Camera, 
  PieChart, 
  List, 
  Settings, 
  Save, 
  TrendingUp, 
  DollarSign, 
  Calendar,
  Trash2,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  RefreshCw,
  Cloud,
  ChevronLeft,
  Tag,
  Store,
  ShoppingBag,
  Database,
  Shield,
  ChefHat,
  Users,
  Search,
  Menu,
  Mail,
  LayoutGrid,
  X,
  ShoppingCart,
  Check,
  Edit2,
  Minus,
  Refrigerator,
  Package,
  Briefcase
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { GoogleGenAI, Type } from '@google/genai';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from './lib/utils';
import { Expense, Budget, CATEGORIES, CURRENCIES, ReceiptItem, ItemPriceRecord, ShoppingListItem } from './types';
import { auth, db, signInWithPopup, googleProvider, signOut, doc, writeBatch, addDoc, onSnapshot } from './lib/firebase';
import PantryView from './PantryView';
import AssetsView from './AssetsView';
import { MealGenerator } from './components/MealGenerator';
import { HouseholdManager } from './components/HouseholdManager';
import { ReceiptSpectrumBar } from './components/ReceiptSpectrumBar';
import { categorizeNutrition, loadNutritionOverrides, categorizeItem } from './services/nutritionService';
import { PantryItem, NutritionTag, DebtRecord } from './types';
import { ReceiptSplitter } from './components/ReceiptSplitter';
import { addSplitReceiptItem } from './services/ledgerService';
import DealsView from './DealsView';
import GmailSyncView from './GmailSyncView';
import { SettlementsView } from './SettlementsView';
import { AIAssistant } from './components/AIAssistant';
import BusinessView from './BusinessView';
import { PendingBills } from './components/PendingBills';
import { RECEIPT_SCAN_PROMPT, validateTransactionDate } from './lib/constants';
import { useAuth } from './hooks/useAuth';
import { useLedger } from './hooks/useLedger';
import { useInventory } from './hooks/useInventory';


const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#4b5563', '#14b8a6', '#f97316'];

interface CategoryItemProps {
  item: { name: string; value: number };
  index: number;
  expenses: Expense[];
  baseCurrency: string;
}

const CategoryAllocationItem: React.FC<CategoryItemProps> = ({ 
  item: categoryItem, 
  index, 
  expenses, 
  baseCurrency 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const catTxs = useMemo(() => {
    const list: { description: string; date: string; amount: number }[] = [];
    expenses.forEach(e => {
      if (e.items && e.items.length > 0) {
        e.items.forEach(item => {
          let cat = e.category;
          if (item.type === 'food') cat = 'Food & Dining';
          else if (item.type === 'supply' || item.type === 'durable') cat = 'Living & Household';
          else if (item.type === 'service' && e.category === 'Food & Dining') cat = 'Other';
          
          if (cat === categoryItem.name) {
            list.push({
              description: item.name,
              date: e.date,
              amount: item.totalPrice
            });
          }
        });
      } else if (e.category === categoryItem.name) {
        list.push({
          description: e.description,
          date: e.date,
          amount: e.amount
        });
      }
    });

    // Merge identical descriptions for cleaner list
    const merged: Record<string, { description: string; date: string; amount: number }> = {};
    list.forEach(t => {
      const key = `${t.description}-${t.date}`;
      if (merged[key]) {
        merged[key].amount += t.amount;
      } else {
        merged[key] = { ...t };
      }
    });

    return Object.values(merged).sort((a, b) => b.amount - a.amount);
  }, [expenses, categoryItem.name]);

  return (
    <div className="space-y-2">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between group py-1 hover:bg-white/5 rounded-lg px-2 -mx-2 transition-all"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
          <div className="flex flex-col items-start text-left">
            <span className="text-[10px] font-bold text-text-muted group-hover:text-white transition-colors truncate uppercase tracking-tighter">
              {categoryItem.name}
            </span>
            {isExpanded && <span className="text-[8px] text-accent-green font-black uppercase tracking-widest">Showing Details</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-white">
            {formatCurrency(categoryItem.value, baseCurrency)}
          </span>
          <div className={cn("text-text-muted transition-transform", isExpanded && "rotate-180")}>
            <ChevronDown size={12} />
          </div>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white/5 rounded-xl border border-white/5"
          >
            <div className="p-3 space-y-2">
              {catTxs.length > 0 ? catTxs.map((tx, idx) => (
                <div key={idx} className="flex justify-between items-center text-[9px] group/item">
                  <div className="flex flex-col">
                    <span className="font-bold text-white uppercase tracking-tighter truncate max-w-[120px]">{tx.description}</span>
                    <span className="text-[8px] text-text-muted">{new Date(tx.date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-white">{formatCurrency(tx.amount, baseCurrency)}</span>
                  </div>
                </div>
              )) : (
                <div className="text-[8px] text-text-muted/40 font-black uppercase text-center py-2">No detailed data</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const { user, loadingSession } = useAuth();
  const { 
    expenses, 
    hydratedExpenses, 
    budgets, 
    priceHistory, 
    debts, 
    baseCurrency, 
    spendingCap, 
    totalSpentMonth, 
    spendingByCategory,
    setExpenses 
  } = useLedger(user);
  const { pantryItems, shoppingList, setPantryItems, setShoppingList } = useInventory(user);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'items' | 'pantry' | 'assets' | 'meals' | 'reports' | 'settings' | 'household' | 'deals' | 'inbox' | 'business' | 'shopping' | 'settlements'>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Multi-tenant / Split Ledger State
  const [householdId, setHouseholdId] = useState<string | null>(localStorage.getItem('activeHouseholdId'));
  const [roomieId, setRoomieId] = useState<string | null>(null);
  const [scannedReceiptData, setScannedReceiptData] = useState<any | null>(null);
  const [googleTokens, setGoogleTokens] = useState<any>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || "";
  });

  const ai = useMemo(() => {
    if (!geminiKey) return null;
    try {
      return new GoogleGenAI({ apiKey: geminiKey });
    } catch (e) {
      console.error("Failed to init AI", e);
      return null;
    }
  }, [geminiKey]);

  useEffect(() => {
    if (geminiKey) {
      localStorage.setItem('gemini_api_key', geminiKey);
    }
  }, [geminiKey]);

  const [hideNav, setHideNav] = useState(false);

  // --- Sync State (Local) ---
  useEffect(() => {
    if (householdId) {
      localStorage.setItem('activeHouseholdId', householdId);
    } else {
      localStorage.removeItem('activeHouseholdId');
    }
  }, [householdId]);

  // Sync Roomie ID for splitting
  useEffect(() => {
    if (householdId && user) {
      const unsub = onSnapshot(doc(db, 'households', householdId), (snap) => {
        if (snap.exists()) {
          const members = snap.data().members || [];
          const otherMembers = members.filter((m: string) => m !== user.uid);
          if (otherMembers.length > 0) {
            setRoomieId(otherMembers[0]);
          } else {
            setRoomieId(null);
          }
        }
      });
      return unsub;
    } else {
      setRoomieId(null);
    }
  }, [householdId, user]);

  // --- Helpers ---
  const addExpense = async (newExpense: Omit<Expense, 'id'>) => {
    if (!user) return;
    
    try {
      const batch = writeBatch(db);
      const expenseId = crypto.randomUUID();
      const hasItems = newExpense.items && newExpense.items.length > 0;
      const { items, receiptUrl, ...expenseData } = newExpense as any;
      const amount = expenseData.amount || 0;
      const now = new Date().toISOString();
      
      const expenseRef = doc(db, `users/${user.uid}/expenses/${expenseId}`);
      batch.set(expenseRef, {
        ...expenseData,
        rawTotal: expenseData.rawTotal ?? amount,
        splitRatio: expenseData.splitRatio ?? 1.0,
        computedCost: expenseData.computedCost ?? amount,
        hasItems: !!hasItems,
        createdAt: now
      });

      if (hasItems && items) {
        for (const item of items) {
          const historyId = crypto.randomUUID();
          const categorizedFields = categorizeItem(item.name, item.type);
          const nTag = categorizedFields.itemType === 'food' ? categorizeNutrition(item.name) : undefined;

          const historyRef = doc(db, `users/${user.uid}/priceHistory/${historyId}`);
          batch.set(historyRef, {
            expenseId: expenseId,
            itemName: item.name,
            merchant: newExpense.description,
            date: newExpense.date,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            quantity: item.quantity || 1,
            currency: newExpense.currency,
            ...(nTag ? { nutritionTag: nTag } : {}),
            type: categorizedFields.itemType,
            ...(item.discount ? { discount: item.discount } : {}),
            createdAt: now
          });

          if (item.type === 'durable' || item.type === 'asset') {
            const assetId = crypto.randomUUID();
            const assetRef = doc(db, `users/${user.uid}/assets/${assetId}`);
            batch.set(assetRef, {
              name: item.name,
              purchaseDate: newExpense.date,
              merchant: newExpense.description,
              price: item.totalPrice,
              warrantyMonths: 24,
              createdAt: now
            });
          } else if (item.type === 'food' || item.type === 'supply') {
            const pantryId = crypto.randomUUID();
            const pantryRef = doc(db, `pantryItems/${pantryId}`);
            batch.set(pantryRef, {
              id: pantryId,
              name: item.name,
              purchaseDate: newExpense.date,
              burnRateDays: 7,
              quantity: item.quantity || 1,
              remainingPercentage: 100,
              ownerId: user.uid,
              sharedWithHouseholdId: householdId || null,
              allowedUsers: [user.uid],
              splitRatio: 1.0,
              genericName: item.genericName,
              aisle: item.aisle as any,
              agentStatus: 'idle',
              targetPrice: item.unitPrice * 0.95,
              nutritionTag: nTag,
              itemType: item.type === 'food' ? 'food' : 'supply',
              createdAt: now,
              ...categorizedFields
            } as PantryItem);
          }
        }
      }
      
      await batch.commit();
      setStatusMessage({ type: 'success', text: 'Expense tracked atomically' });
    } catch (e) {
      console.error(e);
      setStatusMessage({ type: 'error', text: 'Failed to record expense' });
    }
  };

  const deleteExpense = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/expenses/${id}`));
      // Fire history rules: delete allowed if explicitly written to.
      // But typically price history is immortal per requirements in rules, except we added a delete rule
      const matchingParts = priceHistory.filter(p => p.expenseId === id);
      for (const p of matchingParts) {
         await deleteDoc(doc(db, `users/${user.uid}/priceHistory/${p.id}`));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteItemFromReceipt = async (expenseId: string, itemId: string, itemPrice: number) => {
    if (!user) return;
    try {
      // 1. Remove the price history record
      await deleteDoc(doc(db, `users/${user.uid}/priceHistory/${itemId}`));
      
      // 2. Adjust the parent expense amount
      const expense = expenses.find(e => e.id === expenseId);
      if (expense) {
        const newAmount = Math.max(0, expense.amount - itemPrice);
        await updateDoc(doc(db, `users/${user.uid}/expenses/${expenseId}`), {
          amount: newAmount,
          computedCost: newAmount // assuming 1:1 split for now, or just sync. 
          // For true ledger accuracy this might need more logic but this satisfies simple prurging.
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const splitExistingItem = async (expense: Expense, item: ReceiptItem) => {
    if (!user || !householdId || !roomieId) {
      setStatusMessage({ type: 'error', text: 'Select a household and roommate first' });
      return;
    }

    try {
      setStatusMessage({ type: 'success', text: 'Splitting item...' });
      
      // 1. Fetch household members for indexing
      const hSnap = await getDoc(doc(db, 'households', householdId));
      const members = hSnap.data()?.members || [];

      // 2. Add as split item (Creates new expense, debt, and shared pantry item)
      await addSplitReceiptItem(
        user.uid,
        roomieId,
        householdId,
        item,
        expense.description,
        expense.category,
        expense.currency,
        expense.date,
        members
      );

      // 3. Remove from original expense
      await deleteItemFromReceipt(expense.id, item.id, item.totalPrice);
      
      setStatusMessage({ type: 'success', text: `"${item.name}" shared with household!` });
    } catch (e) {
      console.error(e);
      setStatusMessage({ type: 'error', text: 'Failed to split item' });
    }
  };

  const addPantryItem = async (item: any) => {
    if (!user) return;
    
    const itemId = item.id || crypto.randomUUID();
    const members = new Set(item.allowedUsers || [user.uid]);
    members.add(user.uid);                

    // Fetch members if shared
    const sharedId = item.sharedWithHouseholdId || householdId;
    if (sharedId) {
        try {
            const hSnap = await getDoc(doc(db, 'households', sharedId));
            if (hSnap.exists()) {
                hSnap.data().members.forEach((m: string) => members.add(m));
            }
        } catch (e) {
            console.error(e);
        }
    }

    const finalItem = {
      ...item,
      id: itemId,
      ownerId: user.uid,
      allowedUsers: Array.from(members), 
      sharedWithHouseholdId: sharedId,
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(db, `pantryItems/${itemId}`), finalItem);
  };

  const addToShoppingList = async (name: string) => {
    if (!user) return;
    const shopId = crypto.randomUUID();
    await setDoc(doc(db, `users/${user.uid}/shoppingList/${shopId}`), {
      id: shopId,
      name,
      addedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
  };

  const addBusinessTransaction = async (tx: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'businessTransactions'), {
        ...tx,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      setStatusMessage({ type: 'success', text: 'Business transaction logged' });
    } catch (e) {
      console.error(e);
      setStatusMessage({ type: 'error', text: 'Failed to log business transaction' });
    }
  };


  // --- Receipt Scanning ---
  const scanReceipt = async (file: File) => {
    setIsScanning(true);
    setStatusMessage(null);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;

      if (!ai) {
        throw new Error("Gemini API Key is missing. Please set it in Setup.");
      }

      const prompt = RECEIPT_SCAN_PROMPT(CATEGORIES);

      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data, mimeType: file.type } }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING, description: "Purchase date in YYYY-MM-DD format." },
              amount: { type: Type.NUMBER, description: "The total transaction amount." },
              currency: { type: Type.STRING, description: "3-letter ISO currency code (e.g., EUR, USD)." },
              category: { type: Type.STRING, description: "Choose the best fit from the provided categories list." },
              description: { type: Type.STRING, description: "Clean merchant name or summary." },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Clean item name." },
                    genericName: { type: Type.STRING, description: "A generic search-friendly name (e.g., 'Oat Milk' instead of 'Oatly Barista')." },
                    quantity: { type: Type.NUMBER },
                    unitPrice: { type: Type.NUMBER },
                    totalPrice: { type: Type.NUMBER },
                    discount: { type: Type.NUMBER, description: "Positive amount if an item-level discount is shown." },
                    type: { 
                      type: Type.STRING, 
                      description: "MUST be one of: 'food', 'service', 'durable', 'supply'. Use 'service' for any fees/tips." 
                    },
                    aisle: {
                      type: Type.STRING,
                      description: "MUST be one of: 'Produce', 'Proteins', 'Dairy', 'Starch', 'Pantry', 'Drinks', 'Household', 'Other'."
                    }
                  },
                  required: ['name', 'genericName', 'quantity', 'unitPrice', 'totalPrice', 'type', 'aisle']
                }
              }
            },
            required: ['date', 'amount', 'currency', 'category', 'description', 'items']
          }
        }
      });

      const data = JSON.parse(response.text!);
      if (data.items) {
        data.items = data.items.map((i: any) => ({ ...i, id: crypto.randomUUID() }));
      }
      
      // Instead of immediate add, trigger the split confirmation flow
      setScannedReceiptData({
        ...data,
        receiptUrl: URL.createObjectURL(file)
      });
      setIsScanning(false);
    } catch (error) {
      console.error('Scan failed', error);
      setStatusMessage({ type: 'error', text: 'Failed to scan receipt. Please enter manually.' });
      setIsScanning(false);
    }
  };

  const handleSplitConfirmation = async (splits: { itemId: string, isSplit: boolean }[]) => {
    if (!user || !scannedReceiptData) return;
    
    try {
      setIsScanning(true);
      const items = scannedReceiptData.items || [];
      const nonSplitItems: any[] = [];
      let nonSplitTotal = 0;
      const householdMembers = householdId && roomieId ? (await getDoc(doc(db, `households/${householdId}`))).data()?.members || [] : [];

      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const purchaseDate = validateTransactionDate(scannedReceiptData.date || now);

      for (const item of items) {
        const splitInfo = splits.find(s => s.itemId === item.id);
        const shouldSplit = splitInfo?.isSplit && householdId && roomieId;

        if (shouldSplit) {
          // Note: addSplitReceiptItem already uses its own internal batch logic.
          // For architectural purity, we call it separately, but ideally this would be merged.
          await addSplitReceiptItem(
            user.uid,
            roomieId!,
            householdId!,
            item,
            scannedReceiptData.description || 'Merchant',
            scannedReceiptData.category || CATEGORIES[0],
            scannedReceiptData.currency || baseCurrency,
            purchaseDate,
            householdMembers
          );
        } else {
          nonSplitItems.push(item);
          nonSplitTotal += item.totalPrice;

          const pantryId = crypto.randomUUID();
          const categorizedFields = categorizeItem(item.name, item.type);
          const pantryRef = doc(db, 'pantryItems', pantryId);
          
          const members = new Set([user.uid]);
          if (householdId) {
             householdMembers.forEach(m => members.add(m));
          }

          batch.set(pantryRef, {
            id: pantryId,
            name: item.name,
            purchaseDate: purchaseDate,
            burnRateDays: 7,
            quantity: item.quantity || 1,
            remainingPercentage: 100,
            ownerId: user.uid,
            sharedWithHouseholdId: householdId,
            splitRatio: 1.0,
            genericName: item.genericName,
            aisle: item.aisle as any,
            agentStatus: 'idle',
            targetPrice: item.unitPrice * 0.95,
            createdAt: now,
            allowedUsers: Array.from(members),
            ...categorizedFields
          });
        }
      }

      if (nonSplitItems.length > 0) {
        const expenseId = crypto.randomUUID();
        const expenseRef = doc(db, `users/${user.uid}/expenses`, expenseId);
        
        batch.set(expenseRef, {
          id: expenseId,
          date: purchaseDate,
          amount: nonSplitTotal,
          rawTotal: nonSplitTotal,
          splitRatio: 1.0,
          computedCost: nonSplitTotal,
          category: scannedReceiptData.category || CATEGORIES[0],
          description: scannedReceiptData.description || 'Receipt Scan',
          currency: scannedReceiptData.currency || baseCurrency,
          isRecurring: false,
          hasItems: true,
          items: nonSplitItems,
          createdAt: now
        });

        for (const item of nonSplitItems) {
          const historyId = crypto.randomUUID();
          const historyRef = doc(db, `users/${user.uid}/priceHistory`, historyId);
          const categorizedFields = categorizeItem(item.name, item.type);
          const nTag = categorizedFields.itemType === 'food' ? categorizeNutrition(item.name) : undefined;

          batch.set(historyRef, {
            expenseId: expenseId,
            itemName: item.name,
            merchant: scannedReceiptData.description || 'Receipt Scan',
            date: purchaseDate,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            quantity: item.quantity || 1,
            currency: scannedReceiptData.currency || baseCurrency,
            ...(nTag ? { nutritionTag: nTag } : {}),
            type: categorizedFields.itemType,
            ...(item.discount ? { discount: item.discount } : {}),
            createdAt: now
          });
        }
      }

      await batch.commit();
      setStatusMessage({ type: 'success', text: 'Receipt processed successfully!' });

      setScannedReceiptData(null);
      setShowAddForm(false);
      setStatusMessage({ type: 'success', text: `Ledger updated: ${nonSplitItems.length} items grouped as receipt.` });
    } catch (e) {
      console.error(e);
      setStatusMessage({ type: 'error', text: 'Failed to finalize split' });
    } finally {
      setIsScanning(false);
    }
  };

  // --- Database Settings Update ---
  const updateBaseCurrency = async (newCurrency: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}`), { baseCurrency: newCurrency }, { merge: true });
    } catch(e) { console.error(e); }
  };

  const updateSpendingCap = async (newCap: number) => {
    if (!user) return;
    try {
      await setDoc(doc(db, `users/${user.uid}`), { spendingCap: newCap }, { merge: true });
    } catch(e) { console.error(e); }
  };

  const updateItemCategorization = async (itemName: string, tag: NutritionTag) => {
    if (!user) return;
    try {
      const normalizedName = itemName.toLowerCase().trim();
      const batch = writeBatch(db);

      // 1. Save global override
      batch.set(doc(db, `users/${user.uid}/userCategorizationOverrides/${normalizedName}`), {
        itemName: normalizedName,
        tag: tag,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Update priceHistory entries for this item name
      const affectedHistory = priceHistory.filter(h => h.itemName.toLowerCase().trim() === normalizedName);
      affectedHistory.forEach(h => {
        batch.update(doc(db, `users/${user.uid}/priceHistory/${h.id}`), { nutritionTag: tag });
      });

      // 3. Update active pantry items for this item name
      const affectedPantry = pantryItems.filter(p => p.name.toLowerCase().trim() === normalizedName);
      affectedPantry.forEach(p => {
        batch.update(doc(db, `pantryItems/${p.id}`), { nutritionTag: tag });
      });

      await batch.commit();
      await loadNutritionOverrides(user.uid);
      setStatusMessage({ type: 'success', text: `Always tagging "${itemName}" as ${tag} now.` });
    } catch (error) {
      console.error('Recategorization failed:', error);
      setStatusMessage({ type: 'error', text: 'Cloud sync failed.' });
    }
  };

  const updateBudgets = async (newBudgetsOrUpdater: any) => {
    // Only implemented as mock for current UI
    const resolved = typeof newBudgetsOrUpdater === 'function' ? newBudgetsOrUpdater(budgets) : newBudgetsOrUpdater;
    setBudgets(resolved);
  };

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-bg-deep flex items-center justify-center">
        <Loader2 className="animate-spin text-accent-green" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-deep flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-24 h-24 bg-gradient-to-br from-accent-green to-emerald-600 rounded-full flex items-center justify-center text-black mb-4">
          <TrendingUp size={40} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">SpendSmart</h1>
          <p className="text-text-muted mt-2 font-bold uppercase tracking-widest text-xs">Pro Edition</p>
        </div>
        <button 
          onClick={() => signInWithPopup(auth, googleProvider)}
          className="bg-white text-black px-8 py-4 rounded-full font-black uppercase tracking-widest shadow-xl flex items-center gap-3"
        >
          <Cloud size={20} />
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-deep font-sans text-white pb-24">
      <main className="max-w-lg mx-auto p-6 space-y-6 pt-10">
        {/* --- Status Messages --- */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={cn(
                "p-3 rounded-2xl flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
                statusMessage.type === 'success' ? "bg-accent-soft text-accent-green border border-accent-green/10" : "bg-red-500/10 text-red-500 border border-red-500/10"
              )}
            >
              {statusMessage.type === 'success' ? <RefreshCw size={14} /> : <AlertCircle size={14} />}
              {statusMessage.text}
              <button onClick={() => setStatusMessage(null)} className="ml-auto opacity-50 hover:opacity-100">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Tab Content --- */}
        {activeTab === 'settlements' && (
          <SettlementsView debts={debts} currentUserId={user?.uid || ''} currency={baseCurrency} />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard 
            user={user!}
            totalSpent={totalSpentMonth} 
            categories={spendingByCategory} 
            budgets={budgets} 
            expenses={hydratedExpenses}
            baseCurrency={baseCurrency}
            spendingCap={spendingCap}
            onScanRequest={() => { setStatusMessage({type: 'success', text: 'Scan clicked'}); setShowAddForm(true); }}
            onDelete={deleteExpense}
            onDeleteItem={deleteItemFromReceipt}
            onUpdateTag={updateItemCategorization}
            priceHistory={priceHistory}
            householdId={householdId}
            roomieId={roomieId}
            splitExistingItem={splitExistingItem}
          />
        )}
        {activeTab === 'expenses' && (
          <ExpensesList 
            expenses={hydratedExpenses} 
            onDelete={deleteExpense}
            onDeleteItem={deleteItemFromReceipt} 
            baseCurrency={baseCurrency}
            onUpdateTag={updateItemCategorization}
            priceHistory={priceHistory}
          />
        )}
        {activeTab === 'items' && (
          <ItemsDatabase priceHistory={priceHistory} baseCurrency={baseCurrency} onUpdateTag={updateItemCategorization} />
        )}
        {activeTab === 'pantry' && (
          <PantryView 
            user={user} 
            householdId={householdId} 
            allItems={pantryItems} 
            shoppingList={shoppingList} 
            onUpdateTag={updateItemCategorization}
            onSearchActive={setHideNav}
          />
        )}
        {activeTab === 'deals' && (
          <DealsView allItems={pantryItems} />
        )}
        {activeTab === 'assets' && (
          <AssetsView user={user} />
        )}
        {activeTab === 'meals' && (
          <MealGenerator pantryItems={pantryItems} />
        )}
        {activeTab === 'inbox' && user && (
          <GmailSyncView 
            user={user} 
            baseCurrency={baseCurrency} 
            onProcessComplete={(data) => {
               setScannedReceiptData(data);
               setShowAddForm(true);
            }} 
          />
        )}
        {activeTab === 'household' && user && (
          <HouseholdManager 
            user={user} 
            activeHouseholdId={householdId} 
            onSelectHousehold={setHouseholdId} 
          />
        )}
        {activeTab === 'reports' && (
          <Reports expenses={hydratedExpenses} baseCurrency={baseCurrency} />
        )}
        {activeTab === 'business' && user && (
          <BusinessView user={user} baseCurrency={baseCurrency} />
        )}
        {activeTab === 'shopping' && (
          <ShoppingListView shoppingList={shoppingList} userId={user?.uid!} />
        )}
        {activeTab === 'settings' && (
          <SettingsPage 
            user={user}
            budgets={budgets} 
            setBudgets={updateBudgets} 
            baseCurrency={baseCurrency} 
            setBaseCurrency={updateBaseCurrency}
            spendingCap={spendingCap}
            setSpendingCap={updateSpendingCap}
            geminiKey={geminiKey}
            setGeminiKey={setGeminiKey}
            tokens={googleTokens}
            onLogout={() => {
               localStorage.removeItem('google_tokens');
               setGoogleTokens(null);
            }}
          />
        )}
      </main>

      {user && !hideNav && (
        <AIAssistant 
          user={user} 
          expenses={hydratedExpenses} 
          pantryItems={pantryItems} 
          shoppingList={shoppingList}
          householdId={householdId}
          baseCurrency={baseCurrency} 
          geminiKey={geminiKey}
          addExpense={addExpense}
          addPantryItem={addPantryItem}
          addToShoppingList={addToShoppingList}
          addBusinessTransaction={addBusinessTransaction}
        />
      )}

      {/* --- Bottom Nav --- */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-bg-nav border-t border-border-dark px-6 py-4 flex justify-between items-center z-50 sm:max-w-lg sm:mx-auto sm:rounded-t-[40px] sm:mb-2 sm:shadow-2xl">
          <NavButton active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMenuOpen(false); }} icon={<TrendingUp size={20} />} label="Wallet" />
          <NavButton active={activeTab === 'expenses'} onClick={() => { setActiveTab('expenses'); setIsMenuOpen(false); }} icon={<List size={20} />} label="List" />
          <NavButton active={activeTab === 'pantry'} onClick={() => { setActiveTab('pantry'); setIsMenuOpen(false); }} icon={<Refrigerator size={20} />} label="Pantry" />
          <NavButton active={activeTab === 'meals'} onClick={() => { setActiveTab('meals'); setIsMenuOpen(false); }} icon={<ChefHat size={20} />} label="Chef" />
          <NavButton active={isMenuOpen} onClick={() => setIsMenuOpen(!isMenuOpen)} icon={isMenuOpen ? <X size={20} /> : <Menu size={20} />} label="More" />
        </nav>
      )}

      {/* --- Hamburger Menu Overlay --- */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 z-40 bg-black/90 backdrop-blur-xl flex flex-col p-8 pt-20 overflow-y-auto w-full max-w-lg left-1/2 -translate-x-1/2 shadow-2xl"
          >
            <div className="grid grid-cols-2 gap-4">
               <MenuOption active={activeTab === 'shopping'} onClick={() => { setActiveTab('shopping'); setIsMenuOpen(false); }} icon={<ShoppingCart />} label="Shopping List" sub="Restock items" />
               <MenuOption active={activeTab === 'inbox'} onClick={() => { setActiveTab('inbox'); setIsMenuOpen(false); }} icon={<Mail />} label="Gmail Sync" sub="Fetch receipts" />
               <MenuOption active={activeTab === 'deals'} onClick={() => { setActiveTab('deals'); setIsMenuOpen(false); }} icon={<Tag />} label="Deals" sub="Agent scouting" />
               <MenuOption active={activeTab === 'household'} onClick={() => { setActiveTab('household'); setIsMenuOpen(false); }} icon={<Users />} label="Space" sub="Roomies" />
               <MenuOption active={activeTab === 'assets'} onClick={() => { setActiveTab('assets'); setIsMenuOpen(false); }} icon={<Package />} label="Assets" sub="Equipment" />
               <MenuOption active={activeTab === 'settlements'} onClick={() => { setActiveTab('settlements'); setIsMenuOpen(false); }} icon={<DollarSign />} label="Settlements" sub="Who owes what" />
               <MenuOption active={activeTab === 'reports'} onClick={() => { setActiveTab('reports'); setIsMenuOpen(false); }} icon={<PieChart />} label="Reports" sub="Insights" />
               <MenuOption active={activeTab === 'business'} onClick={() => { setActiveTab('business'); setIsMenuOpen(false); }} icon={<Briefcase />} label="Business" sub="Professional" />
               <MenuOption active={activeTab === 'items'} onClick={() => { setActiveTab('items'); setIsMenuOpen(false); }} icon={<LayoutGrid />} label="Database" sub="Price history" />
               <MenuOption active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setIsMenuOpen(false); }} icon={<Settings />} label="Setup" sub="Cloud & Auth" />
            </div>
            <p className="mt-auto text-center text-[10px] font-black uppercase tracking-[0.5em] text-text-muted opacity-50 pb-20">SpendSmart Pro Elite</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Add Expense Modal --- */}
      <AnimatePresence>
        {showAddForm && (
          <AddExpenseModal 
            onClose={() => { setShowAddForm(false); setScannedReceiptData(null); }} 
            onAdd={addExpense}
            onScan={scanReceipt}
            isScanning={isScanning}
            scannedReceiptData={scannedReceiptData}
            onConfirmSplit={handleSplitConfirmation}
            householdId={householdId}
            onCancelSplit={() => setScannedReceiptData(null)}
            baseCurrency={baseCurrency}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Components ---

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button onClick={onClick} className={cn(
      "flex flex-col items-center gap-1.5 transition-all relative",
      active ? "text-accent-green" : "text-text-muted"
    )}>
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{label}</span>
      {active && <div className="w-1 h-1 bg-accent-green rounded-full mt-0.5" />}
    </button>
  );
}

function MenuOption({ active, onClick, icon, label, sub }: { active: boolean, onClick: () => void, icon: any, label: string, sub: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-6 rounded-2xl border text-left transition-all active:scale-95",
        active 
          ? "bg-accent-soft border-accent-green/30 text-accent-green shadow-lg shadow-accent-green/5" 
          : "bg-white/5 border-white/5 text-text-muted hover:bg-white/10"
      )}
    >
      <div className={cn("mb-3", active ? "text-accent-green" : "text-white/40")}>
        {React.cloneElement(icon, { size: 24 })}
      </div>
      <p className="text-xs font-black uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-50">{sub}</p>
    </button>
  );
}

function Dashboard({ 
  user,
  totalSpent, 
  categories, 
  budgets, 
  expenses, 
  baseCurrency, 
  spendingCap, 
  onScanRequest, 
  onDelete, 
  onDeleteItem, 
  onUpdateTag, 
  priceHistory,
  householdId,
  roomieId,
  splitExistingItem
}: { 
  user: User,
  totalSpent: number, 
  categories: any[], 
  budgets: Budget[], 
  expenses: Expense[], 
  baseCurrency: string, 
  spendingCap: number, 
  onScanRequest: () => void, 
  onDelete: (id: string) => void, 
  onDeleteItem: (expId: string, itemId: string, price: number) => void, 
  onUpdateTag: (name: string, tag: NutritionTag) => void, 
  priceHistory: ItemPriceRecord[],
  householdId: string | null,
  roomieId: string | null,
  splitExistingItem: (expense: Expense, item: ReceiptItem) => void
}) {
  const recentExpenses = expenses.slice(0, 5);
  const percentage = Math.min(100, Math.round((totalSpent / spendingCap) * 100));

  const mindfulnessStats = useMemo(() => {
    let essential = 0;
    let balance = 0;
    let indulgence = 0;

    expenses.forEach(exp => {
      if (exp.items) {
        exp.items.forEach(item => {
          // Check if itemType acts like FoodItem before checking nutritionTag or if it just has nutritionTag backward-compatibility
          const isFood = (item as any).itemType === 'food' || ((item as any).itemType === undefined && item.nutritionTag !== undefined);
          if (isFood) {
            if (item.nutritionTag === 'Essential') essential += item.totalPrice;
            else if (item.nutritionTag === 'Indulgence') indulgence += item.totalPrice;
            else balance += item.totalPrice;
          }
        });
      }
    });

    const total = essential + balance + indulgence;
    if (total === 0) return null;

    return {
      essential: (essential / total) * 100,
      balance: (balance / total) * 100,
      indulgence: (indulgence / total) * 100,
      score: Math.round(((essential * 1 + balance * 0.5) / total) * 100)
    };
  }, [expenses]);

  return (
    <div className="space-y-6">
      {/* Pending Bills Section */}
      <PendingBills user={user} baseCurrency={baseCurrency} />

      {/* Monthly Summary Card */}
      <div className="bg-bg-card p-6 rounded-2xl border border-border-dark shadow-xl relative overflow-hidden">
        <p className="text-text-muted text-[11px] font-bold uppercase tracking-widest mb-2">Monthly Spending</p>
        <h2 className="text-[42px] font-black leading-none mb-6">
          {formatCurrency(totalSpent, baseCurrency)}
        </h2>
        <div className="h-2 bg-white/5 rounded-full mb-3 overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className={cn(
              "h-full shadow-[0_0_12px_rgba(46,204,113,0.3)]",
              percentage >= 100 ? "bg-red-500 shadow-red-500/30" : percentage >= 80 ? "bg-orange-500 shadow-orange-500/30" : "bg-accent-green"
            )} 
          />
        </div>
        <div className="flex justify-between text-[11px] font-bold text-text-muted">
          <span>Target: {formatCurrency(spendingCap, baseCurrency)}</span>
          <span className={cn(
             percentage >= 100 ? "text-red-500" : percentage >= 80 ? "text-orange-500" : "text-accent-green"
          )}>{percentage}% USED</span>
        </div>
      </div>

      {/* Feature 2: Mindful Spending Index Widget */}
      <div className="bg-bg-card p-6 rounded-2xl border border-border-dark overflow-hidden relative">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Mindful Spending Index</h3>
          {mindfulnessStats && (
            <div className="px-2 py-0.5 rounded-full bg-accent-soft border border-accent-green/20 text-[10px] font-black text-accent-green">
              {mindfulnessStats.score}% MINDFUL
            </div>
          )}
        </div>

        {mindfulnessStats ? (
          <div className="space-y-4">
            <div className="h-6 w-full flex rounded-xl overflow-hidden border border-white/5">
              <div style={{ width: `${mindfulnessStats.essential}%` }} className="bg-accent-green transition-all" />
              <div style={{ width: `${mindfulnessStats.balance}%` }} className="bg-blue-500 transition-all" />
              <div style={{ width: `${mindfulnessStats.indulgence}%` }} className="bg-purple-500 transition-all" />
            </div>
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                <span className="text-[10px] font-black text-text-muted uppercase">Essential</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-[10px] font-black text-text-muted uppercase">Balance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <span className="text-[10px] font-black text-text-muted uppercase">Indulgence</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-[10px] font-black text-text-muted/30 uppercase tracking-widest">
            Scanning needed for Index
          </div>
        )}
      </div>

      {/* Design Quick Scan Action */}
      <button 
        onClick={onScanRequest}
        className="w-full bg-accent-green text-black rounded-3xl py-4 flex justify-center items-center gap-3 font-black text-sm active:scale-[0.98] transition-all shadow-lg shadow-accent-green/10"
      >
        <div className="w-5 h-5 border-2 border-black rounded flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-black rounded-full" />
        </div>
        QUICK SCAN RECEIPT
      </button>

      {/* Reports Overview */}
      <div className="bg-bg-card p-6 rounded-2xl border border-border-dark">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Top Allocation</h3>
          <div className="text-[10px] bg-white/5 px-2 py-1 rounded-lg text-text-muted font-bold">THIS MONTH</div>
        </div>
        {categories.length > 0 ? (
          <div className="space-y-6">
            <div className="h-48 w-full min-h-[192px] min-w-[200px]">
              <ResponsiveContainer width="100%" height="100%" minHeight={192} minWidth={200}>
                <RePieChart>
                  <Pie
                    data={categories}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {categories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        
                        // Refined detailed logic to find contributing items/expenses
                        const detailList: { description: string; amount: number }[] = [];
                        expenses.forEach(e => {
                          if (e.items && e.items.length > 0) {
                            e.items.forEach(item => {
                              let cat = e.category;
                              if (item.type === 'food') cat = 'Food & Dining';
                              else if (item.type === 'supply' || item.type === 'durable') cat = 'Living & Household';
                              else if (item.type === 'service' && e.category === 'Food & Dining') cat = 'Other';
                              
                              if (cat === data.name) {
                                detailList.push({ description: item.name, amount: item.totalPrice });
                              }
                            });
                          } else if (e.category === data.name) {
                            detailList.push({ description: e.description, amount: e.amount });
                          }
                        });

                        const sortedDetails = detailList.sort((a, b) => b.amount - a.amount).slice(0, 3);
                        
                        return (
                          <div className="bg-bg-deep border border-border-dark p-3 rounded-2xl shadow-2xl space-y-2 max-w-[200px]">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.fill || COLORS[0] }} />
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">{data.name}</span>
                            </div>
                            <div className="text-sm font-black text-white">{formatCurrency(data.value, baseCurrency)}</div>
                            <div className="space-y-1">
                              {sortedDetails.map((tx, i) => (
                                <div key={i} className="flex justify-between gap-2 text-[8px] font-bold text-text-muted">
                                  <span className="truncate uppercase tracking-tighter">{tx.description}</span>
                                  <span className="text-white shrink-0">{formatCurrency(tx.amount, baseCurrency)}</span>
                                </div>
                              ))}
                              {detailList.length > 3 && (
                                <div className="text-[8px] text-accent-green font-black uppercase text-center pt-1 border-t border-white/5">
                                  + more details below
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-1 gap-y-2 pt-4 border-t border-white/5">
              {categories.map((item, index) => (
                <CategoryAllocationItem 
                  key={item.name} 
                  item={item} 
                  index={index} 
                  expenses={expenses} 
                  baseCurrency={baseCurrency} 
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-text-muted/30 text-xs font-bold italic tracking-wider">
            NO DATA RECORDED
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="space-y-4 pb-4">
        <div className="flex justify-between items-end px-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Recent Activity</h3>
          <button className="text-[11px] font-black text-accent-green uppercase tracking-wider">Stats</button>
        </div>
        <div className="space-y-3">
          {recentExpenses.length > 0 ? recentExpenses.map(expense => (
            <ExpenseItemRow 
              key={expense.id} 
              expense={expense} 
              onDelete={onDelete} 
              onDeleteItem={onDeleteItem} 
              baseCurrency={baseCurrency} 
              onUpdateTag={onUpdateTag} 
              priceHistory={priceHistory}
              householdId={householdId}
              roomieId={roomieId}
              onSplitItem={splitExistingItem}
            />
          )) : (
            <div className="p-12 text-center text-text-muted/20 text-xs font-black uppercase tracking-[0.2em]">
              Wallet Empty
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpenseItemRow({ 
  expense, 
  onDelete, 
  onDeleteItem, 
  baseCurrency, 
  onUpdateTag, 
  priceHistory,
  householdId,
  roomieId,
  onSplitItem
}: { 
  key?: string, 
  expense: Expense, 
  onDelete: (id: string) => void, 
  onDeleteItem: (expenseId: string, itemId: string, price: number) => void, 
  baseCurrency: string, 
  onUpdateTag: (name: string, tag: NutritionTag) => void, 
  priceHistory: ItemPriceRecord[],
  householdId: string | null,
  roomieId: string | null,
  onSplitItem: (expense: Expense, item: ReceiptItem) => void
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  return (
    <div className="bg-bg-card rounded-2xl border border-border-dark overflow-hidden group hover:border-white/10 transition-colors">
      <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 border border-white/5 shrink-0">
          {expense.isRecurring ? <RefreshCw size={18} className="text-accent-green" /> : <DollarSign size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white">{expense.description}</p>
          <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-wider">
            <span>{expense.category}</span>
            <span>•</span>
            <span>{format(parseISO(expense.date), 'MMM d, yyyy')}</span>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <p className="font-black text-sm text-white">-{formatCurrency(expense.amount, expense.currency)}</p>
          <div className="flex items-center gap-2">
            {(expense.items && expense.items.length > 0) && (
              <span className="text-[9px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded flex items-center gap-1"><ShoppingBag size={10}/> {expense.items.length}</span>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(expense.id); }}
              className="p-1 text-white/30 hover:text-red-500 transition-all hover:scale-110"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
      {expanded && expense.items && expense.items.length > 0 && (
        <div className="px-4 pb-4 bg-white/[0.02] border-t border-white/5 pt-3 space-y-4">
            <ReceiptSpectrumBar items={expense.items} />
            <div className="space-y-2">
              <div className="flex text-[9px] font-black uppercase tracking-widest text-text-muted px-2">
                <div className="flex-1">Item</div>
                <div className="w-8 text-right">Qty</div>
                <div className="w-16 text-right">Price</div>
                <div className="w-16 text-right">Total</div>
                <div className="w-8 ml-2"></div>
              </div>
              {expense.items.map(item => {
                const isNonFood = item.type === 'service' || item.type === 'supply' || item.type === 'durable' || item.type === 'asset';
                return (
                  <div key={item.id} className="relative flex flex-col text-xs font-bold text-white bg-white/5 rounded-lg border border-white/5 group/item overflow-visible p-3">
                    {/* Identity Rail - Only for food */}
                    {!isNonFood && (
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-lg transition-colors"
                        style={{ backgroundColor: item.nutritionTag === 'Essential' ? '#10b981' : item.nutritionTag === 'Indulgence' ? '#8b5cf6' : '#3B82F6' }}
                      />
                    )}
                    
                    <div className={cn("flex flex-col gap-2", isNonFood ? "pl-2" : "pl-3")}>
                      <div className="flex justify-between items-start gap-4">
                        <div className="relative flex-1 min-w-0">
                          {isNonFood ? (
                            <div className="text-left font-black text-white/50 flex items-center gap-2 italic">
                              <Tag size={10} className="shrink-0" />
                              <span className="truncate whitespace-normal text-[10px] uppercase tracking-wider">{item.name}</span>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                 e.stopPropagation();
                                 setExpandedItemId(expandedItemId === item.id ? null : item.id);
                              }}
                              className="text-left font-black hover:text-accent-green transition-colors w-full flex items-center gap-2"
                            >
                              <span className="truncate whitespace-normal text-[10px] uppercase tracking-wider leading-relaxed">{item.name}</span>
                              {item.nutritionTag && (
                                <div className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.nutritionTag === 'Essential' ? '#10b981' : item.nutritionTag === 'Indulgence' ? '#8b5cf6' : '#3B82F6' }} />
                              )}
                            </button>
                          )}

                          <AnimatePresence>
                            {!isNonFood && expandedItemId === item.id && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                animate={{ opacity: 1, y: -40, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                                className="absolute z-10 left-0 bg-bg-deep border border-border-dark rounded-full p-1 flex gap-1 shadow-2xl backdrop-blur-md"
                              >
                                {(['Essential', 'Balance', 'Indulgence'] as NutritionTag[]).map(t => (
                                  <button
                                    key={t}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateTag(item.name, t);
                                      setExpandedItemId(null);
                                    }}
                                    className={cn(
                                      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all",
                                      item.nutritionTag === t 
                                        ? "bg-white text-black" 
                                        : "text-text-muted hover:text-white hover:bg-white/5"
                                    )}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          {householdId && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); onSplitItem(expense, item); }}
                              className="text-white/10 hover:text-accent-green transition-colors"
                              title="Share with household"
                            >
                              <Users size={12} />
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); onDeleteItem(expense.id, item.id, item.totalPrice); }}
                            className="text-white/10 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-white/5 mt-1">
                        <div className="flex gap-4 text-[10px] items-center">
                          <div className="text-text-muted">
                            <span className="font-normal opacity-50">Qty:</span> {item.quantity}
                          </div>
                          <div className="flex items-center gap-2">
                             <div className="text-text-muted font-mono">
                              <span className="font-normal opacity-50">Unit:</span> {formatCurrency(item.unitPrice, expense.currency)}
                             </div>
                             {(() => {
                               const itemHistory = priceHistory.filter(h => h.itemName.toLowerCase().trim() === item.name.toLowerCase().trim());
                               const pastPurchases = itemHistory.filter(h => h.expenseId !== expense.id);
                               if (pastPurchases.length === 0) return null;
                               const avgPrice = pastPurchases.reduce((sum, h) => sum + h.unitPrice, 0) / pastPurchases.length;
                               const variance = ((item.unitPrice - avgPrice) / avgPrice) * 100;
                               if (Math.abs(variance) < 1) return null; // Ignore minor fluctuations
                               
                               return (
                                 <div className={cn(
                                   "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                                   variance > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                                 )}>
                                   {variance > 0 ? <TrendingUp size={8} /> : <TrendingUp size={8} className="rotate-180" />}
                                   {Math.abs(variance).toFixed(0)}%
                                 </div>
                               );
                             })()}
                          </div>
                        </div>
                        <div className="text-accent-green font-mono text-sm">
                          {formatCurrency(item.totalPrice, expense.currency)}
                        </div>
                      </div>
                    </div>
                    {item.discount && item.discount > 0 ? (
                      <div className={cn("flex items-center justify-between text-[10px] text-orange-400 mt-2", isNonFood ? "pl-2" : "pl-3")}>
                        <span className="flex items-center gap-1 font-bold italic opacity-80"><Tag size={10} /> Discount applied</span>
                        <span className="font-mono">-{formatCurrency(item.discount, expense.currency)}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
        </div>
      )}
    </div>
  );
}

function ExpensesList({ expenses, onDelete, onDeleteItem, baseCurrency, onUpdateTag, priceHistory }: { expenses: Expense[], onDelete: (id: string) => void, onDeleteItem: (expId: string, itemId: string, price: number) => void, baseCurrency: string, onUpdateTag: (name: string, tag: NutritionTag) => void, priceHistory: ItemPriceRecord[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filtered = expenses.filter(e => 
    e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <input 
          type="text" 
          placeholder="Search ledger..." 
          className="w-full pl-12 pr-6 py-4 bg-bg-card border border-border-dark rounded-2xl text-sm font-bold text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent-green/50 transition-colors"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.length > 0 ? filtered.map(expense => (
          <ExpenseItemRow key={expense.id} expense={expense} onDelete={onDelete} onDeleteItem={onDeleteItem} baseCurrency={baseCurrency} onUpdateTag={onUpdateTag} priceHistory={priceHistory} />
        )) : (
          <div className="p-20 text-center text-text-muted/20 text-xs font-black uppercase tracking-widest leading-loose">No matches found in ledger</div>
        )}
      </div>
    </div>
  );
}

function Reports({ expenses, baseCurrency }: { expenses: Expense[], baseCurrency: string }) {
  const last6Months = useMemo(() => {
    const end = endOfMonth(new Date());
    const start = startOfMonth(subMonths(end, 5));
    const range = eachMonthOfInterval({ start, end });

    return range.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const total = expenses
        .filter(e => isWithinInterval(parseISO(e.date), { start: monthStart, end: monthEnd }))
        .reduce((sum, e) => sum + e.amount, 0);
      
      return {
        name: format(month, 'MMM'),
        total
      };
    });
  }, [expenses]);

  const categoryMix = useMemo(() => {
    const counts: Record<string, number> = {};
    expenses.forEach(e => {
      counts[e.category] = (counts[e.category] || 0) + e.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [expenses]);

  return (
    <div className="space-y-6 pb-4">
      <div className="bg-bg-card p-6 rounded-2xl border border-border-dark shadow-xl">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-8">Performance Trend</h3>
        <div className="h-64 w-full min-h-0 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minHeight={1} minWidth={1}>
            <BarChart data={last6Months}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#888', fontWeight: 700 }} 
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} hide />
              <Tooltip 
                cursor={{ fill: '#ffffff05' }}
                contentStyle={{ backgroundColor: '#141414', borderRadius: '16px', border: '1px solid #262626', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
              />
              <Bar dataKey="total" fill="#2ecc71" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-bg-card p-6 rounded-2xl border border-border-dark">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-8">Asset Breakdown</h3>
        <div className="space-y-4">
          {categoryMix.map((item, i) => (
            <div key={item.name} className="flex items-center gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
              <div className="w-2.5 h-2.5 rounded-full ring-4 ring-black/20" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <div className="flex-1 text-xs font-black uppercase tracking-wider text-text-muted">{item.name}</div>
              <div className="text-sm font-black text-white">{formatCurrency(item.value, baseCurrency)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ budgets, setBudgets, baseCurrency, setBaseCurrency, spendingCap, setSpendingCap, tokens, onLogout, user, geminiKey, setGeminiKey }: { budgets: Budget[], setBudgets: any, baseCurrency: string, setBaseCurrency: any, spendingCap: number, setSpendingCap: any, tokens: any, onLogout: any, user: User, geminiKey: string, setGeminiKey: (k: string) => void }) {
  const [newBudget, setNewBudget] = useState({ category: CATEGORIES[0], amount: '' });
  const [localCap, setLocalCap] = useState(spendingCap.toString());
  const [isConnecting, setIsConnecting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error' | 'none', message: string }>({ type: 'none', message: '' });

  useEffect(() => { setLocalCap(spendingCap.toString()); }, [spendingCap]);

  const wipeUserData = async () => {
    setIsResetting(true);
    setResetFeedback({ type: 'none', message: '' });
    setShowConfirmReset(false);
    
    try {
      const uid = user.uid;
      
      // 1. Delete user's isolated subcollections using batches
      const collections = ['expenses', 'budgets', 'priceHistory', 'shoppingList', 'assets', 'userCategorizationOverrides'];
      for (const col of collections) {
        const q = query(collection(db, `users/${uid}/${col}`));
        const snap = await getDocs(q);
        
        const chunks = [];
        for (let i = 0; i < snap.docs.length; i += 500) {
          chunks.push(snap.docs.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(docSnap => batch.delete(docSnap.ref));
          await batch.commit();
        }
      }

      // 2. Delete user's pantry items from the root pool
      const pq = query(collection(db, 'pantryItems'), where('ownerId', '==', uid));
      const pSnap = await getDocs(pq);
      const pChunks = [];
      for (let i = 0; i < pSnap.docs.length; i += 500) {
        pChunks.push(pSnap.docs.slice(i, i + 500));
      }
      for (const chunk of pChunks) {
        const batch = writeBatch(db);
        chunk.forEach(pDoc => batch.delete(pDoc.ref));
        await batch.commit();
      }

      // 3. Reset user profile to defaults
      await updateDoc(doc(db, `users/${uid}`), {
        spendingCap: 3000,
        baseCurrency: 'EUR'
      });
      
      setResetFeedback({ type: 'success', message: 'All personal data has been erased. Start fresh!' });
    } catch (e) {
      console.error("Failed to reset app data:", e);
      setResetFeedback({ type: 'error', message: 'Failed to erase data. Check connection.' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const res = await fetch("/api/auth/url");
      const { url } = await res.json();
      window.open(url, "google-auth", "width=600,height=700");
    } catch (e) {
      console.error("Failed to get auth URL", e);
    } finally {
      setIsConnecting(false);
    }
  };

  const addBudget = async () => {
    if (!newBudget.amount || !user) return;
    const amount = parseFloat(newBudget.amount);
    try {
      await setDoc(doc(db, `users/${user.uid}/budgets/${newBudget.category}`), {
        category: newBudget.category,
        amount: amount,
        createdAt: new Date().toISOString()
      });
      setNewBudget({ category: CATEGORIES[0], amount: '' });
    } catch (e) {
      console.error("Failed to add budget:", e);
    }
  };

  const deleteBudget = async (category: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/budgets/${category}`));
    } catch (e) {
      console.error("Failed to delete budget:", e);
    }
  };

  const handleCapBlur = () => {
    const val = parseFloat(localCap);
    if (!isNaN(val) && val > 0) {
      setSpendingCap(val);
    } else {
      setLocalCap(spendingCap.toString());
    }
  };

  return (
    <div className="space-y-8 pb-4">
      <section className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">General Config</h3>
        <div className="bg-bg-card p-6 rounded-2xl border border-border-dark space-y-6">
          <div className="flex justify-between items-center group">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted group-hover:text-white transition-colors">Gemini API Key</span>
            <input 
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Paste Key Here"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-black focus:outline-none focus:border-accent-green text-right w-48"
            />
          </div>
          <div className="flex justify-between items-center group">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted group-hover:text-white transition-colors">Firebase User ID (For Bot)</span>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono text-white select-all">
              {user.uid}
            </div>
          </div>
          <div className="flex justify-between items-center group">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted group-hover:text-white transition-colors">Default Currency</span>
            <select 
              value={baseCurrency} 
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-black focus:outline-none focus:border-accent-green cursor-pointer"
            >
              {CURRENCIES.map(c => <option key={c.code} value={c.code} className="bg-bg-card">{c.code} ({c.symbol})</option>)}
            </select>
          </div>
          <div className="flex justify-between items-center group">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted group-hover:text-white transition-colors">Total Spending Cap</span>
            <input 
              type="number" 
              value={localCap}
              onChange={(e) => setLocalCap(e.target.value)}
              onBlur={handleCapBlur}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-black focus:outline-none focus:border-accent-green text-right w-32"
            />
          </div>
          <div className="flex justify-between items-center group">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted group-hover:text-white transition-colors">Cloud Sync</span>
            {tokens ? (
              <button onClick={onLogout} className="text-[11px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/10 active:scale-95 transition-all">Disconnect Account</button>
            ) : (
              <button 
                onClick={handleConnect} 
                disabled={isConnecting}
                className="text-[11px] font-black text-accent-green uppercase tracking-widest bg-accent-soft px-4 py-2 rounded-xl border border-accent-green/10 active:scale-95 transition-all flex items-center gap-2"
              >
                {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
                Connect Google Workspace
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Budget Overrides</h3>
        <div className="bg-bg-card p-6 rounded-2xl border border-border-dark space-y-6">
          <div className="flex flex-col gap-4">
            <select 
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-accent-green"
              value={newBudget.category}
              onChange={(e) => setNewBudget({ ...newBudget, category: e.target.value })}
            >
              {CATEGORIES.map(c => <option key={c} value={c} className="bg-bg-card">{c}</option>)}
            </select>
            <div className="flex gap-3">
              <input 
                type="number" 
                placeholder="0.00" 
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-black focus:outline-none focus:border-accent-green"
                value={newBudget.amount}
                onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
              />
              <button onClick={addBudget} className="bg-accent-green text-black w-14 rounded-2xl flex items-center justify-center shadow-lg shadow-accent-green/10 active:scale-90 transition-all">
                <Plus size={24} />
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            {budgets.map(b => (
              <div key={b.category} className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">{b.category}</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-black text-white">{formatCurrency(b.amount, baseCurrency)}</span>
                  <button 
                    onClick={() => deleteBudget(b.category)}
                    className="p-2 text-text-muted/40 hover:text-red-500 transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#ef4444]">Danger Zone</h3>
        <div className="bg-red-500/10 p-6 rounded-2xl border border-red-500/20 space-y-6">
          <div>
            <h4 className="text-sm font-black text-red-400 uppercase tracking-widest">Factory Reset</h4>
            <p className="text-[10px] text-red-400/60 font-bold uppercase tracking-wider mt-1">
              Irreversible Data Clearance
            </p>
          </div>

          {resetFeedback.type !== 'none' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={cn(
                "p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border",
                resetFeedback.type === 'success' ? "bg-accent-green/10 text-accent-green border-accent-green/20" : "bg-red-500/10 text-red-500 border-red-500/20"
              )}
            >
              {resetFeedback.message}
            </motion.div>
          )}

          <button 
            onClick={() => setShowConfirmReset(true)}
            disabled={isResetting}
            className="w-full bg-red-500 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl shadow-[0_0_20px_rgba(239,68,68,0.2)] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isResetting ? <Loader2 size={16} className="animate-spin" /> : <AlertCircle size={16} />}
            Erase My Data
          </button>
        </div>
      </section>

      <AnimatePresence>
        {showConfirmReset && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm bg-bg-card p-8 rounded-2xl border border-red-500/30 text-center space-y-6 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white">Full Reset?</h3>
                <p className="text-xs text-text-muted font-bold leading-relaxed">
                  This will permanently delete all your specific pantry items, receipts, budgets, and shopping lists. This action is irreversible.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={wipeUserData}
                  className="w-full bg-red-500 text-white font-black text-xs uppercase tracking-widest py-5 rounded-2xl active:scale-95 transition-all"
                >
                  Yes, Erase Everything
                </button>
                <button 
                  onClick={() => setShowConfirmReset(false)}
                  className="w-full bg-white/5 text-text-muted font-black text-xs uppercase tracking-widest py-4 rounded-2xl hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddExpenseModal({ 
  onClose, 
  onAdd, 
  onScan, 
  isScanning,
  scannedReceiptData,
  onConfirmSplit,
  householdId,
  onCancelSplit,
  baseCurrency
}: { 
  onClose: () => void, 
  onAdd: (e: any) => void, 
  onScan: (f: File) => void, 
  isScanning: boolean,
  scannedReceiptData: any | null,
  onConfirmSplit: (splits: any[]) => void,
  householdId: string | null,
  onCancelSplit: () => void,
  baseCurrency: string
}) {
  const [step, setStep] = useState<'options' | 'manual'>('options');
  const [manualExpense, setManualExpense] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    category: CATEGORIES[0],
    description: '',
    currency: baseCurrency,
    isRecurring: false
  });
  const [items, setItems] = useState<Partial<ReceiptItem>[]>([]);

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.heic'] },
    multiple: false,
    onDrop: (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) onScan(acceptedFiles[0]);
    }
  } as any);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualExpense.description) return;
    
    const validItems = items.filter(i => i.name && i.unitPrice);
    const computedAmount = validItems.length > 0 
      ? validItems.reduce((acc, curr) => acc + ((curr.quantity || 1) * (curr.unitPrice || 0)), 0)
      : parseFloat(manualExpense.amount);

    const finalAmount = computedAmount || parseFloat(manualExpense.amount) || 0;

    onAdd({
      ...manualExpense,
      amount: finalAmount,
      items: validItems.map(i => ({
        id: crypto.randomUUID(),
        name: i.name!,
        quantity: i.quantity || 1,
        unitPrice: i.unitPrice || 0,
        totalPrice: (i.quantity || 1) * (i.unitPrice || 0)
      }))
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        layout
        initial={{ y: '100%', scale: 1 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: '100%', scale: 0.95 }}
        className={cn(
          "w-full max-w-lg bg-bg-card shadow-2xl relative transition-all",
          scannedReceiptData 
            ? "rounded-2xl p-2 border-none" 
            : "rounded-t-2xl sm:rounded-2xl border-t border-white/10 p-6 space-y-6"
        )}
      >
        {!scannedReceiptData && (
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black tracking-tight text-white">Entry Portal</h2>
            <button onClick={onClose} className="p-2 bg-white/5 rounded-full border border-white/5 text-text-muted hover:text-white transition-colors">×</button>
          </div>
        )}

        {isScanning ? (
          <div className="py-20 flex flex-col items-center justify-center gap-6">
            <div className="relative">
                <Loader2 className="animate-spin text-accent-green" size={60} strokeWidth={1} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 bg-accent-green/20 rounded-full animate-pulse" />
                </div>
            </div>
            <div className="text-center space-y-2">
                <p className="font-black text-sm uppercase tracking-[0.2em] text-white">Deconstructing Receipt</p>
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Gemini Engine Online</p>
            </div>
          </div>
        ) : scannedReceiptData ? (
          <ReceiptSplitter 
            extractedItems={scannedReceiptData.items || []}
            householdId={householdId}
            currency={baseCurrency}
            onConfirm={onConfirmSplit}
            onCancel={onCancelSplit}
          />
        ) : step === 'options' ? (
          <div className="grid grid-cols-2 gap-4 h-56">
            <label 
              className="flex flex-col items-center justify-center gap-4 bg-bg-deep border border-border-dark rounded-2xl hover:border-accent-green/30 active:scale-95 transition-all group cursor-pointer"
            >
              <input 
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onScan(file);
                }}
              />
              <div className="w-14 h-14 bg-accent-soft text-accent-green rounded-2xl flex items-center justify-center border border-accent-green/10 group-hover:scale-110 transition-transform">
                <Camera size={24} />
              </div>
              <span className="font-black uppercase tracking-widest text-[11px] text-accent-green">Optical Scan</span>
            </label>
            <button 
              onClick={() => setStep('manual')}
              className="flex flex-col items-center justify-center gap-4 bg-bg-deep border border-border-dark rounded-2xl hover:border-white/20 active:scale-95 transition-all group"
            >
              <div className="w-14 h-14 bg-white/5 text-white/50 rounded-2xl flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <span className="font-black uppercase tracking-widest text-[11px] text-text-muted">Manual Keys</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input 
                type="date" 
                className="bg-bg-deep border border-border-dark rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-accent-green"
                value={manualExpense.date}
                onChange={(e) => setManualExpense({ ...manualExpense, date: e.target.value })}
              />
              <div className="flex bg-bg-deep border border-border-dark rounded-xl px-4 py-3 focus-within:border-accent-green transition-colors">
                <span className="text-accent-green font-black mr-2 text-xs">
                  {CURRENCIES.find(c => c.code === baseCurrency)?.symbol || '€'}
                </span>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00" 
                  className="bg-transparent border-none w-full text-xs font-black text-white focus:outline-none placeholder:text-text-muted/20"
                  value={manualExpense.amount}
                  onChange={(e) => setManualExpense({ ...manualExpense, amount: e.target.value })}
                />
              </div>
            </div>

            <input 
              type="text" 
              placeholder="Merchant Identity / Note" 
              className="w-full bg-bg-deep border border-border-dark rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-accent-green"
              value={manualExpense.description}
              onChange={(e) => setManualExpense({ ...manualExpense, description: e.target.value })}
            />

            <select 
              className="w-full bg-bg-deep border border-border-dark rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-accent-green cursor-pointer"
              value={manualExpense.category}
              onChange={(e) => setManualExpense({ ...manualExpense, category: e.target.value })}
            >
              {CATEGORIES.map(c => <option key={c} value={c} className="bg-bg-card">{c}</option>)}
            </select>

            <div className="flex items-center gap-3 px-2 py-2">
              <input 
                type="checkbox" 
                id="recurring"
                className="w-4 h-4 rounded border-border-dark bg-bg-deep text-accent-green focus:ring-accent-green"
                checked={manualExpense.isRecurring}
                onChange={(e) => setManualExpense({ ...manualExpense, isRecurring: e.target.checked })}
              />
              <label htmlFor="recurring" className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Automated Recurring</label>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Itemized Breakdown (Optional)</label>
                <button type="button" onClick={() => setItems([...items, { name: '', quantity: 1, unitPrice: 0 }])} className="text-[10px] font-black text-accent-green uppercase tracking-wider bg-accent-soft px-2 py-1 rounded">+ Add Item</button>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <input type="text" placeholder="Item" value={it.name} onChange={(e) => { const newIt = [...items]; newIt[idx].name = e.target.value; setItems(newIt); }} className="flex-1 bg-white/5 border border-white/5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white focus:border-accent-green outline-none uppercase tracking-tighter" />
                  <input type="number" placeholder="x1" value={it.quantity || ''} onChange={(e) => { const newIt = [...items]; newIt[idx].quantity = parseFloat(e.target.value); setItems(newIt); }} className="w-10 bg-white/5 border border-white/5 rounded-lg px-1 py-1.5 text-[11px] font-bold text-white focus:border-accent-green outline-none text-center" />
                  <div className="flex items-center bg-white/5 border border-white/5 rounded-lg px-2 py-1.5 focus-within:border-accent-green">
                    <span className="text-[10px] text-accent-green font-black mr-1">$</span>
                    <input type="number" placeholder="0.00" value={it.unitPrice || ''} onChange={(e) => { const newIt = [...items]; newIt[idx].unitPrice = parseFloat(e.target.value); setItems(newIt); }} className="w-12 bg-transparent text-[11px] font-bold text-white outline-none" />
                  </div>
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500/30 hover:text-red-500 p-1.5 transition-colors"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>

            <button type="submit" className="w-full bg-accent-green text-black py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-accent-green/10 active:scale-95 active:bg-emerald-400 transition-all mt-4">
              Commit Ledger
            </button>
            <button type="button" onClick={() => setStep('options')} className="w-full text-text-muted/40 text-[10px] font-black uppercase tracking-[0.3em] hover:text-white transition-colors">Back to Options</button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

function ItemsDatabase({ priceHistory, baseCurrency, onUpdateTag }: { priceHistory: ItemPriceRecord[], baseCurrency: string, onUpdateTag: (name: string, tag: NutritionTag) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const itemStats = useMemo(() => {
    const map: Record<string, ItemPriceRecord[]> = {};
    priceHistory.forEach(record => {
      const normalized = record.itemName.toLowerCase().trim();
      if(!map[normalized]) map[normalized] = [];
      map[normalized].push(record);
    });
    
    return Object.entries(map).map(([_, records]) => {
      records.sort((a,b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
      const latest = records[0];
      const minPrice = Math.min(...records.map(r => r.unitPrice));
      const maxPrice = Math.max(...records.map(r => r.unitPrice));
      const avgPrice = records.reduce((s, r) => s + r.unitPrice, 0) / records.length;
      
      return {
        name: records[0].itemName,
        records,
        latest,
        minPrice,
        maxPrice,
        avgPrice,
        count: records.length,
        nutritionTag: records[0].nutritionTag,
        type: records[0].type
      };
    }).filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.count - a.count);
  }, [priceHistory, searchTerm]);

  return (
    <div className="space-y-6 pb-20">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <input 
          type="text" 
          placeholder="Search items database..." 
          className="w-full pl-12 pr-6 py-4 bg-bg-card border border-border-dark rounded-2xl text-sm font-bold text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent-green/50 transition-colors"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {itemStats.length > 0 ? itemStats.map((stat) => {
          const isNonFood = stat.type === 'service' || stat.type === 'supply' || stat.type === 'durable' || stat.type === 'asset';
          return (
            <div key={stat.name} className="relative bg-bg-card p-5 rounded-2xl border border-border-dark group overflow-visible">
               {/* Identity Rail - Only for food */}
               {!isNonFood && (
                 <div 
                   className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[24px] transition-colors"
                   style={{ backgroundColor: stat.nutritionTag === 'Essential' ? '#10b981' : stat.nutritionTag === 'Indulgence' ? '#8b5cf6' : '#3B82F6' }}
                 />
               )}
               
               <div className={cn("flex flex-col gap-3 mb-4", isNonFood ? "pl-2" : "pl-3")}>
                 <div className="flex justify-between items-start gap-4">
                   <div className="relative flex-1 min-w-0">
                     {isNonFood ? (
                        <div className="font-black text-white/50 text-[10px] uppercase tracking-wider flex items-center gap-2 italic leading-relaxed">
                          <Tag size={12} className="shrink-0" />
                          <span className="whitespace-normal">{stat.name}</span>
                        </div>
                     ) : (
                        <button 
                          onClick={() => setExpandedItem(expandedItem === stat.name ? null : stat.name)}
                          className="font-black text-white text-[10px] uppercase tracking-wider hover:text-accent-green transition-colors flex items-center gap-2 text-left"
                        >
                          <span className="whitespace-normal leading-relaxed">{stat.name}</span>
                          {stat.nutritionTag && (
                            <div className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: stat.nutritionTag === 'Essential' ? '#10b981' : stat.nutritionTag === 'Indulgence' ? '#8b5cf6' : '#3B82F6' }} />
                          )}
                        </button>
                     )}

                     <AnimatePresence>
                      {!isNonFood && expandedItem === stat.name && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.9 }}
                          animate={{ opacity: 1, y: -45, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.9 }}
                          className="absolute z-10 left-0 bg-bg-deep border border-border-dark rounded-full p-1.5 flex gap-1 shadow-2xl backdrop-blur-md"
                        >
                          {(['Essential', 'Balance', 'Indulgence'] as NutritionTag[]).map(t => (
                            <button
                              key={t}
                              onClick={() => {
                                onUpdateTag(stat.name, t);
                                setExpandedItem(null);
                              }}
                              className={cn(
                                "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                                stat.nutritionTag === t 
                                  ? "bg-white text-black" 
                                  : "text-text-muted hover:text-white hover:bg-white/5"
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </motion.div>
                      )}
                     </AnimatePresence>
                   </div>
                   <div className="shrink-0 text-right flex flex-col items-end gap-1">
                     <div className="flex items-center gap-1.5">
                       {(() => {
                          const variance = ((stat.latest.unitPrice - stat.avgPrice) / stat.avgPrice) * 100;
                          if (Math.abs(variance) < 1) return null;
                          return (
                            <div className={cn(
                              "px-1.5 py-0.5 rounded text-[8px] font-black flex items-center gap-0.5",
                              variance > 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
                            )}>
                              {variance > 0 ? <TrendingUp size={8} /> : <TrendingUp size={8} className="rotate-180" />}
                              {Math.abs(variance).toFixed(0)}%
                            </div>
                          );
                       })()}
                       <p className="text-xs font-black text-accent-green">{formatCurrency(stat.avgPrice, baseCurrency)}</p>
                     </div>
                     <p className="text-[8px] font-black text-white/30 uppercase tracking-tighter">Avg Price</p>
                   </div>
                 </div>

                 <div className="flex items-center justify-between pt-2 border-t border-white/5">
                   <div className="flex gap-4">
                     <div className="flex flex-col">
                       <span className="text-[8px] font-black text-white/30 uppercase tracking-wider">Frequency</span>
                       <span className="text-[10px] font-bold text-text-muted">{stat.count} Purchases</span>
                     </div>
                     <div className="flex flex-col">
                       <span className="text-[8px] font-black text-white/30 uppercase tracking-wider">Range</span>
                       <span className="text-[10px] font-bold text-text-muted">{formatCurrency(stat.minPrice, baseCurrency)} — {formatCurrency(stat.maxPrice, baseCurrency)}</span>
                     </div>
                   </div>
                 </div>
               </div>

               <div className={cn("border-t border-white/5 pt-3 space-y-2", isNonFood ? "pl-2" : "pl-3")}>
               <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">Price History by Store</p>
               {stat.records.slice(0, 3).map((record, i) => (
                 <div key={i} className="flex justify-between items-center text-xs">
                   <div className="flex items-center gap-2">
                     <Store size={12} className="text-text-muted" />
                     <span className="font-bold text-white/80">{record.merchant}</span>
                     <span className="text-[9px] text-text-muted">{format(parseISO(record.date), 'MMM d, yy')}</span>
                   </div>
                   <span className="font-black">{formatCurrency(record.unitPrice, record.currency)}</span>
                 </div>
               ))}
               {stat.records.length > 3 && (
                 <div className="text-center mt-2">
                   <span className="text-[10px] font-bold text-accent-green cursor-pointer p-1">+ {stat.records.length - 3} more records</span>
                 </div>
               )}
             </div>
          </div>
        );
      }) : (
        <div className="p-20 text-center text-text-muted/20 text-xs font-black uppercase tracking-widest leading-loose">No items tracked yet</div>
      )}
      </div>
    </div>
  );
}

function ShoppingListView({ shoppingList, userId }: { shoppingList: ShoppingListItem[], userId: string }) {
  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-3 px-2 mb-8 mt-4">
        <div className="w-10 h-10 bg-accent-soft text-accent-green rounded-xl flex items-center justify-center">
          <ShoppingCart size={20} />
        </div>
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-widest">Shopping List</h2>
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{shoppingList.length} Items pending</p>
        </div>
      </div>

      <div className="space-y-3">
        {shoppingList.length > 0 ? (
          shoppingList.map((item) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="group flex justify-between items-center bg-bg-card p-4 rounded-2xl border border-border-dark shadow-sm hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => deleteDoc(doc(db, `users/${userId}/shoppingList/${item.id}`))}
                  className="w-8 h-8 rounded-lg border border-white/20 flex items-center justify-center text-transparent hover:text-accent-green hover:border-accent-green transition-all focus:text-accent-green focus:border-accent-green bg-bg-deep"
                >
                  <Check size={16} strokeWidth={3} />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-black text-white/90">{item.name}</span>
                  <span className="text-[10px] font-bold text-text-muted/60 uppercase tracking-widest">
                    Added {formatDistanceToNow(parseISO(item.createdAt || item.addedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => deleteDoc(doc(db, `users/${userId}/shoppingList/${item.id}`))}
                className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 sm:opacity-100"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))
        ) : (
          <div className="py-20 text-center space-y-4 opacity-30 flex flex-col items-center">
            <ShoppingCart size={48} className="mx-auto block" />
            <p className="text-xs font-black uppercase tracking-[0.2em]">List is empty</p>
          </div>
        )}
      </div>
    </div>
  );
}
