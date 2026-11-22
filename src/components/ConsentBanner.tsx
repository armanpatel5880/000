import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

export default function ConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('dpdp_consent_status');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('dpdp_consent_status', 'accepted');
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem('dpdp_consent_status', 'declined');
    setShowBanner(false);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-16 inset-x-4 z-50 max-w-lg mx-auto bg-white border border-slate-200 rounded-3xl p-5 shadow-xl text-slate-900"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-[#ECFDF5] text-[#16A34A] rounded-2xl shrink-0 border border-[#BBF7D0]">
              <ShieldCheck size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-1">
                Data Privacy & Tracking Permission (DPDP Act 2023)
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                We use essential session storage and analytics to secure tournament matchmaking and wallet transactions. No data is sold to 3rd-party advertisers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={handleDecline}
              className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
            >
              Essential Only
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 py-2.5 px-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Allow & Agree
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
