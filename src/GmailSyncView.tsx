import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Loader2, CheckCircle2, ChevronRight, AlertCircle, ShoppingBag, Calendar, Tag, RefreshCw } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { cn, formatCurrency } from './lib/utils';
import { User } from './lib/firebase';
import { categorizeItem } from './services/nutritionService';

// Global ai removed to prevent startup crash. Use local ai from geminiKey.


interface GmailReceipt {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
}

interface ExtractedReceiptData {
  merchant: string;
  date: string;
  totalAmount: number;
  currency: string;
  category: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    genericName?: string;
    aisle?: string;
  }[];
}

export default function GmailSyncView({ user, baseCurrency, onProcessComplete }: { user: User, baseCurrency: string, onProcessComplete: (data: ExtractedReceiptData) => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [emails, setEmails] = useState<GmailReceipt[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = async () => {
    setIsSyncing(true);
    setError(null);
    setStatus("Scouting your inbox for receipts...");
    try {
      // We assume tokens are available in localStorage from the previous auth flow
      // If not, we'd need to re-trigger auth
      const tokens = JSON.parse(localStorage.getItem('google_tokens') || 'null');
      if (!tokens) {
        throw new Error("Google connection required. Please connect in Setup.");
      }

      const response = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens })
      });

      if (!response.ok) throw new Error("Sync failed. Session might be expired.");
      const data = await response.json();
      setEmails(data.receipts || []);
      setStatus(data.receipts?.length > 0 ? `Found ${data.receipts.length} potential receipts.` : "No new receipts found in last 7 days.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const processEmail = async (email: GmailReceipt) => {
    setStatus(`Processing: ${email.subject}...`);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            parts: [
              { text: `Extract receipt data from this email content. Identify merchant, date, items, prices, and suggest a category.
              Generic Name should be simple (e.g., 'Milk', 'Bread').
              Aisle should be one of: Produce, Bakery, Dairy, Meat, Frozen, Pantry, Drinks, Snacks, Household, Personal, Service, Other.
              Return valid JSON.` },
              { text: `Subject: ${email.subject}\nFrom: ${email.from}\nContent: ${email.body}` }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchant: { type: Type.STRING },
              date: { type: Type.STRING },
              totalAmount: { type: Type.NUMBER },
              currency: { type: Type.STRING },
              category: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unitPrice: { type: Type.NUMBER },
                    totalPrice: { type: Type.NUMBER },
                    genericName: { type: Type.STRING },
                    aisle: { type: Type.STRING }
                  },
                  required: ['name', 'totalPrice']
                }
              }
            },
            required: ['merchant', 'totalAmount', 'items']
          }
        }
      });

      const extracted = JSON.parse(response.text!);
      if (extracted.items) {
        extracted.items = extracted.items.map((item: any) => ({
          ...item,
          id: crypto.randomUUID()
        }));
      }
      onProcessComplete(extracted);
      // Remove processed email from list
      setEmails(prev => prev.filter(e => e.id !== email.id));
    } catch (err: any) {
      setError(`Analysis failed for this email: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-bg-card p-6 rounded-[32px] border border-border-dark shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-accent-green">
            <Mail size={18} />
            <h2 className="text-sm font-black uppercase tracking-widest text-accent-green">Gmail Inbox Sync</h2>
          </div>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">
            Digital Receipt Agent
          </p>
        </div>
        <button 
          onClick={fetchEmails}
          disabled={isSyncing}
          className={cn(
            "p-3 rounded-2xl bg-white/10 text-white transition-all active:scale-95",
            isSyncing && "opacity-50"
          )}
        >
          {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex gap-3 text-red-500">
          <AlertCircle size={18} className="shrink-0" />
          <p className="text-[11px] font-bold">{error}</p>
        </div>
      )}

      {status && !error && (
        <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
          {status}
        </p>
      )}

      <div className="space-y-3">
        {emails.map((email) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={email.id}
            className="bg-bg-card p-5 rounded-[24px] border border-border-dark flex items-center justify-between group hover:border-accent-green/30 transition-all cursor-pointer"
            onClick={() => processEmail(email)}
          >
            <div className="flex items-center gap-4 min-w-0">
               <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-text-muted group-hover:text-accent-green transition-colors">
                  <Mail size={20} />
               </div>
               <div className="min-w-0">
                  <h4 className="text-xs font-black text-white truncate">{email.subject}</h4>
                  <p className="text-[9px] font-bold text-text-muted truncate">{email.from}</p>
               </div>
            </div>
            <div className="flex items-center gap-3">
               <span className="text-[10px] font-black text-text-muted">{new Date(email.date).toLocaleDateString()}</span>
               <ChevronRight size={16} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </motion.div>
        ))}
        
        {!isSyncing && emails.length === 0 && !status && !error && (
          <div className="py-20 text-center opacity-20">
            <Mail size={40} className="mx-auto mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest">Connect and Sync your inbox</p>
          </div>
        )}
      </div>
    </div>
  );
}
