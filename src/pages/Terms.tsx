import React, { useState, useEffect } from 'react';
import { ArrowLeft, BookOpen, ShieldAlert, CheckCircle2, Award, AlertTriangle, Mail } from 'lucide-react';
import { Page } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface TermsProps {
  onPageChange: (page: Page) => void;
}

export default function Terms({ onPageChange }: TermsProps) {
  const [customTerms, setCustomTerms] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists() && snap.data().termsOfService) {
        setCustomTerms(snap.data().termsOfService);
      }
    }, (err) => {
      console.warn('Terms settings fetch error:', err);
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
          <h1 className="text-lg font-black italic uppercase tracking-wider text-slate-900">Terms of Service</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#16A34A]">AP Tournament Legal & Usage Policies</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 text-xs text-slate-600 leading-relaxed shadow-xs">
        <div className="flex items-center gap-3 p-4 bg-[#ECFDF5] border border-[#BBF7D0] rounded-2xl text-[#16A34A]">
          <BookOpen size={24} className="shrink-0 text-[#16A34A]" />
          <p className="text-[11px] font-bold">Please read these Terms of Service carefully before joining any esports matches.</p>
        </div>

        {customTerms ? (
          <div className="space-y-4 whitespace-pre-wrap font-sans text-slate-700">
            {customTerms}
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <Award size={16} className="text-[#16A34A]" /> 1. Game of Skill Declaration
              </h2>
              <p>
                AP Tournament hosts competitive esports events (Free Fire, CS, etc.) where outcome depends strictly on player skill, aiming, strategy, reflexes, and teamwork. Our tournaments are classified as <strong className="text-slate-900">"Games of Skill"</strong> under Indian gaming laws and are explicitly protected under Article 19(1)(g) of the Constitution of India.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" /> 2. Restricted Territory Notice
              </h2>
              <p>
                Participation in paid real-money tournaments is strictly prohibited for residents of Indian states where online skill gaming for stakes is restricted or banned by state laws, including but not limited to <strong className="text-slate-900">Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, and Sikkim</strong>. Users from these territories must not register for cash events.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={16} className="text-red-600" /> 3. Fair Play, Slot Discipline & Emulators
              </h2>
              <p>
                Players must join custom rooms using their exact registered IGN and assigned slot numbers. Teaming, emulator (PC) usage in mobile matches, or use of third-party hacks/OBB scripts will result in immediate disqualification, account termination, and forfeiture of wallet balances.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#16A34A]" /> 4. Intellectual Property Disclaimer
              </h2>
              <p>
                Free Fire, Free Fire MAX, and related logos are trademarks or registered trademarks of Garena International. AP Tournament is an independent third-party community tournament organizer and is not affiliated with, endorsed by, or sponsored by Garena.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <Mail size={16} className="text-[#16A34A]" /> 5. Grievance Redressal & Contact
              </h2>
              <p>
                For legal inquiries, dispute resolution, or compliance queries, please contact our Grievance Officer at <strong className="text-slate-900">support@aptournament.com</strong>.
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
