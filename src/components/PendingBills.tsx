import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, doc, writeBatch, User, query, orderBy } from '../lib/firebase';
import { Expense } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Clock, CreditCard, ReceiptText, Sparkles } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { format, parseISO } from 'date-fns';

interface PendingBillsProps {
  user: User;
  baseCurrency: string;
}

export const PendingBills: React.FC<PendingBillsProps> = ({ user, baseCurrency }) => {
  const [pendingBills, setPendingBills] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Fetch real-time data from users/{uid}/pendingBills
    const q = query(
      collection(db, `users/${user.uid}/pendingBills`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bills = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Expense));
      setPendingBills(bills);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Pending bills listener error:", err);
      setError("Unable to reach the ledger. Retrying...");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleApprove = async (bill: Expense) => {
    try {
      const batch = writeBatch(db);
      
      // Target document in expenses collection
      const expenseRef = doc(db, `users/${user.uid}/expenses`, bill.id);
      // Source document in pendingBills collection
      const pendingRef = doc(db, `users/${user.uid}/pendingBills`, bill.id);

      // Move data exactly as-is
      const { id, ...data } = bill;
      batch.set(expenseRef, {
        ...data,
        approvedAt: new Date().toISOString()
      });

      // Delete from pending
      batch.delete(pendingRef);

      await batch.commit();
    } catch (err) {
      console.error("Failed to approve bill:", err);
    }
  };

  const handleReject = async (billId: string) => {
    try {
      await writeBatch(db).delete(doc(db, `users/${user.uid}/pendingBills`, billId)).commit();
    } catch (err) {
      console.error("Failed to reject bill:", err);
    }
  };

  if (loading && pendingBills.length === 0) return null;
  if (pendingBills.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-orange-400" />
          <h3 className="text-xs font-black uppercase tracking-[0.15em] text-text-muted">
            Pending Approvals
          </h3>
          <span className="bg-orange-500/20 text-orange-400 text-[9px] font-black px-1.5 py-0.5 rounded-md">
            {pendingBills.length}
          </span>
        </div>
        {error && (
          <span className="text-[9px] font-bold text-red-400 animate-pulse uppercase tracking-widest">
            {error}
          </span>
        )}
      </div>

      <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar -mx-2 px-2 snap-x">
        <AnimatePresence mode="popLayout">
          {pendingBills.map((bill) => (
            <motion.div
              key={bill.id}
              layout
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="flex-shrink-0 w-[280px] snap-center bg-bg-card rounded-2xl border border-border-dark shadow-2xl relative overflow-hidden group"
            >
              {/* Decorative background element */}
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Sparkles size={48} className="text-accent-green" />
              </div>

              <div className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-accent-green uppercase tracking-widest flex items-center gap-1.5">
                      <ReceiptText size={10} />
                      {bill.category}
                    </p>
                    <h4 className="font-black text-white text-sm truncate uppercase tracking-tight">
                      {bill.description}
                    </h4>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-lg text-white leading-none">
                      {formatCurrency(bill.amount, bill.currency || baseCurrency)}
                    </p>
                    <p className="text-[8px] font-bold text-text-muted uppercase mt-1">
                      {bill.date ? format(parseISO(bill.date), 'MMM dd') : 'Recent'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleApprove(bill)}
                    className="flex-1 bg-accent-green/10 hover:bg-accent-green text-accent-green hover:text-black py-2.5 rounded-xl border border-accent-green/20 hover:border-accent-green transition-all flex items-center justify-center gap-2 group/btn"
                  >
                    <Check size={14} className="group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Approve</span>
                  </button>
                  <button
                    onClick={() => handleReject(bill.id)}
                    className="aspect-square bg-white/5 hover:bg-red-500/10 text-text-muted hover:text-red-500 p-2.5 rounded-xl border border-white/5 hover:border-red-500/20 transition-all flex items-center justify-center group/btn"
                    title="Reject"
                  >
                    <X size={14} className="group-hover/btn:rotate-90 transition-transform" />
                  </button>
                </div>
                
                <p className="text-[8px] font-bold text-text-muted/40 uppercase tracking-[0.2em] text-center italic">
                   Approve to add to ledger
                </p>
              </div>

              {/* Progress bar simulation for "freshness" */}
              <div className="h-1 w-full bg-white/5">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-accent-green"
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
