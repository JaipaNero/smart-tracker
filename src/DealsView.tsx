import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Store, ArrowRight, Tag, Zap, Loader2, RefreshCw, AlertTriangle, TrendingDown } from 'lucide-react';
import { PantryItem, PantryAisle } from './types';
import { huntDeals, DealMatch } from './services/dealService';
import { cn } from './lib/utils';

export default function DealsView({ allItems }: { allItems: PantryItem[] }) {
  const [deals, setDeals] = useState<DealMatch[]>([]);
  const [isHunting, setIsHunting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lowStockCount = useMemo(() => 
    allItems.filter(i => (i.remainingPercentage || 0) <= 25).length, 
  [allItems]);

  const startHunting = async () => {
    setIsHunting(true);
    setError(null);
    try {
      const results = await huntDeals(allItems);
      setDeals(results);
    } catch (err) {
      setError('The Deal Hunter encountered an error. Please try again later.');
      console.error(err);
    } finally {
      setIsHunting(false);
    }
  };

  /* 
    Auto-scouting disabled to save API usage. 
    User must now manually trigger using the Refresh button.
  */
  // useEffect(() => {
  //   if (lowStockCount > 0 && deals.length === 0) {
  //     startHunting();
  //   }
  // }, [lowStockCount]);

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex items-center justify-between bg-bg-card p-6 rounded-2xl border border-border-dark shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-accent-green">
            <Zap size={18} className="fill-accent-green" />
            <h2 className="text-sm font-black uppercase tracking-widest text-accent-green">Deal Hunter Agent</h2>
          </div>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">
            Monitoring {lowStockCount} low-stock items
          </p>
        </div>
        <button 
          onClick={startHunting}
          disabled={isHunting}
          className={cn(
            "p-3 rounded-2xl border border-white/5 transition-all active:scale-95",
            isHunting ? "bg-white/5 text-white/20" : "bg-white/10 text-white hover:bg-white/20"
          )}
        >
          {isHunting ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
      </div>

      <div className="space-y-6 pb-32">
        {isHunting && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-12 text-center space-y-4"
          >
            <div className="relative inline-block">
               <div className="absolute inset-0 bg-accent-green/20 blur-xl animate-pulse" />
               <Store size={40} className="text-accent-green relative" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-widest text-white">Agent is Scouting...</p>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Checking Dirk & Lidl for you</p>
            </div>
          </motion.div>
        )}

        {!isHunting && error && (
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex items-start gap-4">
            <AlertTriangle className="text-red-500 shrink-0" size={20} />
            <p className="text-xs font-bold text-red-500/80 leading-relaxed">{error}</p>
          </div>
        )}

        {!isHunting && deals.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <Tag size={14} className="text-orange-400" />
              <h3 className="text-xs font-black uppercase tracking-widest text-orange-400">Live Matching Deals</h3>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {deals.map((deal, idx) => {
                const myItem = allItems.find(i => i.genericName === deal.genericName);
                const isSavings = myItem?.targetPrice && deal.price <= myItem.targetPrice;

                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    key={`${deal.store}-${deal.productName}-${idx}`}
                    className="bg-bg-card p-5 rounded-2xl border border-border-dark flex items-center justify-between group relative overflow-hidden"
                  >
                    {/* Store Indicator */}
                    <div className={cn(
                      "absolute top-0 left-0 w-1 h-full",
                      deal.store === 'Dirk' ? 'bg-red-500' : 'bg-blue-500'
                    )} />

                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-text-muted">
                        <ShoppingCart size={24} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border",
                            deal.store === 'Dirk' ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          )}>
                            {deal.store}
                          </span>
                          <h4 className="text-xs font-black text-white">{deal.productName}</h4>
                        </div>
                        <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">
                          {deal.dealDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        {deal.originalPrice && (
                          <span className="text-[10px] text-text-muted line-through">€{deal.originalPrice.toFixed(2)}</span>
                        )}
                        <span className="text-sm font-black text-white">€{deal.price.toFixed(2)}</span>
                      </div>
                      {isSavings ? (
                         <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-accent-green bg-accent-soft/30 px-2 py-1 rounded-full border border-accent-green/20">
                            <TrendingDown size={10} /> Target Hit
                         </div>
                      ) : (
                        <div className="text-[8px] font-black uppercase tracking-widest text-text-muted/40">
                           {myItem?.targetPrice ? `Target: €${myItem.targetPrice.toFixed(2)}` : 'No Target Set'}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {!isHunting && deals.length === 0 && !error && (
          <div className="py-32 text-center space-y-6 opacity-20">
            <Store size={60} className="mx-auto" strokeWidth={1} />
            <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-widest leading-loose">
                {lowStockCount > 0 ? "Scouted. No matches found." : "Stock looks good. No hunting needed."}
              </p>
              <p className="text-[8px] font-bold uppercase tracking-[0.3em]">Agent standby</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
