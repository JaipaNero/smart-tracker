import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, onSnapshot, doc, setDoc, deleteDoc, User, updateDoc } from './lib/firebase';
import { PantryItem, ShoppingListItem, NutritionTag, PantryAisle, AgentStatus } from './types';
import { addDays, isPast, isToday, parseISO, formatDistanceToNow, format, differenceInDays } from 'date-fns';
import { 
  Check, X, Box, ShoppingCart, Plus, Minus, Loader2, ArrowRight, ArrowLeft, 
  ChevronLeft, ChevronRight, GripVertical, Heart, AlertCircle, Info, 
  Lock, Globe, Search, Filter, Tag, Zap, Apple, Beef, Milk, 
  Croissant, UtensilsCrossed, Coffee, ShieldCheck, TrendingDown, Store, Edit2,
  Users, Calendar, ChevronDown, ChevronUp, MoreVertical, Refrigerator,
  Package, Droplets, Sparkles, Wine, Carrot, Fish, Egg, Soup, GlassWater, Cookie,
  Bell, Mail
} from 'lucide-react';
import { cn } from './lib/utils';
import { loadNutritionOverrides } from './services/nutritionService';
import { usePersonalPantry, useSharedPantry } from './hooks/usePantry';
import { getPantryViewItems } from './lib/inventoryUtils';

const AISLE_CONFIG: Record<PantryAisle, { icon: any, color: string, label: string, bg: string, accent: string }> = {
  Produce: { icon: Apple, color: 'text-accent-green', label: 'Produce', bg: 'bg-accent-soft', accent: 'bg-accent-green' },
  Proteins: { icon: Beef, color: 'text-white/60', label: 'Proteins', bg: 'bg-white/5', accent: 'bg-white/10' },
  Dairy: { icon: Milk, color: 'text-white/60', label: 'Dairy', bg: 'bg-white/5', accent: 'bg-white/10' },
  Starch: { icon: Croissant, color: 'text-white/60', label: 'Grains', bg: 'bg-white/5', accent: 'bg-white/10' },
  Pantry: { icon: UtensilsCrossed, color: 'text-white/60', label: 'Dry Goods', bg: 'bg-white/5', accent: 'bg-white/10' },
  Drinks: { icon: Coffee, color: 'text-white/60', label: 'Drinks', bg: 'bg-white/5', accent: 'bg-white/10' },
  Household: { icon: ShieldCheck, color: 'text-white/60', label: 'Supplies', bg: 'bg-white/5', accent: 'bg-white/10' },
  Other: { icon: Box, color: 'text-white/60', label: 'Other', bg: 'bg-white/5', accent: 'bg-white/10' }
};

const getItemIcon = (name: string, aisle?: PantryAisle) => {
  const n = name.toLowerCase();
  
  // Specific Keyword Matches
  if (n.includes('milk') || n.includes('yogurt') || n.includes('cheese') || n.includes('butter')) return Milk;
  if (n.includes('bread') || n.includes('bagel') || n.includes('croissant') || n.includes('bakery')) return Croissant;
  if (n.includes('rice') || n.includes('pasta') || n.includes('noodle') || n.includes('grain') || n.includes('flour')) return UtensilsCrossed;
  if (n.includes('meat') || n.includes('chicken') || n.includes('beef') || n.includes('pork') || n.includes('steak') || n.includes('bacon')) return Beef;
  if (n.includes('fish') || n.includes('salmon') || n.includes('tuna') || n.includes('shrimp') || n.includes('seafood')) return Fish;
  if (n.includes('egg')) return Egg;
  if (n.includes('fruit') || n.includes('apple') || n.includes('banana') || n.includes('berry') || n.includes('citrus') || n.includes('avocado')) return Apple;
  if (n.includes('veg') || n.includes('carrot') || n.includes('broccoli') || n.includes('lettuce') || n.includes('spinach') || n.includes('potato') || n.includes('onion') || n.includes('garlic')) return Carrot;
  if (n.includes('soda') || n.includes('juice') || n.includes('water') || n.includes('coke') || n.includes('pepsi')) return GlassWater;
  if (n.includes('coffee') || n.includes('tea')) return Coffee;
  if (n.includes('wine') || n.includes('beer') || n.includes('alcohol') || n.includes('spirits')) return Wine;
  if (n.includes('soap') || n.includes('clean') || n.includes('detergent') || n.includes('shampoo') || n.includes('paste')) return Sparkles;
  if (n.includes('cookie') || n.includes('snack') || n.includes('chocolate') || n.includes('candy') || n.includes('chips')) return Cookie;
  if (n.includes('soup') || n.includes('can') || n.includes('stew')) return Soup;

  // Fallback to Category Icon
  if (aisle && AISLE_CONFIG[aisle]) return AISLE_CONFIG[aisle].icon;
  return Package;
};

// Predictive Depletion Logic
export const getEstimatedEmptyDate = (purchaseDate: string, burnRateDays: number, quantity: number): Date => {
  return addDays(parseISO(purchaseDate), Math.round(burnRateDays * quantity));
};

const SummaryStats = ({ items }: { items: PantryItem[] }) => {
  const stats = useMemo(() => {
    let freshCount = 0;
    let expiringCount = 0;
    
    items.forEach(item => {
      const emptyDate = getEstimatedEmptyDate(item.purchaseDate, item.burnRateDays, item.quantity);
      const daysLeft = differenceInDays(emptyDate, new Date());
      
      if (daysLeft <= 0) {
        expiringCount++;
      }
      
      if (daysLeft > 0) {
        freshCount++;
      }
    });

    const freshPercentage = items.length > 0 ? Math.round((freshCount / items.length) * 100) : 0;
    
    return { freshPercentage, expiringCount };
  }, [items]);

  return (
    <div className="grid grid-cols-2 gap-4 px-0">
      <div className="bg-bg-card p-6 rounded-[32px] border border-border-dark shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-16 h-16 bg-accent-green/5 blur-2xl rounded-full -mr-8 -mt-8 group-hover:bg-accent-green/10 transition-all duration-700" />
        <div className="flex items-center gap-2 mb-4">
          <div className="w-4 h-4 rounded-full bg-accent-green/20 flex items-center justify-center">
             <div className="w-1.5 h-1.5 bg-accent-green rounded-full" />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Freshness</span>
        </div>
        <div className="text-4xl font-black text-white leading-tight tracking-tighter">{stats.freshPercentage}%</div>
      </div>

      <div className="bg-bg-card p-6 rounded-[32px] border border-border-dark shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 blur-2xl rounded-full -mr-8 -mt-8 group-hover:bg-red-500/10 transition-all duration-700" />
        <div className="flex items-center gap-2 mb-4">
          <div className="w-4 h-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle size={10} className="text-red-500" />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Expiring</span>
        </div>
        <div className="text-4xl font-black text-white leading-tight tracking-tighter">{stats.expiringCount}</div>
      </div>
    </div>
  );
};

const NotificationBanner = ({ onNotify, isNotifying, expiringCount }: { onNotify: () => void, isNotifying: boolean, expiringCount: number }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-accent-green/10 border border-accent-green/20 rounded-2xl p-4 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center shrink-0">
          <Bell size={20} className="text-accent-green" />
        </div>
        <div>
          <h4 className="text-[13px] font-black text-white uppercase tracking-tight">Expiry Alerts</h4>
          <p className="text-[10px] font-bold text-accent-green uppercase opacity-70">
            {expiringCount > 0 ? `${expiringCount} items need attention` : 'Pantry is looking fresh'}
          </p>
        </div>
      </div>
      <button 
        onClick={onNotify}
        disabled={isNotifying}
        className="px-4 py-2 bg-accent-green text-bg-deep rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
      >
        {isNotifying ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
        {isNotifying ? 'Sending...' : 'Email Me Report'}
      </button>
    </motion.div>
  );
};

const PantryItemRow = ({ 
  item, 
  onEmpty, 
  onUpdatePct,
  onUpdateNutrition,
  householdId 
}: any) => {
  const [showOptions, setShowOptions] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout>();
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [newDate, setNewDate] = useState(item.purchaseDate.split('T')[0]);

  const emptyDate = getEstimatedEmptyDate(item.purchaseDate, item.burnRateDays, item.quantity);
  const daysLeft = differenceInDays(emptyDate, new Date());
  const isHealthy = item.nutritionTag === 'Balance' || item.nutritionTag === 'Superfood' || item.nutritionTag === 'Essential';
  const Icon = getItemIcon(item.name, item.aisle as PantryAisle);
  
  const startLongPress = () => {
    setIsLongPressing(true);
    longPressTimer.current = setTimeout(() => {
      setShowOptions(true);
      setIsLongPressing(false);
    }, 500);
  };

  const cancelLongPress = () => {
    setIsLongPressing(false);
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const getBarColor = () => {
    if (item.remainingPercentage <= 25) return 'bg-red-500';
    if (item.remainingPercentage <= 50) return 'bg-orange-500';
    return 'bg-accent-green';
  };

  const updateQuantity = async (delta: number) => {
    const newQty = Math.max(1, (item.quantity || 1) + delta);
    try {
      await updateDoc(doc(db, `pantryItems/${item.id}`), { quantity: newQty });
    } catch (e) {
      console.error(e);
    }
  };

  const markStillFresh = async () => {
    try {
      await updateDoc(doc(db, `pantryItems/${item.id}`), { 
        purchaseDate: new Date().toISOString() 
      });
      setShowOptions(false);
    } catch (e) {
      console.error(e);
    }
  };

  const updateDate = async () => {
    try {
      await updateDoc(doc(db, `pantryItems/${item.id}`), { 
        purchaseDate: new Date(newDate).toISOString() 
      });
      setShowDatePicker(false);
      setShowOptions(false);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSharedSpace = async () => {
    if (!householdId) return;
    try {
      await updateDoc(doc(db, `pantryItems/${item.id}`), { 
        sharedWithHouseholdId: item.sharedWithHouseholdId ? null : householdId 
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div 
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        className="relative py-4 group cursor-pointer active:scale-[0.99] transition-transform select-none border-b border-white/[0.03] last:border-0"
      >
        {isLongPressing && (
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.5, ease: "linear" }}
            className="absolute top-0 left-0 h-0.5 bg-accent-green z-[100]"
          />
        )}
        
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0 shadow-inner">
             <Icon size={20} className={cn(isHealthy ? "text-accent-green" : "text-text-muted", "opacity-70")} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="font-bold text-white text-[15px] truncate tracking-tight">{item.name}</h4>
                {item.sharedWithHouseholdId && (
                  <Users size={12} className="text-accent-green shrink-0 opacity-60" />
                )}
              </div>
              <div className="flex-1 max-w-[80px] h-1.5 bg-white/5 rounded-full overflow-hidden ml-auto">
                <div 
                  className={cn("h-full transition-all duration-500", getBarColor())}
                  style={{ width: `${item.remainingPercentage}%` }}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                  {item.quantity} {item.quantity === 1 ? 'PC' : 'PCS'}
                </span>
                {daysLeft <= 5 && (
                  <span className={cn(
                    "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                    daysLeft <= 0 ? "bg-red-500 text-white" : 
                    daysLeft <= 2 ? "bg-orange-500 text-white" : 
                    "bg-accent-soft text-accent-green"
                  )}>
                    {daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
                  </span>
                )}
              </div>
              
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest",
                item.remainingPercentage <= 25 ? "text-red-500" : "text-accent-green opacity-40"
              )}>
                {item.remainingPercentage <= 25 ? 'Low Stock' : 'In Stock'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showOptions && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onPointerDown={() => setShowOptions(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onPointerDown={e => e.stopPropagation()}
              className="bg-bg-card border border-border-dark p-6 rounded-[32px] w-full max-w-sm space-y-6 shadow-2xl relative"
            >
              <button 
                 onClick={() => setShowOptions(false)}
                 className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-text-muted transition-colors hover:text-white"
              >
                <X size={20} />
              </button>
              
              <div className="text-center">
                <h3 className="font-black text-xl text-white uppercase tracking-widest leading-tight">{item.name}</h3>
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mt-1">Manage Item</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center bg-black/40 p-4 rounded-3xl border border-white/5 shadow-inner">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Quantity</span>
                  <div className="flex items-center gap-4">
                    <button onClick={() => updateQuantity(-1)} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center transition-colors hover:bg-white/10 active:scale-90 border border-white/5">
                      <Minus size={16} />
                    </button>
                    <span className="font-black font-mono text-xl text-white">{item.quantity || 1}</span>
                    <button onClick={() => updateQuantity(1)} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center transition-colors hover:bg-white/10 active:scale-90 border border-white/5">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="bg-black/40 p-4 rounded-3xl border border-white/5 space-y-3 shadow-inner">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Fill Status</span>
                  <div className="flex gap-2">
                    {[25, 50, 75, 100].map(pct => (
                      <button 
                        key={pct}
                        onClick={() => { onUpdatePct(item.id, pct); setShowOptions(false); }}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          item.remainingPercentage === pct 
                            ? "bg-accent-green text-black" 
                            : "bg-white/5 text-text-muted hover:text-white hover:bg-white/10 border border-white/5"
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={markStillFresh}
                    className="flex-[2] flex justify-between items-center bg-accent-soft p-4 rounded-3xl border border-accent-green/20 shadow-inner active:scale-95 transition-all text-left"
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-accent-green flex items-center gap-2">
                      <Sparkles size={16} />
                      Still Fresh
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-tighter text-accent-green/60">Reset</span>
                  </button>
                  <button 
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className={cn(
                      "flex-1 flex items-center justify-center rounded-3xl border transition-all active:scale-95",
                      showDatePicker 
                        ? "bg-accent-green border-accent-green text-bg-deep shadow-lg" 
                        : "bg-black/40 border-white/5 text-text-muted hover:text-white"
                    )}
                  >
                    <Calendar size={18} />
                  </button>
                </div>

                <AnimatePresence>
                  {showDatePicker && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-black/40 p-4 rounded-3xl border border-white/5 space-y-3 shadow-inner overflow-hidden"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Purchase Date</span>
                      <div className="flex gap-2">
                        <input 
                          type="date" 
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-accent-green/50"
                        />
                        <button 
                          onClick={updateDate}
                          className="px-4 bg-accent-green text-bg-deep rounded-xl font-black text-[10px] uppercase tracking-widest"
                        >
                          Save
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {householdId && (
                  <button 
                    onClick={toggleSharedSpace}
                    className="w-full flex justify-between items-center bg-black/40 p-4 rounded-3xl border border-white/5 shadow-inner"
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                      <Users size={16} className={item.sharedWithHouseholdId ? 'text-accent-green' : 'text-text-muted'} />
                      Shared Space
                    </span>
                    <div className={cn(
                      "w-10 h-6 rounded-full flex items-center p-1 transition-colors",
                      item.sharedWithHouseholdId ? "bg-accent-green" : "bg-white/10"
                    )}>
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full shadow-sm transition-transform",
                        item.sharedWithHouseholdId ? "translate-x-4" : "translate-x-0"
                      )} />
                    </div>
                  </button>
                )}
                
                <div className="flex gap-4 pt-2">
                  <button 
                    onClick={() => { deleteDoc(doc(db, `pantryItems/${item.id}`)); setShowOptions(false); }}
                    className="flex-1 bg-red-500/10 text-red-500 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-red-500/20 active:scale-95 transition-all"
                  >
                    Remove
                  </button>
                  <button 
                    onClick={() => { onEmpty(item); setShowOptions(false); }}
                    className="flex-[2] bg-accent-green text-black py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-xl"
                  >
                    Mark Empty
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const AisleGroup = ({ 
  aisle, 
  items, 
  onEmpty, 
  onUpdatePct, 
  onUpdateNutrition, 
  householdId,
  isExpanded,
  onToggle 
}: any) => {
  const cfg = AISLE_CONFIG[aisle];
  const Icon = cfg.icon;

  const expiredCount = useMemo(() => {
    return items.filter((i: PantryItem) => {
      const emptyDate = getEstimatedEmptyDate(i.purchaseDate, i.burnRateDays, i.quantity);
      return differenceInDays(emptyDate, new Date()) <= 0;
    }).length;
  }, [items]);

  const expiringSoonCount = useMemo(() => {
    return items.filter((i: PantryItem) => {
      const emptyDate = getEstimatedEmptyDate(i.purchaseDate, i.burnRateDays, i.quantity);
      const daysLeft = differenceInDays(emptyDate, new Date());
      return daysLeft > 0 && daysLeft <= 3;
    }).length;
  }, [items]);

  const lowStockCount = useMemo(() => {
    return items.filter((i: PantryItem) => i.remainingPercentage <= 25).length;
  }, [items]);

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden transition-all duration-300",
      isExpanded 
        ? "bg-bg-card border border-accent-green/30 ring-1 ring-accent-green/10 shadow-lg" 
        : "bg-bg-card border border-border-dark shadow-sm"
    )}>
      <button 
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-left group"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300", 
            isExpanded ? "bg-accent-green scale-105 shadow-lg shadow-accent-green/10" : "bg-black/40 border border-white/5"
          )}>
            <Icon size={20} className={isExpanded ? "text-black" : "text-white/60"} />
          </div>
          <div>
            <h3 className="font-bold text-white text-[15px] tracking-tight group-hover:text-accent-green transition-colors leading-tight">{cfg.label}</h3>
            <div className="flex items-center gap-1.5 text-[9px] font-black text-text-muted uppercase tracking-[0.12em] mt-0.5">
              <span>{items.length} items</span>
              <span className="opacity-20 text-[5px]">●</span>
              {expiredCount > 0 ? (
                <span className="text-red-500 font-black">{expiredCount} Expired</span>
              ) : expiringSoonCount > 0 ? (
                <span className="text-orange-400 font-black">{expiringSoonCount} Expiring</span>
              ) : lowStockCount > 0 ? (
                <span className="text-orange-400 font-black">{lowStockCount} Low</span>
              ) : (
                <span className="text-accent-green/70 font-black">Fresh</span>
              )}
            </div>

            {!isExpanded && items.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {items.slice(0, 3).map((item: PantryItem) => (
                  <div key={item.id} className="flex items-center gap-1 px-1.5 py-0.5 bg-white/[0.03] border border-white/[0.05] rounded-md">
                    <div className="w-1 h-1 rounded-full bg-accent-green/40" />
                    <span className="text-[8px] font-black text-white/50 uppercase tracking-widest whitespace-nowrap leading-none flex items-center gap-1">
                      {item.name}
                      {item.sharedWithHouseholdId && <Users size={8} className="text-accent-green/40" />}
                    </span>
                  </div>
                ))}
                {items.length > 3 && (
                  <span className="text-[8px] font-black text-text-muted/40 uppercase tracking-widest ml-0.5">
                    +{items.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {isExpanded ? <ChevronUp className="text-text-muted" size={16} /> : <ChevronDown className="text-text-muted" size={16} />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-0 relative">
              <div className="absolute top-0 left-4 right-4 h-px bg-white/5" />
              {items.map((item: PantryItem) => (
                <PantryItemRow 
                  key={item.id} 
                  item={item} 
                  onEmpty={onEmpty} 
                  onUpdatePct={onUpdatePct}
                  onUpdateNutrition={onUpdateNutrition}
                  householdId={householdId}
                />
              ))}
              

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function PantryView({ 
  user, 
  householdId, 
  allItems, 
  shoppingList,
  onUpdateTag,
  onSearchActive
}: { 
  user: User, 
  householdId: string | null, 
  allItems: PantryItem[],
  shoppingList: ShoppingListItem[],
  onUpdateTag: (name: string, tag: NutritionTag) => Promise<void>,
  onSearchActive?: (active: boolean) => void
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSharedOnly, setShowSharedOnly] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isNotifying, setIsNotifying] = useState(false);

  const sendNotification = async () => {
    if (!user.email) return;
    setIsNotifying(true);
    
    const expiringItemsPayload = validPantryItems
      .map(item => {
        const emptyDate = getEstimatedEmptyDate(item.purchaseDate, item.burnRateDays, item.quantity);
        const daysLeft = differenceInDays(emptyDate, new Date());
        return {
          name: item.name,
          daysLeft,
          quantity: item.quantity,
          pct: item.remainingPercentage
        };
      })
      .filter(item => item.daysLeft <= 3);

    if (expiringItemsPayload.length === 0) {
      alert("No items expiring soon!");
      setIsNotifying(false);
      return;
    }

    try {
      const res = await fetch('/api/notify/expiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          items: expiringItemsPayload
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("Expiry report sent to your email!");
      } else {
        alert("Failed to send notification: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      alert("Error sending notification");
    } finally {
      setIsNotifying(false);
    }
  };

  useEffect(() => {
    onSearchActive?.(isSearchFocused);
  }, [isSearchFocused, onSearchActive]);

  const validPantryItems = useMemo(() => getPantryViewItems(allItems), [allItems]);

  const filteredItems = useMemo(() => {
    let items = validPantryItems;
    if (showSharedOnly) {
      items = items.filter(item => !!item.sharedWithHouseholdId);
    }
    if (!searchTerm) return items;
    
    const lowerSearch = searchTerm.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(lowerSearch) || 
      (item.genericName && item.genericName.toLowerCase().includes(lowerSearch))
    );
  }, [validPantryItems, searchTerm, showSharedOnly]);

  const groups = useMemo(() => {
    const res: Record<string, PantryItem[]> = {};
    filteredItems.forEach(item => {
      const a = item.aisle || 'Other';
      if (!res[a]) res[a] = [];
      res[a].push(item);
    });
    // Sort groups for consistent display
    return Object.fromEntries(
      Object.entries(res).sort((a, b) => (AISLE_CONFIG[a[0] as PantryAisle]?.label || '').localeCompare(AISLE_CONFIG[b[0] as PantryAisle]?.label || ''))
    ) as Record<string, PantryItem[]>;
  }, [filteredItems]);

  const toggleGroup = (aisle: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(aisle)) next.delete(aisle);
      else next.add(aisle);
      return next;
    });
  };

  const updateItemPercentage = async (id: string, pct: number) => {
    try {
      await updateDoc(doc(db, `pantryItems/${id}`), { remainingPercentage: pct });
    } catch (e) {
      console.error('Failed to update pct', e);
    }
  };

  const updateNutritionTag = async (item: PantryItem, newTag: NutritionTag) => {
    try {
      await onUpdateTag(item.name, newTag);
    } catch (e) {
      console.error('Failed to update nutrition tag', e);
    }
  };

  const handleConfirmEmpty = async (item: PantryItem) => {
    const shopId = crypto.randomUUID();
    const shoppingItem: ShoppingListItem = {
      id: shopId,
      name: item.name,
      addedAt: new Date().toISOString()
    };

    try {
      const docRef = doc(db, `users/${user.uid}/shoppingList/${shopId}`);
      await setDoc(docRef, { ...shoppingItem, createdAt: new Date().toISOString() });
      await deleteDoc(doc(db, `pantryItems/${item.id}`));
    } catch (e) {
      console.error(e);
    }
  };

  const addDummyItem = async () => {
    const id = crypto.randomUUID();
    await setDoc(doc(db, `pantryItems/${id}`), {
      name: 'Oat Milk (1L)',
      genericName: 'Oat Milk',
      aisle: 'Dairy',
      purchaseDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      burnRateDays: 5, 
      quantity: 1,
      remainingPercentage: 100,
      ownerId: user.uid,
      allowedUsers: [user.uid],
      sharedWithHouseholdId: null,
      splitRatio: 1.0,
      agentStatus: 'idle',
      itemType: 'food',
      nutritionTag: 'Balance',
      createdAt: new Date().toISOString()
    });
  };

  return (
    <div className={cn("space-y-6 pb-32", isSearchFocused ? "-mt-16" : "-mt-10")}>
       <div className={cn(
        "sticky top-0 z-20 bg-bg-deep/95 backdrop-blur-md px-4 pt-10 pb-4 -mx-4 transition-all"
      )}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-green" size={18} />
          <input 
            type="text" 
            placeholder="Search your pantry..." 
            className="w-full pl-12 pr-12 py-4 bg-bg-card border border-border-dark rounded-2xl text-sm font-medium text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent-green/30 transition-all shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          />
          <button 
            onClick={() => setShowSharedOnly(!showSharedOnly)}
            className={cn("absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all", showSharedOnly ? "bg-accent-green text-black" : "bg-white/5 text-text-muted hover:text-white")}
          >
            <Users size={16} />
          </button>
        </div>
      </div>

      {!searchTerm && !isSearchFocused && (
        <>
          <SummaryStats items={validPantryItems} />
          <NotificationBanner 
            onNotify={sendNotification} 
            isNotifying={isNotifying} 
            expiringCount={validPantryItems.filter(i => differenceInDays(getEstimatedEmptyDate(i.purchaseDate, i.burnRateDays, i.quantity), new Date()) <= 0).length}
          />
        </>
      )}

      <div className="space-y-4 px-0">
        {(Object.entries(groups) as [PantryAisle, PantryItem[]][]).map(([aisle, items]) => (
          <AisleGroup 
            key={aisle}
            aisle={aisle}
            items={items}
            onEmpty={handleConfirmEmpty}
            onUpdatePct={updateItemPercentage}
            onUpdateNutrition={updateNutritionTag}
            householdId={householdId}
            isExpanded={expandedGroups.has(aisle)}
            onToggle={() => toggleGroup(aisle)}
          />
        ))}

        {validPantryItems.length === 0 && (
          <div className="py-20 text-center space-y-4 opacity-30 flex flex-col items-center uppercase tracking-[0.2em] font-black">
            <Refrigerator size={64} className="text-accent-green" strokeWidth={1} />
            <p className="text-xs text-white">Your Pantry is empty</p>
          </div>
        )}
      </div>

      {!isSearchFocused && (
        <div className="fixed bottom-24 right-6 z-20">
          <button 
            onClick={addDummyItem}
            className="w-16 h-16 bg-accent-green text-bg-deep rounded-full flex items-center justify-center shadow-2xl shadow-accent-green/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={32} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
}
