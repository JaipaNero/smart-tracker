import React from 'react';
import { 
  Settings, 
  Mail, 
  User, 
  Globe, 
  Target, 
  Shield, 
  LogOut,
  ChevronRight,
  Bell,
  Palette,
  Smartphone,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { User as FirebaseUser, auth, signOut } from '../lib/firebase';
import { Budget } from '../types';
import GmailSyncView from '../GmailSyncView';
import { cn, formatCurrency } from '../lib/utils';

interface SettingsViewProps {
  user: FirebaseUser;
  baseCurrency: string;
  spendingCap: number;
  budgets: Budget[];
  geminiKey: string;
  onUpdateCurrency: (currency: string) => void;
  onUpdateSpendingCap: (cap: number) => void;
  onUpdateGeminiKey: (key: string) => void;
  onWipeData: () => void;
  onProcessComplete: (data: any) => void;
}

export default function SettingsView({ 
  user, 
  baseCurrency, 
  spendingCap, 
  budgets,
  geminiKey,
  onUpdateCurrency, 
  onUpdateSpendingCap,
  onUpdateGeminiKey,
  onWipeData,
  onProcessComplete 
}: SettingsViewProps) {
  return (
    <div className="space-y-10 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-3 text-accent-green">
          <Settings size={24} />
          <h1 className="text-2xl font-black tracking-tighter text-white">Settings</h1>
        </div>
        <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Configuration & Integrations</p>
      </header>

      {/* Profile Section */}
      <section className="bg-bg-card rounded-[32px] border border-border-dark overflow-hidden">
        <div className="p-8 flex items-center gap-6 border-b border-white/5">
          <div className="w-20 h-20 rounded-full border-4 border-accent-green/20 overflow-hidden bg-white/5">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-3xl font-black uppercase">
                {user.displayName?.[0] || 'U'}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white">{user.displayName || 'User'}</h2>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
              <Shield size={12} className="text-accent-green" />
              Verified Account
            </p>
          </div>
        </div>
        
        <div className="p-4 grid grid-cols-2 gap-2">
          <button className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 transition-colors group">
            <User size={18} className="text-text-muted group-hover:text-white transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Account</span>
          </button>
          <button className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 transition-colors group">
            <Bell size={18} className="text-text-muted group-hover:text-white transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Alerts</span>
          </button>
          <button className="flex items-center gap-3 p-4 rounded-2xl hover:bg-white/5 transition-colors group">
            <Palette size={18} className="text-text-muted group-hover:text-white transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Theme</span>
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center gap-3 p-4 rounded-2xl hover:bg-red-500/10 transition-colors group"
          >
            <LogOut size={18} className="text-red-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Sign Out</span>
          </button>
        </div>
      </section>

      {/* Financial Config */}
      <section className="space-y-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted px-4">Ledger Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bg-card p-6 rounded-[24px] border border-border-dark space-y-4">
            <div className="flex items-center gap-3">
              <Globe className="text-blue-500" size={18} />
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Base Currency</label>
            </div>
            <select 
              value={baseCurrency}
              onChange={(e) => onUpdateCurrency(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-black focus:outline-none focus:border-blue-500 transition-all"
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>

          <div className="bg-bg-card p-6 rounded-[24px] border border-border-dark space-y-4">
            <div className="flex items-center gap-3">
              <Target className="text-accent-green" size={18} />
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Monthly Spending Cap</label>
            </div>
            <div className="relative">
              <input 
                type="number"
                value={spendingCap}
                onChange={(e) => onUpdateSpendingCap(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-black focus:outline-none focus:border-accent-green transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-muted">{baseCurrency}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Budgets Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">Category Budgets</h3>
          <button className="text-[10px] font-black text-accent-green uppercase tracking-widest hover:underline">Edit All</button>
        </div>
        <div className="bg-bg-card rounded-[32px] border border-border-dark overflow-hidden divide-y divide-white/5">
          {budgets.map((budget, idx) => (
            <div key={idx} className="p-6 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-accent-green" />
                <span className="text-sm font-black text-white">{budget.category}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-white">{formatCurrency(budget.amount, baseCurrency)}</span>
                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Monthly Limit</p>
              </div>
            </div>
          ))}
          {budgets.length === 0 && (
            <div className="p-10 text-center text-text-muted text-[10px] font-black uppercase tracking-widest opacity-30">
              No custom budgets set
            </div>
          )}
        </div>
      </section>

      {/* AI Config */}
      <section className="space-y-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted px-4">AI & Intelligence</h3>
        <div className="bg-bg-card p-8 rounded-[32px] border border-border-dark space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-500 border border-purple-500/20">
              <Smartphone size={20} />
            </div>
            <div>
              <h4 className="text-sm font-black text-white">Google Gemini API</h4>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Powering Receipt Scanning & AI Assistant</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <input 
              type="password"
              placeholder="Enter your Gemini API Key"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-mono focus:outline-none focus:border-purple-500 transition-all"
              value={geminiKey}
              onChange={(e) => onUpdateGeminiKey(e.target.value)}
            />
            <p className="text-[9px] font-bold text-text-muted px-2">
              Your key is stored locally in your browser. Get one at <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">AI Studio</a>.
            </p>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 px-4">Danger Zone</h3>
        <div className="bg-red-500/5 rounded-[32px] border border-red-500/10 p-8 space-y-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="text-red-500 shrink-0 mt-1" size={20} />
            <div className="space-y-2">
              <h4 className="text-sm font-black text-white">Wipe All Data</h4>
              <p className="text-xs font-bold text-text-muted leading-relaxed">
                This will permanently delete all your expenses, receipts, pantry items, and settings. This action cannot be undone.
              </p>
            </div>
          </div>
          <button 
            onClick={() => {
              if (confirm('Are you absolutely sure you want to wipe all your data? This cannot be undone.')) {
                onWipeData();
              }
            }}
            className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-2xl py-4 font-black text-xs uppercase tracking-widest transition-all active:scale-95"
          >
            Delete My Account Data
          </button>
        </div>
      </section>

      {/* Integrations Hub */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-4">
           <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">Connected Apps</h3>
           <div className="px-3 py-1 bg-accent-green/10 border border-accent-green/20 rounded-full">
              <span className="text-[8px] font-black uppercase tracking-widest text-accent-green">Agent Active</span>
           </div>
        </div>
        
        <GmailSyncView 
          user={user} 
        />
      </section>

      <section className="bg-white/5 p-8 rounded-[32px] border border-white/5 flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="text-xs font-black text-white uppercase tracking-widest">App Version</h4>
          <p className="text-[10px] font-bold text-text-muted">v2.4.0 (2026 Build)</p>
        </div>
        <button className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-green hover:underline">
          Check for updates
        </button>
      </section>
    </div>
  );
}
