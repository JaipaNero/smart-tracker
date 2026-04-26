import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Calendar, 
  PieChart, 
  Download, 
  MoreHorizontal,
  Music,
  Disc,
  DollarSign,
  Trash2,
  Pencil
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from './lib/firebase';
import { User } from 'firebase/auth';
import { BusinessTransaction, BUSINESS_CATEGORIES, CURRENCIES } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

export default function BusinessView({ user, baseCurrency }: { user: User, baseCurrency: string }) {
  const [transactions, setTransactions] = useState<BusinessTransaction[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTx, setNewTx] = useState<Partial<BusinessTransaction>>({
    type: 'income',
    category: 'Gig Income',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    description: '',
    currency: baseCurrency,
    vatRate: 21
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    // Main transactions
    const q = query(
      collection(db, 'businessTransactions'),
      where('userId', '==', user.uid)
    );

    const unsubTxs = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as BusinessTransaction[];
      setTransactions(docs.sort((a, b) => b.date.localeCompare(a.date)));
    });

    // Pending approvals from GigiBot
    const qPending = query(
      collection(db, 'pendingTransactions'),
      where('uid', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubPending = onSnapshot(qPending, (snapshot) => {
      setPendingApprovals(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubTxs();
      unsubPending();
    };
  }, [user.uid]);

  const handleApprove = async (tx: any) => {
    const { id, ...data } = tx;
    const vatRate = 21; // Default for DJ expenses
    const vatAmount = calculateVat(data.amount, vatRate);
    
    await addDoc(collection(db, 'businessTransactions'), {
      ...data,
      userId: user.uid,
      type: 'expense',
      status: 'approved',
      vatRate,
      vatAmount,
      updatedAt: new Date().toISOString()
    });
    await deleteDoc(doc(db, 'pendingTransactions', id));
  };

  const handleReject = async (id: string) => {
    await deleteDoc(doc(db, 'pendingTransactions', id));
  };

  const calculateVat = (total: number, rate: number) => {
    if (rate === 0) return 0;
    // Assume inclusive
    return total - (total / (1 + rate / 100));
  };

  const handleAddTx = async () => {
    if (!newTx.amount || !newTx.description) return;

    const vatAmount = calculateVat(newTx.amount, newTx.vatRate || 0);

    if (editingId) {
      await updateDoc(doc(db, 'businessTransactions', editingId), {
        ...newTx,
        vatAmount,
        updatedAt: new Date().toISOString()
      });
    } else {
      await addDoc(collection(db, 'businessTransactions'), {
        ...newTx,
        vatAmount,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
    }
    
    setIsAdding(false);
    setEditingId(null);
    setNewTx({
      type: 'income',
      category: 'Gig Income',
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      description: '',
      currency: baseCurrency,
      vatRate: 21
    });
  };

  const getQuarterlySummary = () => {
    return [0, 1, 2, 3].map(qIdx => {
      const qTxs = transactions.filter(t => {
        const d = new Date(t.date);
        return Math.floor(d.getMonth() / 3) === qIdx && d.getFullYear() === selectedYear;
      });
      const income = qTxs.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
      const expenses = qTxs.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
      const vatToPay = qTxs.filter(t => t.type === 'income').reduce((acc, t) => acc + (t.vatAmount || 0), 0);
      const vatToReclaim = qTxs.filter(t => t.type === 'expense').reduce((acc, t) => acc + (t.vatAmount || 0), 0);

      return { 
        q: qIdx + 1, 
        income, 
        expenses, 
        profit: income - expenses,
        vatToPay,
        vatToReclaim,
        vatNet: vatToPay - vatToReclaim
      };
    });
  };

  const summary = getQuarterlySummary();
  const currentQ = summary[selectedQuarter];

  const getCategoryAllocation = () => {
    const expenses = transactions.filter(t => {
      const d = new Date(t.date);
      return t.type === 'expense' && Math.floor(d.getMonth() / 3) === selectedQuarter && d.getFullYear() === selectedYear;
    });
    const total = expenses.reduce((acc, t) => acc + t.amount, 0);
    if (total === 0) return [];

    const cats: Record<string, number> = {};
    expenses.forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + t.amount;
    });

    return Object.entries(cats)
      .map(([name, value]) => ({ 
        name, 
        value, 
        percent: (value / total) * 100 
      }))
      .sort((a, b) => b.value - a.value);
  };

  const allocation = getCategoryAllocation();
  const catColors: Record<string, string> = {
    'Gig Income': 'bg-accent-green',
    'Music Sales': 'bg-blue-500',
    'Gear & Equipment': 'bg-blue-500',
    'Software & Subs': 'bg-purple-500',
    'Marketing': 'bg-pink-500',
    'Travel (Prof.)': 'bg-orange-500',
    'Other': 'bg-gray-500'
  };

  const formatValue = (val: number) => {
    const symbol = CURRENCIES.find(c => c.code === baseCurrency)?.symbol || '$';
    return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const [showAll, setShowAll] = useState(false);
  const [isGmailConnected, setIsGmailConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, `users/${user.uid}/connections`, 'gmail_dj'), (doc) => {
      setIsGmailConnected(doc.exists());
    });
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-6 pb-24">
      {/* TEST BANNER - IF YOU SEE THIS, WE ARE SYNCED */}
      <div className="bg-red-600 text-white text-center py-4 font-black text-xl uppercase tracking-widest animate-pulse">
        LATEST VERSION DEPLOYED - 22:16
      </div>
      {/* Header Area */}
      <div className="flex justify-between items-center px-2">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            Professional <Briefcase className="text-accent-green" size={24} />
          </h1>
          <p className="text-xs text-text-muted mt-1 uppercase font-black tracking-widest">DJ Income & Tax Tracking</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-accent-green text-bg-deep p-3 rounded-2xl shadow-lg shadow-accent-green/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={24} strokeWidth={3} />
        </button>
      </div>

      {/* Connection Banner & Approval Queue */}
      <div className="px-2 space-y-4">
        <div className={cn(
          "w-full bg-white/5 border p-4 rounded-2xl flex items-center justify-between transition-all",
          isGmailConnected ? "border-accent-green/20" : "border-white/10"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              isGmailConnected ? "bg-accent-green/10 text-accent-green" : "bg-red-500/10 text-red-500"
            )}>
              <Music size={20} />
            </div>
            <div>
              <div className="text-xs font-black text-white uppercase tracking-tight">Autonomous Accountant</div>
              <div className="text-[10px] text-text-muted font-medium">
                {isGmailConnected ? 'GigiBot is scanning your DJ inbox' : 'Link your DJ Gmail to auto-sync invoices'}
              </div>
            </div>
          </div>
          {isGmailConnected ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-accent-green/10 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              <span className="text-[10px] font-black text-accent-green uppercase tracking-widest">Active</span>
            </div>
          ) : (
            <a 
              href="https://connectgmail-t7zuw6sfpa-uc.a.run.app"
              className="text-[10px] font-black text-accent-green uppercase tracking-widest bg-accent-green/10 px-3 py-1 rounded-full hover:bg-accent-green hover:text-bg-deep transition-all"
            >
              Connect
            </a>
          )}
        </div>

        {/* Approval Queue Card */}
        <AnimatePresence>
          {pendingApprovals.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-accent-green/10 border border-accent-green/20 rounded-2xl p-4 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Disc className="text-accent-green animate-spin-slow" size={16} />
                  <span className="text-[10px] font-black text-accent-green uppercase tracking-widest">Bot Found {pendingApprovals.length} Items</span>
                </div>
              </div>
              
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {pendingApprovals.map((tx) => (
                  <div key={tx.id} className="bg-bg-deep/40 rounded-xl p-3 border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 pr-4">
                        <div className="text-xs font-black text-white leading-tight mb-1 line-clamp-2">{tx.description}</div>
                        <div className="text-[10px] text-text-muted font-medium uppercase tracking-tight">{tx.date}</div>
                      </div>
                      <div className="text-xs font-black text-accent-green">
                        €{tx.amount.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={() => handleApprove(tx)}
                        className="flex-1 bg-accent-green text-bg-deep py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleReject(tx.id)}
                        className="px-4 bg-white/5 text-text-muted py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-red-400 transition-all"
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Period Selector */}
      <div className="px-2">
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
          {[0, 1, 2, 3].map((q) => (
            <button
              key={q}
              onClick={() => setSelectedQuarter(q)}
              className={cn(
                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                selectedQuarter === q 
                  ? "bg-accent-green text-bg-deep shadow-lg shadow-accent-green/20" 
                  : "text-text-muted hover:text-white"
              )}
            >
              Q{q + 1}
            </button>
          ))}
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-transparent text-[10px] font-black uppercase tracking-widest text-white px-4 focus:outline-none"
          >
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={y} className="bg-bg-deep">{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-bg-card p-5 rounded-2xl border border-border-dark space-y-2">
          <div className="flex items-center gap-2 text-accent-green">
            <TrendingUp size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Q{currentQ.q} Income</span>
          </div>
          <div className="text-2xl font-black text-white">{formatValue(currentQ.income)}</div>
          <div className="text-[10px] text-text-muted font-medium">Recorded payments</div>
        </div>

        <div className="bg-bg-card p-5 rounded-2xl border border-border-dark space-y-2">
          <div className="flex items-center gap-2 text-purple-500">
            <TrendingDown size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Q{currentQ.q} Deductions</span>
          </div>
          <div className="text-2xl font-black text-white">{formatValue(currentQ.expenses)}</div>
          <div className="text-[10px] text-text-muted font-medium">Business expenses</div>
        </div>
      </div>

      {/* Expense Allocation */}
      {allocation.length > 0 && (
        <div className="bg-bg-card p-6 rounded-2xl border border-border-dark space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-widest">Expense Allocation</h3>
            <span className="text-[10px] font-black text-white px-2 py-1 bg-white/5 rounded-lg border border-white/5">PROFESSIONAL</span>
          </div>

          <div className="h-3 w-full flex rounded-full overflow-hidden bg-white/5">
            {allocation.map((item, i) => (
              <div 
                key={item.name}
                style={{ width: `${item.percent}%` }}
                className={cn(
                  catColors[item.name] || 'bg-gray-500',
                  "h-full border-r border-black/20 last:border-0"
                )}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {allocation.map((item) => (
              <div key={item.name} className="flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", catColors[item.name] || 'bg-gray-500')} />
                  <span className="text-[10px] font-bold text-white/60 group-hover:text-white transition-colors">{item.name}</span>
                </div>
                <span className="text-[10px] font-black text-white/40">{Math.round(item.percent)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tax Estimate Card */}
      <div className="bg-bg-card p-6 rounded-2xl border border-border-dark shadow-sm">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
              <Calendar size={12} className="text-accent-green" />
              <span className="text-[10px] font-bold text-white uppercase tracking-tighter">VAT & Tax Forecast Q{currentQ.q}</span>
            </div>
            <div className="text-[10px] font-black text-accent-green uppercase tracking-widest bg-accent-green/10 px-3 py-1 rounded-full">
              Kwartale aangifte
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8 py-2">
            <div>
              <div className="text-[10px] text-text-muted font-black uppercase tracking-widest mb-1">VAT to Pay (Income)</div>
              <div className="text-2xl font-black text-white">{formatValue(currentQ.vatToPay)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-text-muted font-black uppercase tracking-widest mb-1">VAT Reclaim (Expenses)</div>
              <div className="text-2xl font-black text-accent-green">{formatValue(currentQ.vatToReclaim)}</div>
            </div>
          </div>

          <div className="flex justify-between items-end pt-4 border-t border-white/5">
            <div>
              <div className="text-[10px] text-text-muted font-black uppercase tracking-widest mb-1">VAT Settlement</div>
              <div className={cn("text-3xl font-black", currentQ.vatNet >= 0 ? "text-white" : "text-accent-green")}>
                {currentQ.vatNet > 0 ? "Pay " : "Back "}{formatValue(Math.abs(currentQ.vatNet))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-text-muted font-black uppercase tracking-widest mb-1">Est. Income Tax (21%)</div>
              <div className="text-lg font-black text-white/60">
                {formatValue(Math.max(0, currentQ.profit * 0.21))}
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-2">
            <button className="flex-1 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all border border-white/5 flex items-center justify-center gap-2">
              <Download size={14} /> Quarter Export
            </button>
            <button className="flex-1 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all border border-white/5 flex items-center justify-center gap-2">
              <PieChart size={14} /> Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Recent Activity</h2>
          <button 
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] font-black text-accent-green uppercase tracking-widest hover:opacity-70 transition-opacity"
          >
            {showAll ? 'Show Less' : 'View All'}
          </button>
        </div>

        <div className="space-y-3">
          {transactions.slice(0, showAll ? undefined : 20).map(tx => (
            <div 
              key={tx.id}
              className="bg-bg-card p-4 rounded-2xl border border-border-dark flex items-center justify-between group hover:border-white/10 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg",
                  tx.type === 'income' 
                    ? "bg-accent-green/10 text-accent-green shadow-accent-green/5" 
                    : "bg-purple-500/10 text-purple-500 shadow-purple-500/5"
                )}>
                  {tx.category === 'Gig Income' ? <Disc size={20} /> : tx.category === 'Bandcamp (Music)' ? <Music size={20} /> : <Briefcase size={20} />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white leading-tight">{tx.description}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-text-muted font-medium">{tx.category}</span>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span className="text-[10px] text-text-muted font-medium">{tx.vatRate}% VAT ({formatValue(tx.vatAmount || 0)})</span>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span className="text-[10px] text-text-muted font-medium">{new Date(tx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </div>
                <div className={cn(
                  "font-black text-sm tracking-tight",
                  tx.type === 'income' ? "text-accent-green" : "text-white"
                )}>
                  {tx.type === 'income' ? '+' : '-'}{formatValue(tx.amount)}
                </div>
                <div className="flex items-center gap-2 opacity-30 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => {
                      setNewTx({ ...tx });
                      setEditingId(tx.id);
                      setIsAdding(true);
                    }}
                    className="text-white/20 hover:text-accent-green transition-all p-1"
                  >
                    <Pencil size={14} />
                  </button>
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm('Delete this transaction?')) {
                        await deleteDoc(doc(db, 'businessTransactions', tx.id));
                      }
                    }}
                    className="text-white/20 hover:text-red-500 transition-all p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          {transactions.length === 0 && (
            <div className="py-20 text-center space-y-4 bg-white/[0.02] rounded-2xl border border-dashed border-white/10">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-text-muted">
                <Briefcase size={32} />
              </div>
              <p className="text-xs text-text-muted font-medium">No business transactions recorded yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="relative w-full max-w-sm bg-bg-card border border-border-dark rounded-2xl shadow-2xl p-6 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-white uppercase tracking-tighter">
                  {editingId ? 'Edit Transaction' : 'New Transaction'}
                </h3>
                <div className="flex p-0.5 bg-black/40 rounded-xl">
                  {(['income', 'expense'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setNewTx(prev => ({ ...prev, type }))}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                        newTx.type === type 
                          ? type === 'income' ? "bg-accent-green text-black" : "bg-purple-500 text-white" 
                          : "text-text-muted"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest ml-1">Amount (Incl. VAT)</label>
                  <input 
                    type="number"
                    value={newTx.amount}
                    onChange={(e) => setNewTx(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-black text-xl focus:outline-none focus:border-accent-green transition-all"
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest ml-1">VAT Rate</label>
                  <div className="flex gap-2">
                    {([21, 9, 0] as const).map(rate => (
                      <button
                        key={rate}
                        onClick={() => setNewTx(prev => ({ ...prev, vatRate: rate }))}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-[10px] font-black transition-all border",
                          newTx.vatRate === rate 
                            ? "bg-white/10 border-white/20 text-white" 
                            : "bg-white/5 border-transparent text-text-muted"
                        )}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest ml-1">Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    {BUSINESS_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setNewTx(prev => ({ ...prev, category: cat }))}
                        className={cn(
                          "px-3 py-3 rounded-xl text-[10px] font-bold border transition-all truncate",
                          newTx.category === cat 
                            ? "bg-white/10 border-white/20 text-white" 
                            : "bg-white/5 border-transparent text-text-muted hover:border-white/10"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest ml-1">Description</label>
                  <input 
                    type="text"
                    value={newTx.description}
                    onChange={(e) => setNewTx(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-medium text-sm focus:outline-none focus:border-accent-green transition-all"
                    placeholder="e.g. Gig at Paradiso"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest ml-1">Date</label>
                    <input 
                      type="date"
                      value={newTx.date}
                      onChange={(e) => setNewTx(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-xs focus:outline-none focus:border-accent-green transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="flex-1 bg-white/5 text-white/50 text-[10px] font-black uppercase tracking-widest py-4 rounded-2xl border border-white/5"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddTx}
                  className="flex-[2] bg-accent-green text-bg-deep text-[10px] font-black uppercase tracking-widest py-4 rounded-2xl shadow-lg shadow-accent-green/20"
                >
                  {editingId ? 'Update Transaction' : 'Save Transaction'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Debug Info (Temporary) */}
      <div className="mt-10 pb-20 text-center opacity-30">
        <p className="text-[8px] text-white font-mono">
          UID: {user.uid} | Connected: {isGmailConnected ? 'YES' : 'NO'} | Pending: {pendingApprovals.length}
        </p>
      </div>
    </div>
  );
}
