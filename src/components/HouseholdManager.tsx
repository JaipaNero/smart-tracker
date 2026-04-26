import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  UserPlus, 
  Hash, 
  Copy, 
  Check, 
  Trash2,
  ChevronRight,
  Shield,
  Loader2
} from 'lucide-react';
import { 
  db, 
  collection, 
  addDoc, 
  updateDoc, 
  setDoc,
  doc, 
  onSnapshot, 
  query, 
  where, 
  User,
  arrayUnion,
  arrayRemove,
  getDocs,
  getDoc
} from '../lib/firebase';
import { Household, DebtRecord } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { DollarSign, Wallet, ArrowUpRight, ArrowDownLeft, History } from 'lucide-react';

interface HouseholdManagerProps {
  user: User;
  onSelectHousehold: (id: string | null) => void;
  activeHouseholdId: string | null;
}

export function HouseholdManager({ user, onSelectHousehold, activeHouseholdId }: HouseholdManagerProps) {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Collab Data
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [isSettling, setIsSettling] = useState<string | null>(null);

  useEffect(() => {
    if (!activeHouseholdId) return;

    // Fetch Debts for active household
    const q = query(
      collection(db, 'settlements'),
      where('participantUids', 'array-contains', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() } as DebtRecord)));
    });

    return unsub;
  }, [activeHouseholdId]);

  useEffect(() => {
    // Resolve names of people in households
    const resolveNames = async () => {
      const uids = new Set<string>();
      households.forEach(h => h.members.forEach(m => uids.add(m)));
      debts.forEach(d => { uids.add(d.owedTo); uids.add(d.owedBy); });

      const newNames = { ...memberNames };
      let changed = false;

      for (const uid of Array.from(uids)) {
        if (!newNames[uid]) {
          const uSnap = await getDoc(doc(db, 'users', uid));
          const uData = uSnap.data();
          newNames[uid] = uData?.displayName || 'Unknown Roomie';
          changed = true;
        }
      }

      if (changed) setMemberNames(newNames);
    };

    if (households.length > 0 || debts.length > 0) resolveNames();
  }, [households, debts]);

  useEffect(() => {
    const q = query(
      collection(db, 'households'),
      where('members', 'array-contains', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      setHouseholds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Household)));
      setLoading(true);
      setLoading(false);
    }, (err) => {
      console.error('Household sync error:', err);
      setLoading(false);
    });

    return unsub;
  }, [user.uid]);

  const createHousehold = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const data = {
        name: newName.trim(),
        members: [user.uid],
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'households'), data);
      onSelectHousehold(docRef.id);
      setNewName('');
    } catch (err) {
      console.error('Failed to create household:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const joinHousehold = async () => {
    const id = joinId.trim();
    if (!id) return;
    setIsJoining(true);
    try {
      await updateDoc(doc(db, 'households', id), {
        members: arrayUnion(user.uid)
      });
      onSelectHousehold(id);
      setJoinId('');
    } catch (err) {
      console.error('Failed to join household:', err);
      alert('Could not join household. Check the ID and your permissions.');
    } finally {
      setIsJoining(false);
    }
  };

  const leaveHousehold = async (id: string) => {
    if (!confirm('Are you sure you want to leave this household?')) return;
    try {
      await updateDoc(doc(db, 'households', id), {
        members: arrayRemove(user.uid)
      });
      if (activeHouseholdId === id) onSelectHousehold(null);
    } catch (err) {
      console.error('Failed to leave household:', err);
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeHousehold = households.find(h => h.id === activeHouseholdId);

  const balances = useMemo(() => {
    const res: Record<string, number> = {}; // uid -> amount (positive means they owe you, negative means you owe them)
    if (!activeHousehold) return res;

    activeHousehold.members.forEach(uid => {
      if (uid === user.uid) return;
      res[uid] = 0;
    });

    debts.filter(d => !d.resolved).forEach(d => {
      if (d.owedTo === user.uid) {
        res[d.owedBy] = (res[d.owedBy] || 0) + d.amount;
      } else if (d.owedBy === user.uid) {
        res[d.owedTo] = (res[d.owedTo] || 0) - d.amount;
      }
    });

    return res;
  }, [debts, activeHousehold, user.uid]);

  const resolveDebt = async (debtId: string) => {
    setIsSettling(debtId);
    try {
      await setDoc(doc(db, 'settlements', debtId), { resolved: true }, { merge: true });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSettling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-text-muted">
        <Loader2 className="animate-spin" size={32} />
        <span className="text-xs font-black uppercase tracking-widest">Finding Households...</span>
      </div>
    );
  }

  return (
    <div className="space-y-10 p-4 pb-20 max-w-2xl mx-auto">
      <header className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-accent-green/10 rounded-3xl border border-accent-green/20">
            <Users className="text-accent-green" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white">Households</h1>
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Collaborative Management</p>
          </div>
        </div>
      </header>

      {/* Main Actions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-bg-card p-8 rounded-2xl border border-border-dark space-y-6 hover:border-accent-green/30 transition-all group">
          <div className="flex items-center gap-3">
            <Plus className="text-accent-green group-hover:scale-110 transition-transform" size={20} />
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">New Space</h3>
          </div>
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="e.g. Winterfell Villa"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-black focus:outline-none focus:border-accent-green transition-all"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button 
              onClick={createHousehold}
              disabled={isCreating || !newName.trim()}
              className="w-full bg-accent-green text-black rounded-2xl py-4 font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Household'}
            </button>
          </div>
        </div>

        <div className="bg-bg-card p-8 rounded-2xl border border-border-dark space-y-6 hover:border-blue-500/30 transition-all group">
          <div className="flex items-center gap-3">
            <UserPlus className="text-blue-500 group-hover:scale-110 transition-transform" size={20} />
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Join Space</h3>
          </div>
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Household ID"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-black focus:outline-none focus:border-blue-500 transition-all"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
            />
            <button 
              onClick={joinHousehold}
              disabled={isJoining || !joinId.trim()}
              className="w-full bg-blue-500 text-white rounded-2xl py-4 font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
            >
              {isJoining ? 'Joining...' : 'Join Household'}
            </button>
          </div>
        </div>
      </section>

      {/* Shared Ledger / Balances */}
      {activeHouseholdId && (
        <section className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Shared Ledger</h3>
            <div className="text-[10px] font-black uppercase tracking-widest text-accent-green bg-accent-green/10 px-3 py-1 rounded-full border border-accent-green/20">
              Live Balance
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {Object.entries(balances).map(([uid, amount]) => {
              const balAmount = amount as number;
              return (
                <div 
                  key={uid}
                  className="bg-bg-card p-6 rounded-2xl border border-border-dark flex items-center justify-between group hover:border-white/10 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl bg-white/5",
                      balAmount > 0 ? "text-emerald-400 bg-emerald-500/10" : balAmount < 0 ? "text-red-400 bg-red-500/10" : "text-text-muted"
                    )}>
                      {memberNames[uid]?.[0] || '?'}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{memberNames[uid]}</h4>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                        {balAmount > 0 ? 'Owes you' : balAmount < 0 ? 'You owe' : 'All settled'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={cn(
                      "text-lg font-black font-mono",
                      balAmount > 0 ? "text-emerald-400" : balAmount < 0 ? "text-red-400" : "text-text-muted/40"
                    )}>
                      {balAmount === 0 ? '--' : formatCurrency(Math.abs(balAmount), 'EUR')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending Settlements */}
          <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-8 space-y-6">
            <div className="flex items-center gap-3 text-text-muted">
              <History size={16} />
              <h3 className="text-xs font-black uppercase tracking-widest">Pending Settlements</h3>
            </div>

            <div className="space-y-4">
              {debts.filter(d => !d.resolved).length === 0 ? (
                <p className="text-center py-6 text-[10px] font-bold uppercase tracking-widest text-text-muted opacity-30">No pending payments</p>
              ) : (
                debts.filter(d => !d.resolved).map(debt => {
                   const isOwedToMe = debt.owedTo === user.uid;
                   const partyName = memberNames[isOwedToMe ? debt.owedBy : debt.owedTo];
                   
                   return (
                     <div key={debt.id} className="flex items-center justify-between bg-bg-deep p-4 rounded-2xl border border-white/5 group">
                       <div className="flex items-center gap-4">
                         <div className={cn(
                           "p-2 rounded-xl bg-white/5",
                           isOwedToMe ? "text-emerald-400" : "text-red-400"
                         )}>
                           {isOwedToMe ? <ArrowUpRight size={16}/> : <ArrowDownLeft size={16}/>}
                         </div>
                         <div>
                           <p className="text-[11px] font-black text-white">{partyName}</p>
                           <p className="text-[9px] font-medium text-text-muted truncate max-w-[150px]">{debt.description || 'Split Expense'}</p>
                         </div>
                       </div>
                       
                       <div className="flex items-center gap-4">
                         <span className="text-xs font-black font-mono text-white">{formatCurrency(debt.amount, 'EUR')}</span>
                         <button 
                           onClick={() => resolveDebt(debt.id)}
                           disabled={isSettling === debt.id}
                           className="text-[9px] font-black uppercase tracking-widest text-accent-green hover:underline decoration-accent-green/30 disabled:opacity-50"
                         >
                           {isSettling === debt.id ? '...' : 'Mark Paid'}
                         </button>
                       </div>
                     </div>
                   );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {/* Your Households */}
      <section className="space-y-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted px-4">Your Active Spaces</h3>
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {households.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-bg-card p-10 rounded-2xl border border-dashed border-border-dark flex flex-col items-center justify-center gap-4 text-text-muted"
              >
                <div className="p-4 bg-white/5 rounded-full">
                  <Shield size={24} className="opacity-20" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-50">No shared spaces found</p>
              </motion.div>
            ) : (
              households.map(h => (
                <motion.div
                  key={h.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "group relative overflow-hidden bg-bg-card p-6 rounded-2xl border transition-all cursor-pointer",
                    activeHouseholdId === h.id ? "border-accent-green shadow-xl shadow-accent-green/10" : "border-border-dark hover:border-white/20"
                  )}
                  onClick={() => onSelectHousehold(h.id)}
                >
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex items-center gap-5">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                        activeHouseholdId === h.id ? "bg-accent-green text-black rotate-3 shadow-lg shadow-accent-green/20" : "bg-white/5 text-text-muted"
                      )}>
                        <Users size={24} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-white">{h.name}</h4>
                          {activeHouseholdId === h.id && <span className="w-1.5 h-1.5 bg-accent-green rounded-full animate-pulse" />}
                        </div>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                          {h.members.length} Members • Created {new Date(h.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <button 
                        onClick={() => copyId(h.id)}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-text-muted hover:text-white transition-all"
                        title="Copy Household ID"
                      >
                        {copiedId === h.id ? <Check size={18} className="text-accent-green" /> : <Hash size={18} />}
                      </button>
                      <button 
                        onClick={() => leaveHousehold(h.id)}
                        className="p-3 bg-red-500/10 hover:bg-red-500/20 rounded-2xl text-red-500 transition-all"
                        title="Leave Household"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Decorative background number of members */}
                  <div className="absolute top-0 right-0 p-8 transform translate-x-1/4 -translate-y-1/4 opacity-[0.02] pointer-events-none group-hover:scale-110 transition-transform">
                    <Users size={120} />
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Info Box */}
      <section className="bg-blue-500/5 p-8 rounded-2xl border border-blue-500/10 flex gap-6 items-start">
        <div className="p-3 bg-blue-500/20 rounded-2xl text-blue-500 shrink-0">
          <Shield size={20} />
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-black uppercase tracking-widest text-blue-500">How Sharing Works</h4>
          <p className="text-xs font-bold text-text-muted leading-relaxed">
            When you select a household as your active space, your pantry items and expenses can be optionally split with members of that space. Share your unique <span className="underline decoration-blue-500/30 text-white font-black">Household ID</span> with others to invite them.
          </p>
        </div>
      </section>
    </div>
  );
}
