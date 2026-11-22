import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Smartphone, Ban, MessageCircle, AlertTriangle, Lock, User as UserIcon, Gamepad2, Mail, Copy, Check } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { extractUserIgn, fetchRegistrationIgnFallback } from '../utils/deviceHelper';

interface DeviceBannedScreenProps {
  type?: 'device' | 'user';
  reason?: string;
  username?: string;
  ign?: string;
  email?: string;
  bannedUserId?: string;
  onLogout?: () => void;
}

function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return 'Hidden';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0] || '*'}***@${domain}`;
  }
  if (localPart.length <= 4) {
    return `${localPart.slice(0, 2)}***@${domain}`;
  }
  return `${localPart.slice(0, 2)}***${localPart.slice(-2)}@${domain}`;
}

function buildWhatsappAppealUrl(rawSupport: string, message: string): string {
  const encodedMsg = encodeURIComponent(message);
  let base = (rawSupport || '').trim();

  // If admin stored a plain phone number (e.g. "+91 9009999999" or "9009999999")
  if (base && !base.startsWith('http')) {
    const digits = base.replace(/\D/g, '');
    if (digits.length >= 10) {
      const normalized = digits.length === 10 ? `91${digits}` : digits;
      base = `https://wa.me/${normalized}`;
    } else {
      base = 'https://wa.me/919009999999';
    }
  }

  if (!base) {
    base = 'https://wa.me/919009999999';
  }

  try {
    const parsed = new URL(base);
    // Replace any pre-existing `text` query param so WhatsApp doesn't pick an older text param
    parsed.searchParams.delete('text');
    const existingSearch = parsed.searchParams.toString();
    const baseWithoutHash = `${parsed.origin}${parsed.pathname}${existingSearch ? `?${existingSearch}` : ''}`;
    return `${baseWithoutHash}${existingSearch ? '&' : '?'}text=${encodedMsg}`;
  } catch {
    return `https://wa.me/919009999999?text=${encodedMsg}`;
  }
}

export default function DeviceBannedScreen({
  type = 'device',
  reason,
  username,
  ign,
  email,
  bannedUserId,
  onLogout
}: DeviceBannedScreenProps) {
  const [supportWhatsapp, setSupportWhatsapp] = useState('https://wa.me/919009999999');
  const [fallbackDetails, setFallbackDetails] = useState<{ username?: string; ign?: string; email?: string }>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'appSettings', 'referral_support'))
      .then((snap) => {
        if (snap.exists()) {
          const wa = snap.data()?.support?.whatsapp;
          if (wa && typeof wa === 'string' && wa.trim()) {
            setSupportWhatsapp(wa.trim());
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const targetUid = bannedUserId || auth.currentUser?.uid;
    if (!targetUid) return;
    if (username && ign && email) return;

    let cancelled = false;
    const resolveMissing = async () => {
      let nextUsername = username || '';
      let nextIgn = ign || '';
      let nextEmail = email || auth.currentUser?.email || '';

      try {
        const userSnap = await getDoc(doc(db, 'users', targetUid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          nextUsername = nextUsername || uData.username || '';
          nextEmail = nextEmail || uData.email || '';
          nextIgn = nextIgn || extractUserIgn(uData);
        }
      } catch {
        // ignore fallback error
      }

      if (!nextIgn) {
        nextIgn = await fetchRegistrationIgnFallback(targetUid);
      }

      if (!cancelled) {
        setFallbackDetails({
          username: nextUsername,
          ign: nextIgn,
          email: nextEmail
        });
      }
    };

    resolveMissing();
    return () => {
      cancelled = true;
    };
  }, [bannedUserId, username, ign, email]);

  const resolvedUsername = (username || fallbackDetails.username || '').trim() || 'Player';
  const resolvedIgn = (ign || fallbackDetails.ign || '').trim() || 'Not Set';
  const resolvedEmail = (email || fallbackDetails.email || auth.currentUser?.email || '').trim() || 'Not Provided';

  const defaultReason = type === 'device'
    ? 'Third-party hack / Config file / FairPlay violation detected in Free Fire tournament match.'
    : 'Your account has been permanently blocked by administration.';

  const displayReason = reason || defaultReason;
  const maskedGmail = maskEmail(resolvedEmail === 'Not Provided' ? '' : resolvedEmail);

  const rawAppealMessage = `Hello AP Tournament Support, my account is blocked. Name: ${resolvedUsername} | In-Game Name: ${resolvedIgn} | Gmail: ${resolvedEmail} | Reason: ${displayReason}`;
  const whatsappHref = buildWhatsappAppealUrl(supportWhatsapp, rawAppealMessage);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(rawAppealMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#F2FBF6] text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto select-none">
      {/* Subtle Light Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-red-500/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 260 }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-7 shadow-xl text-center relative z-10"
      >
        {/* Header Icon */}
        <div className="relative mx-auto w-20 h-20 mb-5 flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-red-50 border-2 border-red-200 flex items-center justify-center text-red-600 shadow-xs">
            {type === 'device' ? <Smartphone size={36} className="stroke-[2.2]" /> : <Ban size={36} className="stroke-[2.2]" />}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-white shadow-xs">
            <Lock size={13} />
          </div>
        </div>

        {/* Badge & Heading */}
        <span className="px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest inline-block mb-2">
          {type === 'device' ? 'Account & Device Blocked' : 'Account Status: Blocked'}
        </span>

        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900 mb-2">
          Account Blocked
        </h1>

        <p className="text-xs text-slate-500 font-medium leading-relaxed mb-5">
          {type === 'device'
            ? 'Your account and device have been blocked by AP Tournament Administration. Login and new registrations are disabled on this device.'
            : 'Your account has been blocked by AP Tournament Administration due to a policy or FairPlay violation.'}
        </p>

        {/* Block Reason Box */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-left mb-4">
          <div className="flex items-center gap-2 mb-1 text-red-600">
            <AlertTriangle size={15} />
            <span className="text-[10px] font-black uppercase tracking-wider">Block Reason</span>
          </div>
          <p className="text-xs sm:text-sm font-bold text-red-800 leading-snug">
            {displayReason}
          </p>
        </div>

        {/* User Details Card (Name, In-Game Name, Masked Gmail) */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-3 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-500">
              <UserIcon size={14} className="text-[#16A34A] shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-wider">User Name</span>
            </div>
            <span className="text-xs font-extrabold text-slate-900 truncate max-w-[180px]">
              {resolvedUsername}
            </span>
          </div>

          <div className="h-px bg-slate-200" />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-500">
              <Gamepad2 size={14} className="text-[#16A34A] shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-wider">In-Game Name</span>
            </div>
            <span className="text-xs font-extrabold text-slate-900 truncate max-w-[180px]">
              {resolvedIgn}
            </span>
          </div>

          <div className="h-px bg-slate-200" />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-500">
              <Mail size={14} className="text-[#16A34A] shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-wider">Gmail ID</span>
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 truncate max-w-[185px]">
              {maskedGmail}
            </span>
          </div>
        </div>

        {/* Support Appeal Button */}
        <div className="space-y-2.5">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <MessageCircle size={16} />
            <span>Contact Admin For Appeal</span>
          </a>

          <button
            type="button"
            onClick={handleCopyMessage}
            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            {copied ? <Check size={14} className="text-[#16A34A]" /> : <Copy size={14} className="text-slate-500" />}
            <span>{copied ? 'Appeal Details Copied!' : 'Copy Appeal Details'}</span>
          </button>

          {onLogout && type !== 'device' && (
            <button
              onClick={onLogout}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Log Out / Switch Account
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
