import React, { useState, useEffect } from 'react';
import { ArrowLeft, ShieldAlert, Award, Ban, CheckCircle2 } from 'lucide-react';
import { Page } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface FairPlayPolicyProps {
  onPageChange: (page: Page) => void;
}

export default function FairPlayPolicy({ onPageChange }: FairPlayPolicyProps) {
  const [customFairPlay, setCustomFairPlay] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists() && snap.data().fairPlayPolicy) {
        setCustomFairPlay(snap.data().fairPlayPolicy);
      }
    }, (err) => {
      console.warn('FairPlayPolicy settings fetch error:', err);
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
          <h1 className="text-lg font-black italic uppercase tracking-wider text-slate-900">Fair Play & Anti-Cheat</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-red-600">AP Tournament Zero Tolerance Rules</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 text-xs text-slate-600 leading-relaxed shadow-xs">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
          <ShieldAlert size={24} className="shrink-0" />
          <p className="text-[11px] font-bold">Strict Zero-Tolerance policy against hacking, teaming, and emulator usage.</p>
        </div>

        {customFairPlay ? (
          <div className="space-y-4 whitespace-pre-wrap font-sans text-slate-700">
            {customFairPlay}
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <Ban size={16} className="text-red-600" /> 1. Anti-Hacking & Modified Files
              </h2>
              <p>
                Any use of auto-aim, headshot scripts, modified game OBB/APK files, wallhacks, or GFX tool exploits will lead to an immediate lifetime ban of your AP Tournament account and permanent forfeiture of wallet balance.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={16} className="text-amber-600" /> 2. Mobile & Tablet Only (No PC Emulators)
              </h2>
              <p>
                All tournaments are strictly mobile and tablet only. Players detected using PC Emulators (BlueStacks, LDPlayer, Nox, etc.) will be kicked from room or disqualified without refund.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <Award size={16} className="text-[#16A34A]" /> 3. Anti-Teaming & Slot Discipline
              </h2>
              <p>
                Teaming with opponent players in Solo or Duo modes is strictly illegal. Players must also occupy ONLY their assigned slot number in custom room lobbies.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#16A34A]" /> 4. Match Proof & Disputes
              </h2>
              <p>
                Winning players/captains must keep high-definition end-game screenshots or screen recordings. Admin team decisions after score review are final and binding.
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
