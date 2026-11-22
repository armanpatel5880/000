import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Star, Sword, Target, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: string;
  onJoin: () => void;
  isJoined: boolean;
}

export default function RulesModal({ isOpen, onClose, section, onJoin, isJoined }: RulesModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeSectionKey = (secName: string) => {
    return (secName || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  };

  const getIcon = (sec: string) => {
    const s = (sec || '').toLowerCase();
    if (s.includes('clash') || s.includes('4v4')) return <Shield className="text-[#16A34A]" size={20} />;
    if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2')) return <Target className="text-[#16A34A]" size={20} />;
    if (s.includes('sniper')) return <Target className="text-[#16A34A]" size={20} />;
    if (s.includes('custom')) return <Star className="text-[#16A34A]" size={20} />;
    return <Sword className="text-[#16A34A]" size={20} />;
  };

  useEffect(() => {
    if (isOpen) {
      setAgreed(false);
      setLoading(true);
      const fetchRules = async () => {
        try {
          const s = (section || 'Battle Royale').toLowerCase().trim();
          const normKey = normalizeSectionKey(s);

          let docSnap = await getDoc(doc(db, 'gameRules', normKey));

          if (!docSnap.exists()) {
            if (s.includes('clash') || s.includes('cs') || s.includes('4v4')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
            } else if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
            } else if (s.includes('sniper')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
            } else if (s.includes('custom')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'custom_room'));
            } else {
              docSnap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
            }
          }

          if (docSnap.exists() && docSnap.data().rules && docSnap.data().rules.length > 0) {
            setRules(docSnap.data().rules);
          } else {
            setRules([
              'Fair Play: No hacking, scripts or third-party tools allowed.',
              'Device Requirements: Mobile and Tablet players only. Strictly no emulators.',
              'Verification: Screenshot of victory/final scorecard is mandatory in case of disputes.',
              'Late Entry: Room closes right before match starts. Late entry is not entertained.',
              'Admin Decision: Admin decision will be final and binding for all participants.'
            ]);
          }
        } catch (error) {
          console.error("Error fetching rules:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchRules();
    }
  }, [isOpen, section]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-7 shadow-2xl relative overflow-hidden text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5 relative">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-slate-900">Match Rules</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Read carefully before deployment</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-5 p-3 rounded-2xl border bg-[#ECFDF5]/70 border-[#BBF7D0] flex items-center gap-3">
               <div className="p-2 bg-white rounded-xl border border-[#BBF7D0] shadow-2xs">
                 {getIcon(section)}
               </div>
               <span className="text-xs font-black uppercase tracking-wider text-[#16A34A]">{section === 'Battle Royale' ? 'Battle Royale' : section}</span>
            </div>

            <div className="max-h-[40vh] overflow-y-auto custom-scrollbar mb-6 space-y-3 pr-1">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500">
                  <Loader2 className="animate-spin mb-2 text-[#16A34A]" size={24} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Loading Regulations...</span>
                </div>
              ) : rules.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">No rules set by admin</p>
                </div>
              ) : (
                rules.map((rule, idx) => (
                  <div key={idx} className="flex gap-3 group">
                    <span className="text-[#16A34A] mt-0.5 shrink-0 font-black">•</span>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed">
                      {rule}
                    </p>
                  </div>
                ))
              )}
            </div>

            {!isJoined && (
              <div className="mb-5">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded-lg checked:bg-[#16A34A] checked:border-[#16A34A] transition-all cursor-pointer"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <div className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none">
                      <Star size={10} fill="currentColor" />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                    I agree to all the rules
                  </span>
                </label>
              </div>
            )}

            <button 
              disabled={!isJoined && !agreed}
              onClick={() => {
                if (isJoined || agreed) {
                  onJoin();
                  onClose();
                }
              }}
              className={`w-full py-3.5 text-xs font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all cursor-pointer ${
                isJoined || agreed
                  ? 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              Join Match
            </button>
            
            {!agreed && !isJoined && (
              <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-wider mt-3">
                Requirement: Validation of rules mandatory
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
