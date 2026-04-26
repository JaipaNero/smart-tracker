import React, { useState } from 'react';
import { 
  Users, 
  Wallet, 
  LayoutGrid, 
  List,
  Smartphone,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { User } from '../lib/firebase';
import { HouseholdManager } from '../components/HouseholdManager';
import { SettlementsView } from '../SettlementsView';
import { DebtRecord } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SharedSpaceViewProps {
  user: User;
  activeHouseholdId: string | null;
  onSelectHousehold: (id: string | null) => void;
  debts: DebtRecord[];
  baseCurrency: string;
}

export default function SharedSpaceView({ 
  user, 
  activeHouseholdId, 
  onSelectHousehold, 
  debts, 
  baseCurrency 
}: SharedSpaceViewProps) {
  const [viewMode, setViewMode] = useState<'split' | 'manager' | 'settlements'>(window.innerWidth > 1024 ? 'split' : 'manager');

  return (
    <div className="space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-blue-500">
            <Users size={24} />
            <h1 className="text-2xl font-black tracking-tighter text-white">Shared Space</h1>
          </div>
          <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Household Collaboration & Ledger</p>
        </div>

        {/* Mobile View Toggles */}
        <div className="flex bg-white/5 p-1 rounded-2xl md:hidden">
          <button 
            onClick={() => setViewMode('manager')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all",
              viewMode === 'manager' ? "bg-white/10 text-white" : "text-text-muted"
            )}
          >
            <Users size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">People</span>
          </button>
          <button 
            onClick={() => setViewMode('settlements')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all",
              viewMode === 'settlements' ? "bg-white/10 text-white" : "text-text-muted"
            )}
          >
            <Wallet size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Money</span>
          </button>
        </div>
      </header>

      <div className={cn(
        "grid gap-8",
        viewMode === 'split' ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
      )}>
        {/* Household Manager Section */}
        <AnimatePresence mode="wait">
          {(viewMode === 'split' || viewMode === 'manager') && (
            <motion.section 
              key="manager"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-bg-card rounded-[32px] border border-border-dark overflow-hidden"
            >
              <HouseholdManager 
                user={user} 
                activeHouseholdId={activeHouseholdId} 
                onSelectHousehold={onSelectHousehold} 
              />
            </motion.section>
          )}

          {/* Settlements Section */}
          {(viewMode === 'split' || viewMode === 'settlements') && (
            <motion.section 
              key="settlements"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-bg-card rounded-[32px] border border-border-dark overflow-hidden"
            >
              <SettlementsView 
                debts={debts} 
                currentUserId={user.uid} 
                currency={baseCurrency} 
              />
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {!activeHouseholdId && (
        <section className="bg-amber-500/10 p-8 rounded-[32px] border border-amber-500/20 flex gap-6 items-start max-w-2xl mx-auto">
          <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-500 shrink-0">
            <Smartphone size={20} />
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-widest text-amber-500">No Active Space</h4>
            <p className="text-xs font-bold text-text-muted leading-relaxed">
              Select or create a household to see shared balances and settlements. All your private data remains separate until you choose to split it.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
