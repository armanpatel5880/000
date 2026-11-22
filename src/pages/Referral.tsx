import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Users, Gift, Share2, Copy, CheckCircle2, Bookmark } from 'lucide-react';
import { Page, User } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { generateReferralCode } from '../utils/referralUtils';

interface ReferralPageProps {
  user: User;
  onPageChange: (page: Page) => void;
}

const OFFICIAL_REFERRAL_URL = 'https://ap-tournaments-official.netlify.app';

export default function ReferralPage({ user, onPageChange }: ReferralPageProps) {
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [userRefCode, setUserRefCode] = useState(user.referralCode || '');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists()) {
        setAppSettings(snap.data());
      }
    }, (error) => {
      console.warn('Referral appSettings notice:', error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user.referralCode && user.id) {
      const newCode = generateReferralCode();
      setUserRefCode(newCode);
      updateDoc(doc(db, 'users', user.id), { referralCode: newCode }).catch(console.warn);
    } else if (user.referralCode) {
      setUserRefCode(user.referralCode);
    }
  }, [user]);

  const referralCode = userRefCode || user.referralCode || user.username;
  const configuredBaseUrl = appSettings?.referral?.baseUrl?.trim()?.replace(/\/+$/, '');
  const isTemporaryUrl =
    !configuredBaseUrl ||
    configuredBaseUrl.includes('ais-dev-') ||
    configuredBaseUrl.includes('ais-pre-') ||
    configuredBaseUrl.includes('localhost');
  const baseUrl = isTemporaryUrl ? OFFICIAL_REFERRAL_URL : configuredBaseUrl;
  const referralLink = `${baseUrl}/?ref=${referralCode}`;
  const refReward = appSettings?.referral?.perReferralReward || 15;
  const newUserReward = appSettings?.referral?.newUserReward > 0 ? appSettings?.referral?.newUserReward : 9;

  const handleCopy = (text: string, type: 'code' | 'link' = 'link') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleShare = async () => {
    const shareMessage = `Join AP Tournament! Use my Referral Code: ${referralCode} to get ₹${newUserReward} bonus!`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AP Tournament Referral',
          text: shareMessage,
          url: referralLink,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopy(`${shareMessage} ${referralLink}`, 'link');
        }
      }
    } else {
      handleCopy(`${shareMessage} ${referralLink}`, 'link');
    }
  };

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#F8FAFC] text-slate-900 min-h-screen select-none border-x border-slate-200">
      <div className="px-5 pt-6 pb-8">
        {/* Top Header */}
        <div className="flex items-center gap-4 mb-7">
          <button 
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-11 h-11 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-600 hover:text-[#16A34A] hover:border-emerald-300 active:scale-95 transition-all cursor-pointer shadow-2xs"
          >
            <ArrowLeft size={20} className="stroke-[2.5]" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-black italic tracking-tighter uppercase leading-none text-slate-900">
              REFER & <span className="text-[#16A34A]">EARN</span>
            </h2>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 mt-1">
              UNLIMITED REWARDS PROGRAM
            </p>
          </div>
        </div>

        {/* Hero Card in Emerald Green */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden p-6 sm:p-7 rounded-[32px] bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] shadow-lg mb-5 text-white"
        >
          {/* Watermark Gift Icon Background */}
          <div className="absolute top-2 -right-4 opacity-15 pointer-events-none">
            <Gift size={200} className="text-white" />
          </div>

          <div className="relative z-10">
            {/* Top Gift Badge */}
            <div className="w-12 h-12 bg-white/15 border border-white/25 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-xs">
              <Gift className="text-white" size={24} />
            </div>

            {/* Title */}
            <h3 className="text-2xl sm:text-3xl font-black italic uppercase leading-none tracking-tight mb-3 text-white">
              INVITE FRIENDS,<br />
              GET <span className="text-emerald-300">₹{refReward}</span> REWARDS
            </h3>

            {/* Description */}
            <p className="text-[11px] font-bold uppercase tracking-wider leading-relaxed mb-7 text-emerald-100 max-w-[290px]">
              SPREAD THE WORD AND BUILD YOUR GAMING SQUAD. YOU GET ₹{refReward} BONUS FOR EVERY FRIEND WHO JOINS.
            </p>

            {/* Referral Code & Copy Button */}
            <div className="flex items-center gap-3">
              <div className="px-5 py-3 bg-white/15 border border-white/30 rounded-2xl flex items-center justify-center min-w-[140px]">
                <span className="text-xs sm:text-sm font-black italic text-white tracking-widest select-all">
                  {referralCode}
                </span>
              </div>

              <button 
                onClick={() => handleCopy(referralCode, 'code')}
                className="w-11 h-11 bg-white hover:bg-slate-50 rounded-2xl text-[#16A34A] font-black flex items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
                title="Copy Code"
              >
                {copiedType === 'code' ? <CheckCircle2 size={20} className="text-[#16A34A]" /> : <Copy size={20} />}
              </button>
            </div>
          </div>
        </motion.div>

        {/* HOW IT WORKS Section */}
        <section className="space-y-3.5 mb-8">
          <h4 className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 ml-1">
            HOW IT WORKS
          </h4>

          <div className="space-y-3.5">
            {/* Step 01 */}
            <div 
              onClick={handleShare}
              className="p-5 bg-white rounded-[24px] flex items-center justify-between cursor-pointer hover:border-emerald-300 active:scale-[0.99] transition-all border border-slate-200 shadow-2xs"
            >
              <div className="flex gap-4">
                <span className="text-sm font-black italic text-[#16A34A]">01</span>
                <div>
                  <h5 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 mb-1">
                    SHARE YOUR LINK
                  </h5>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 leading-relaxed max-w-[240px]">
                    SEND YOUR UNIQUE REFERRAL LINK TO YOUR FRIENDS OR SQUAD MEMBERS.
                  </p>
                </div>
              </div>
              <Share2 size={18} className="text-slate-400 shrink-0" />
            </div>

            {/* Step 02 */}
            <div className="p-5 bg-white rounded-[24px] flex items-center justify-between border border-slate-200 shadow-2xs">
              <div className="flex gap-4">
                <span className="text-sm font-black italic text-[#16A34A]">02</span>
                <div>
                  <h5 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 mb-1">
                    FRIEND REGISTERS
                  </h5>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 leading-relaxed max-w-[240px]">
                    THEY GET ₹{newUserReward} INSTANT BONUS WHEN THEY SIGN UP USING YOUR LINK.
                  </p>
                </div>
              </div>
              <Users size={18} className="text-slate-400 shrink-0" />
            </div>

            {/* Step 03 */}
            <div className="p-5 bg-white rounded-[24px] flex items-center justify-between border border-slate-200 shadow-2xs">
              <div className="flex gap-4">
                <span className="text-sm font-black italic text-[#16A34A]">03</span>
                <div>
                  <h5 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 mb-1">
                    EARN TOGETHER
                  </h5>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 leading-relaxed max-w-[240px]">
                    YOU RECEIVE ₹{refReward} REWARD INSTANTLY IN YOUR WALLET.
                  </p>
                </div>
              </div>
              <Bookmark size={18} className="text-slate-400 shrink-0" />
            </div>
          </div>
        </section>

        {/* Share Button CTA */}
        <button 
          onClick={handleShare}
          className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 shadow-sm active:scale-98 transition-all cursor-pointer"
        >
          <Share2 size={18} />
          SHARE REFERRAL LINK
        </button>
      </div>
    </div>
  );
}
