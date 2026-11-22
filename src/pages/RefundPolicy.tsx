import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Page } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface RefundPolicyProps {
  onPageChange: (page: Page) => void;
}

export default function RefundPolicy({ onPageChange }: RefundPolicyProps) {
  const [customRefundPolicy, setCustomRefundPolicy] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists() && snap.data().refundPolicy) {
        setCustomRefundPolicy(snap.data().refundPolicy);
      }
    }, (err) => {
      console.warn('RefundPolicy settings fetch error:', err);
    });
    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-24 max-w-lg mx-auto px-4 pt-6 border-x border-slate-200">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => onPageChange(Page.PROFILE)}
          className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-[#16A34A] hover:border-emerald-300 transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-black italic uppercase tracking-wider text-slate-900">Refund & Cancellation</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#16A34A]">AP Tournament Money & Entry Policies</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 text-xs text-slate-600 leading-relaxed shadow-xs">
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-[#16A34A]">
          <RefreshCw size={24} className="shrink-0" />
          <p className="text-[11px] font-bold">100% Guaranteed instant wallet refund if a match is cancelled by the admin team.</p>
        </div>

        {customRefundPolicy ? (
          <div className="space-y-4 whitespace-pre-wrap font-sans text-slate-700">
            {customRefundPolicy}
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#16A34A]" /> 1. Match Cancellation & Auto-Refund
              </h2>
              <p>
                If a scheduled match or tournament is cancelled by the AP Tournament admin team due to server issues, room creation errors, or technical glitches, 100% of the entry fee is automatically refunded back to your wallet deposit balance instantly.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <AlertCircle size={16} className="text-[#16A34A]" /> 2. Player Self-Cancellation & No-Show
              </h2>
              <p>
                Once a player registers and reserves a slot in a custom match, entry fees are non-refundable if the player fails to join the room on time or decides to leave after room credentials (ID & Password) are issued.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={16} className="text-red-600" /> 3. Rule Violations & Disqualifications
              </h2>
              <p>
                If a player is disqualified for teaming, hack/script usage, joining the wrong slot, or emulator usage, their entry fee will be forfeited and no refund will be provided.
              </p>
            </div>
          </>
        )}

        <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          Last updated: November 2026 • AP Tournament Esports
        </div>
      </div>
    </div>
  );
}
