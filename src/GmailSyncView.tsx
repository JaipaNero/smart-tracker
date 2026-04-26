import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Loader2, CheckCircle2, ChevronRight, AlertCircle, ShoppingBag, Calendar, Tag, RefreshCw, Briefcase, User as UserIcon } from 'lucide-react';
import { cn } from './lib/utils';
import { User, db, doc, onSnapshot } from './lib/firebase';

const CONNECT_URL = "https://connectgmail-t7zuw6sfpa-uc.a.run.app";

interface ConnectionStatus {
  business: boolean;
  personal: boolean;
}

export default function GmailSyncView({ user }: { user: User, baseCurrency: string, onProcessComplete: (data: any) => void }) {
  const [connections, setConnections] = useState<ConnectionStatus>({ business: false, personal: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const unsubBusiness = onSnapshot(doc(db, `users/${user.uid}/connections`, 'gmail_dj'), (snap) => {
      setConnections(prev => ({ ...prev, business: snap.exists() }));
    });

    const unsubPersonal = onSnapshot(doc(db, `users/${user.uid}/connections`, 'gmail_personal'), (snap) => {
      setConnections(prev => ({ ...prev, personal: snap.exists() }));
      setLoading(false);
    });

    return () => {
      unsubBusiness();
      unsubPersonal();
    };
  }, [user]);

  const [syncing, setSyncing] = useState<string | null>(null);

  const handleConnect = (type: 'business' | 'personal') => {
    const typeParam = type === 'business' ? 'dj' : 'personal';
    window.location.href = `${CONNECT_URL}?type=${typeParam}`;
  };

  const handleSync = async (type: 'business' | 'personal') => {
    setSyncing(type);
    try {
      const response = await fetch(`https://us-central1-nexus-platform-beta-9283.cloudfunctions.net/manualSync?type=${type}&days=30`);
      const result = await response.json();
      alert(`Sync Complete! Found ${result.count} new items.`);
    } catch (err) {
      console.error("Sync failed", err);
      alert("Sync failed. Check console for details.");
    } finally {
      setSyncing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-accent-green" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Business Connection */}
      <div className={cn(
        "bg-bg-card p-6 rounded-[32px] border transition-all flex flex-col gap-4",
        connections.business ? "border-accent-green/20" : "border-white/5"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              connections.business ? "bg-accent-green/10 text-accent-green" : "bg-white/5 text-text-muted"
            )}>
              <Briefcase size={22} />
            </div>
            <div>
              <h4 className="text-sm font-black text-white">Business Inbox Sync</h4>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                {connections.business ? "Scanning for DJ & Production Invoices" : "Connect DJ Gmail"}
              </p>
            </div>
          </div>
          
          {connections.business ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-accent-green/10 rounded-full">
              <CheckCircle2 size={12} className="text-accent-green" />
              <span className="text-[9px] font-black uppercase tracking-widest text-accent-green">Active</span>
            </div>
          ) : (
            <button 
              onClick={() => handleConnect('business')}
              className="px-4 py-2 bg-accent-green text-bg-deep rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
            >
              Connect
            </button>
          )}
        </div>

        {connections.business && (
          <button 
            onClick={() => handleSync('business')}
            disabled={!!syncing}
            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {syncing === 'business' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="text-[9px] font-black uppercase tracking-widest">Scan Last 30 Days</span>
          </button>
        )}
      </div>

      {/* Personal Connection */}
      <div className={cn(
        "bg-bg-card p-6 rounded-[32px] border transition-all flex flex-col gap-4",
        connections.personal ? "border-blue-500/20" : "border-white/5"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              connections.personal ? "bg-blue-500/10 text-blue-500" : "bg-white/5 text-text-muted"
            )}>
              <UserIcon size={22} />
            </div>
            <div>
              <h4 className="text-sm font-black text-white">Personal Inbox Sync</h4>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                {connections.personal ? "Tracking Lifestyle & Utility Bills" : "Connect Personal Gmail"}
              </p>
            </div>
          </div>
          
          {connections.personal ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full">
              <CheckCircle2 size={12} className="text-blue-500" />
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-500">Active</span>
            </div>
          ) : (
            <button 
              onClick={() => handleConnect('personal')}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
            >
              Connect
            </button>
          )}
        </div>

        {connections.personal && (
          <button 
            onClick={() => handleSync('personal')}
            disabled={!!syncing}
            className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {syncing === 'personal' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="text-[9px] font-black uppercase tracking-widest">Scan Last 30 Days</span>
          </button>
        )}
      </div>

      {!connections.personal && !connections.business && (
        <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl flex gap-3 text-red-500 mt-4">
          <AlertCircle size={16} className="shrink-0" />
          <p className="text-[10px] font-bold leading-relaxed uppercase tracking-tight">
            Sync Agents require Gmail permissions to automate your ledger.
          </p>
        </div>
      )}
    </div>
  );
}
