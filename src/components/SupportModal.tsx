import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, Mail, X, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const fetchSettings = async () => {
        try {
          const snap = await getDoc(doc(db, 'appSettings', 'referral_support'));
          if (snap.exists()) {
            setSettings(snap.data().support);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchSettings();
    }
  }, [isOpen]);

  const supportOptions = [
    { 
      label: 'WhatsApp', 
      icon: MessageSquare, 
      color: 'bg-[#16A34A] text-white', 
      link: settings?.whatsapp || 'https://wa.me/',
      desc: 'Instant replies (9 AM - 9 PM)'
    },
    { 
      label: 'Telegram', 
      icon: Send, 
      color: 'bg-[#16A34A] text-white', 
      link: settings?.telegram || 'https://t.me/',
      desc: 'Join our community channel'
    },
    { 
      label: 'Email', 
      icon: Mail, 
      color: 'bg-slate-800 text-white', 
      link: `mailto:${settings?.email || 'support@aptournament.com'}`,
      desc: 'For business & technical queries'
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:p-5">
           <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
           />
           
             <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white rounded-t-[2.25rem] p-6 sm:p-8 pb-10 border-t border-slate-200 shadow-2xl flex flex-col max-h-[82vh] overflow-hidden text-slate-900"
             >
               <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-xl font-black tracking-tight uppercase text-slate-900 leading-none">
                      Customer <span className="text-[#16A34A]">Support</span>
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">We're here to help you</p>
                 </div>
                 <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 hover:text-slate-900 transition-colors cursor-pointer">
                   <X size={20} />
                 </button>
               </div>

               <div className="overflow-y-auto custom-scrollbar space-y-5">
                  {/* Status Card */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A] animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#16A34A]">System Status: Operational</span>
                     </div>
                     <ShieldCheck size={16} className="text-[#16A34A]" />
                  </div>

                  {loading ? (
                    <div className="py-16 flex flex-col items-center justify-center">
                      <Loader2 className="text-[#16A34A] animate-spin mb-3" size={28} />
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Syncing communication channels...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {supportOptions.map((opt) => (
                        <a 
                          key={opt.label}
                          href={opt.link}
                          target="_blank"
                          rel="noreferrer"
                          className="p-4 bg-slate-50 hover:bg-[#ECFDF5]/50 border border-slate-200 hover:border-[#16A34A]/40 rounded-2xl flex items-center justify-between group active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-11 h-11 rounded-2xl ${opt.color} flex items-center justify-center shadow-xs`}>
                              <opt.icon size={22} />
                            </div>
                            <div>
                              <h4 className="text-sm font-black uppercase tracking-tight text-slate-900">{opt.label}</h4>
                              <p className="text-[10px] font-semibold text-slate-500">{opt.desc}</p>
                            </div>
                          </div>
                          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-[#16A34A] transition-colors">
                             <ChevronRight size={18} />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                  
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                     <p className="text-[10px] font-semibold text-slate-500 leading-relaxed text-center">
                        Our support team typically responds within 30-60 minutes during active hours. For transaction issues, please provide your Transaction ID.
                     </p>
                  </div>
               </div>
             </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
