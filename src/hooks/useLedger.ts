import { useState, useEffect, useMemo } from 'react';
import { db, collection, doc, onSnapshot, query, where, or } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Expense, Budget, ItemPriceRecord, DebtRecord } from '../types';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';

export function useLedger(user: User | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [priceHistory, setPriceHistory] = useState<ItemPriceRecord[]>([]);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [spendingCap, setSpendingCap] = useState(3000);

  useEffect(() => {
    if (!user) {
      setExpenses([]);
      setBudgets([]);
      setPriceHistory([]);
      setDebts([]);
      return;
    }

    const uid = user.uid;

    const unsubUser = onSnapshot(doc(db, `users/${uid}`), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBaseCurrency(data.baseCurrency || 'EUR');
        setSpendingCap(data.spendingCap || 3000);
      }
    });

    const unsubExpenses = onSnapshot(collection(db, `users/${uid}/expenses`), (snap) => {
      const exps = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
      setExpenses(exps.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });

    const unsubBudgets = onSnapshot(collection(db, `users/${uid}/budgets`), (snap) => {
      setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Budget)));
    });

    const unsubHistory = onSnapshot(collection(db, `users/${uid}/priceHistory`), (snap) => {
      setPriceHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as ItemPriceRecord)));
    });

    const unsubDebts = onSnapshot(
      query(
        collection(db, 'settlements'), 
        or(
          where('owedTo', '==', uid),
          where('owedBy', '==', uid),
          where('participantUids', 'array-contains', uid)
        )
      ), 
      snap => {
        setDebts(snap.docs.map(d => ({id: d.id, ...d.data()} as DebtRecord)));
      }
    );

    return () => {
      unsubUser(); unsubExpenses(); unsubBudgets(); unsubHistory(); unsubDebts();
    };
  }, [user]);

  const hydratedExpenses = useMemo(() => {
    return expenses.map(exp => {
      if (exp.hasItems) {
        const parts = priceHistory.filter(h => h.expenseId === exp.id);
        return { 
          ...exp, 
          items: parts.map(p => ({
            id: p.id,
            name: p.itemName,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            totalPrice: p.totalPrice,
            discount: p.discount,
            nutritionTag: p.nutritionTag as any,
            type: p.type as any
          }))
        };
      }
      return exp;
    });
  }, [expenses, priceHistory]);

  const currentMonthExpenses = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return hydratedExpenses.filter(e => isWithinInterval(parseISO(e.date), { start, end }));
  }, [hydratedExpenses]);

  const totalSpentMonth = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const spendingByCategory = useMemo(() => {
    const data: Record<string, number> = {};
    currentMonthExpenses.forEach(e => {
      if (e.items && e.items.length > 0) {
        e.items.forEach(item => {
          let cat = e.category;
          if (item.type === 'food') cat = 'Food & Dining';
          else if (item.type === 'supply' || item.type === 'durable') cat = 'Living & Household';
          else if (item.type === 'service' && e.category === 'Food & Dining') cat = 'Other';
          data[cat] = (data[cat] || 0) + (item.totalPrice || 0);
        });
      } else {
        data[e.category] = (data[e.category] || 0) + (e.amount || 0);
      }
    });
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .filter(entry => entry.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [currentMonthExpenses]);

  return { 
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
  };
}
