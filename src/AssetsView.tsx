import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, doc, updateDoc, deleteDoc, User } from './lib/firebase';
import { Asset } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Calendar, Store, Trash2, ShieldAlert, BadgeCheck } from 'lucide-react';
import { format, parseISO, addMonths, isPast, differenceInDays } from 'date-fns';
import { cn, formatCurrency } from './lib/utils';

export default function AssetsView({ user }: { user: User }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `users/${user.uid}/assets`), snap => {
      setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Asset)));
      setLoading(false);
    }, error => {
      console.error('Assets snapshot error:', error);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const updateWarranty = async (id: string, months: number) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;
    
    const expiryDate = addMonths(parseISO(asset.purchaseDate), months).toISOString();
    try {
      await updateDoc(doc(db, `users/${user.uid}/assets/${id}`), {
        warrantyMonths: months,
        warrantyExpiryDate: expiryDate
      });
    } catch (e) {
      console.error('Failed to update warranty', e);
    }
  };

  const deleteAsset = async (id: string) => {
    if (confirm('Delete this asset and its warranty tracking?')) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/assets/${id}`));
      } catch (e) {
        console.error('Delete failed', e);
      }
    }
  };

  if (loading) return (
    <div className="p-20 flex flex-col items-center justify-center gap-4 text-text-muted">
      <motion.div 
        animate={{ rotate: 360 }} 
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
      >
        <Shield size={32} />
      </motion.div>
      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Inventorying Assets...</span>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-white">Device & Warranty Vault</h1>
        <p className="text-xs text-text-muted font-bold uppercase tracking-widest">Durable goods tracking</p>
      </header>

      <div className="grid gap-4">
        {assets.length > 0 ? assets.map(asset => {
          const expiry = asset.warrantyExpiryDate ? parseISO(asset.warrantyExpiryDate) : null;
          const isExpired = expiry ? isPast(expiry) : false;
          const daysLeft = expiry ? differenceInDays(expiry, new Date()) : null;

          return (
            <motion.div 
              key={asset.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-bg-card p-6 rounded-2xl border border-border-dark relative overflow-hidden group shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                  <h3 className="font-black text-white text-lg leading-tight group-hover:text-accent-green transition-colors">{asset.name}</h3>
                  <div className="flex items-center gap-2 mt-1.5 opacity-60">
                    <Store size={12} className="text-text-muted" />
                    <span className="text-[9px] font-black text-text-muted uppercase tracking-[0.15em]">{asset.merchant}</span>
                  </div>
                </div>
                <button 
                  onClick={() => deleteAsset(asset.id)}
                  className="p-2 text-white/5 hover:text-red-500 transition-all rounded-xl hover:bg-red-500/10"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                  <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1.5 opacity-50">Purchase Date</p>
                  <div className="flex items-center gap-2 text-white font-bold text-xs">
                    <Calendar size={12} className="text-accent-green" />
                    {format(parseISO(asset.purchaseDate), 'MMM d, yyyy')}
                  </div>
                </div>
                <div className={cn(
                  "p-4 rounded-3xl border transition-all",
                  isExpired ? "bg-red-500/10 border-red-500/20" : "bg-black/40 border-white/5"
                )}>
                  <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1.5 opacity-50">Warranty Status</p>
                  <div className="flex items-center gap-2 font-bold text-xs">
                    {isExpired ? <ShieldAlert size={12} className="text-red-500" /> : <BadgeCheck size={12} className="text-accent-green" />}
                    <span className={cn(isExpired ? "text-red-500" : "text-white")}>
                      {isExpired ? 'Expired' : expiry ? `${daysLeft} days left` : 'Unassigned'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                 <div className="text-2xl font-black text-white tracking-tighter">
                   {formatCurrency(asset.price, 'USD')} 
                 </div>
                 <div className="flex flex-col gap-2">
                    <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] text-right">Update Warranty Period</p>
                    <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-2xl border border-white/5">
                      {[12, 24, 36].map(m => (
                          <button 
                            key={m}
                            onClick={() => updateWarranty(asset.id, m)}
                            className={cn(
                              "px-3 py-2 text-[10px] font-black rounded-xl transition-all",
                              asset.warrantyMonths === m ? "bg-accent-green text-black shadow-lg" : "text-white/30 hover:text-white/60"
                            )}
                          >
                            {m/12}Y
                          </button>
                      ))}
                    </div>
                 </div>
              </div>

              {isExpired && (
                <div className="absolute top-0 right-12 bg-red-500 text-black text-[9px] font-black px-4 py-1.5 rounded-b-2xl uppercase tracking-[0.2em] shadow-lg">
                  COVERAGE EXPIRED
                </div>
              )}
            </motion.div>
          );
        }) : (
          <div className="p-16 text-center border-2 border-dashed border-white/5 rounded-[48px] flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-text-muted">
               <Shield size={32} />
            </div>
            <p className="text-text-muted text-[10px] font-black uppercase tracking-[0.2em] leading-loose max-w-[240px]">
              No durable assets detected.<br/>
              <span className="opacity-40">Scan receipts for appliances, electronics or tools to automatically track warranties here.</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
