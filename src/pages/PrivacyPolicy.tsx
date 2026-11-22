import React, { useState, useEffect } from 'react';
import { ArrowLeft, Shield, Lock, FileText, UserCheck, Trash2, Mail } from 'lucide-react';
import { Page } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface PrivacyPolicyProps {
  onPageChange: (page: Page) => void;
}

export default function PrivacyPolicy({ onPageChange }: PrivacyPolicyProps) {
  const [customPolicy, setCustomPolicy] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists() && snap.data().privacyPolicy) {
        setCustomPolicy(snap.data().privacyPolicy);
      }
    }, (err) => {
      console.warn('PrivacyPolicy settings fetch error:', err);
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
          <h1 className="text-lg font-black italic uppercase tracking-wider text-slate-900">Privacy & DPDP Policy</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#16A34A]">AP Tournament Data Protection (DPDP Act 2023)</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 text-xs text-slate-600 leading-relaxed shadow-xs">
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-[#16A34A]">
          <Shield size={24} className="shrink-0" />
          <p className="text-[11px] font-bold">Compliant with the Digital Personal Data Protection (DPDP) Act, 2023 (Government of India).</p>
        </div>

        {customPolicy ? (
          <div className="space-y-4 whitespace-pre-wrap font-sans text-slate-700">
            {customPolicy}
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <FileText size={16} className="text-[#16A34A]" /> 1. Data Collected & Purpose
              </h2>
              <p>
                Under the DPDP Act 2023, AP Tournament acts as a <strong className="text-slate-900">Data Fiduciary</strong>. We collect minimal personal data including Username, Email, Phone Number, and Free Fire IGN strictly for facilitating matchmaking, managing wallet transactions, and verifying prize payouts.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <UserCheck size={16} className="text-[#16A34A]" /> 2. Data Principal Rights (Your Legal Rights)
              </h2>
              <p className="mb-2">As a Data Principal under Indian Law, you have the following rights:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                <li><strong className="text-slate-900">Right to Access:</strong> View all personal data stored in your profile at any time.</li>
                <li><strong className="text-slate-900">Right to Correction:</strong> Update or modify incomplete or inaccurate profile details.</li>
                <li><strong className="text-slate-900">Right to Erasure (Right to be Forgotten):</strong> Request complete deletion of your account and associated personal data.</li>
                <li><strong className="text-slate-900">Right to Withdraw Consent:</strong> Withdraw processing consent at any time without penalty.</li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <Lock size={16} className="text-[#16A34A]" /> 3. Data Storage & Security
              </h2>
              <p>
                All personal data is encrypted in transit and at rest on secure cloud servers located within India / compliant regions. We do not sell, rent, or trade your personal data to any third-party advertisers.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <Trash2 size={16} className="text-[#16A34A]" /> 4. Data Retention & Erasure Process
              </h2>
              <p>
                Your personal data is retained only as long as your account is active. To exercise your Right to Erasure, you can use the "Request Data Deletion" option in your Profile settings or write directly to our Data Protection Officer.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-black text-slate-900 italic uppercase tracking-wider flex items-center gap-2">
                <Mail size={16} className="text-[#16A34A]" /> 5. Data Protection Officer (DPO) Contact
              </h2>
              <p>
                For grievances, data protection inquiries, or DPDP rights requests, contact our Data Protection Officer at: <strong className="text-slate-900">dpo@aptournament.com</strong> / <strong className="text-slate-900">support@aptournament.com</strong>.
              </p>
            </div>
          </>
        )}

        <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          DPDP Act 2023 Compliant • AP Tournament Esports India
        </div>
      </div>
    </div>
  );
}
