import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ReceiptItem } from '../types';
import { Users, User, Check, AlertCircle } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

interface SplitState {
  itemId: string;
  isSplit: boolean;
}

interface Props {
  extractedItems: ReceiptItem[];
  householdId: string | null;
  currency: string;
  onConfirm: (splits: SplitState[]) => void;
  onCancel: () => void;
}

export const ReceiptSplitter: React.FC<Props> = ({ extractedItems, householdId, currency, onConfirm, onCancel }) => {
  const [splits, setSplits] = useState<SplitState[]>(
    extractedItems.map(item => ({ itemId: item.id, isSplit: false }))
  );

  const toggleSplit = (id: string) => {
    setSplits(prev => prev.map(s => s.itemId === id ? { ...s, isSplit: !s.isSplit } : s));
  };

  const totalSplitCount = splits.filter(s => s.isSplit).length;

  return (
    <div className="bg-bg-card rounded-[32px] border border-border-dark overflow-hidden shadow-2xl flex flex-col h-full max-h-[80vh]">
      <div className="p-4 border-b border-white/5 bg-white/[0.02]">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Users className="text-accent-green" size={16} />
          Receipt Review
        </h3>
        <p className="text-[9px] font-bold text-text-muted uppercase tracking-[0.15em] mt-0.5">
          {extractedItems.length} items extracted
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
        {extractedItems.map((item, idx) => {
          const isSplit = splits.find(s => s.itemId === item.id)?.isSplit;
          
          return (
            <motion.div 
              key={item.id || `item-${idx}`}
              initial={false}
              className={cn(
                "p-2 px-3 rounded-xl border transition-all flex items-center justify-between gap-3",
                isSplit ? "bg-accent-soft/20 border-accent-green/20" : "bg-bg-deep border-white/5"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="font-black text-xs text-white truncate uppercase tracking-tighter">{item.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-bold text-text-muted/60 uppercase">Qty: {item.quantity}</span>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <span className="text-[10px] font-mono font-bold text-accent-green">{formatCurrency(item.totalPrice, currency)}</span>
                  {item.discount && item.discount > 0 && (
                    <span className="text-[9px] font-black text-orange-400 bg-orange-400/10 px-1 rounded truncate">
                      -{formatCurrency(item.discount, currency)}
                    </span>
                  )}
                </div>
              </div>

              <button 
                onClick={() => householdId && toggleSplit(item.id)}
                disabled={!householdId}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl border transition-all shrink-0",
                  !householdId 
                    ? "opacity-10 cursor-not-allowed border-white/10" 
                    : isSplit 
                      ? "bg-accent-green text-black border-accent-green shadow-lg shadow-accent-green/20" 
                      : "bg-white/5 text-text-muted border-white/10 hover:border-white/20"
                )}
              >
                {isSplit ? <Users size={16} strokeWidth={2.5} /> : <User size={16} strokeWidth={2.5} />}
              </button>
            </motion.div>
          );
        })}
      </div>

      {!householdId && (
        <div className="px-4 py-2 bg-red-500/5 border-t border-red-500/10 flex gap-2 items-center">
          <AlertCircle size={12} className="text-red-500 shrink-0" />
          <p className="text-[8px] font-black text-red-500/80 uppercase tracking-widest">
            Household required for splitting
          </p>
        </div>
      )}

      <div className="p-4 bg-white/[0.02] border-t border-white/5 space-y-3">
        <div className="flex justify-between items-center px-1">
          <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Actions</span>
          <span className="text-[9px] font-black text-white px-2 py-0.5 bg-white/10 rounded-full">
            {totalSplitCount} SHARED
          </span>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 bg-white/5 text-text-muted rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/10 active:scale-95 transition-all"
          >
            Abort
          </button>
          <button 
            onClick={() => onConfirm(splits)}
            className="flex-[2.5] py-3 bg-accent-green text-black rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-accent-green/20 hover:bg-emerald-400 active:scale-95 transition-all"
          >
            Commit to Ledger
          </button>
        </div>
      </div>
    </div>
  );
};
