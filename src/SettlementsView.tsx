import React, { useMemo } from 'react';
import { DebtRecord } from './types';
import { User, Users, Check, ArrowRight } from 'lucide-react';
import { cn, formatCurrency } from './lib/utils';
import { motion } from 'motion/react';

interface Props {
  debts: DebtRecord[];
  currentUserId: string;
  currency: string;
}

export const SettlementsView: React.FC<Props> = ({ debts, currentUserId, currency }) => {
  const owedByMe = useMemo(() => debts.filter(d => d.owedBy === currentUserId && !d.resolved), [debts, currentUserId]);
  const owedToMe = useMemo(() => debts.filter(d => d.owedTo === currentUserId && !d.resolved), [debts, currentUserId]);

  const totalOwedByMe = owedByMe.reduce((sum, d) => sum + d.amount, 0);
  const totalOwedToMe = owedToMe.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Settlements</h2>
        <p className="text-xs text-text-muted">Track what you owe and what others owe you.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-3xl">
          <p className="text-[10px] font-black text-red-500 uppercase">You Owe</p>
          <p className="text-2xl font-black text-white mt-1">{formatCurrency(totalOwedByMe, currency)}</p>
        </div>
        <div className="bg-accent-green/10 border border-accent-green/20 p-4 rounded-3xl">
          <p className="text-[10px] font-black text-accent-green uppercase">You Are Owed</p>
          <p className="text-2xl font-black text-white mt-1">{formatCurrency(totalOwedToMe, currency)}</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-black text-white">Pending Debts</h3>
        {debts.filter(d => !d.resolved).map(debt => (
          <motion.div 
            key={debt.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-bg-card border border-white/5 p-4 rounded-2xl flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className={cn("p-3 rounded-full", debt.owedBy === currentUserId ? "bg-red-500/10 text-red-500" : "bg-accent-green/10 text-accent-green")}>
                {debt.owedBy === currentUserId ? <ArrowRight size={20} /> : <User size={20} />}
              </div>
              <div>
                <p className="font-bold text-sm text-white">{debt.description}</p>
                <p className="text-[10px] text-text-muted">
                    {debt.owedBy === currentUserId ? 'You owe this' : 'Someone owes you this'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-black text-white text-lg">{formatCurrency(debt.amount, currency)}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
