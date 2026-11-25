import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface ApkDownloadBannerProps {
  variant?: 'card' | 'button';
  onInstalled?: () => void;
  onDismiss?: () => void;
}

export default function ApkDownloadBanner({
  variant = 'card',
  onInstalled,
  onDismiss
}: ApkDownloadBannerProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [adminApkUrl, setAdminApkUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.apkDownloadUrl || data.apkUrl) {
            setAdminApkUrl(data.apkDownloadUrl || data.apkUrl);
          }
        }
      } catch (err) {
        // ignore
      }
    };
    fetchSettings();
  }, []);

  const handleActionClick = async () => {
    if (adminApkUrl) {
      window.open(adminApkUrl, '_blank');
      return;
    }
    if (isInstallable) {
      const ok = await install();
      if (ok && onInstalled) onInstalled();
      return;
    }
    setShowGuideModal(true);
  };

  if (isInstalled && !adminApkUrl) {
    return null;
  }

  return (
    <>
      {variant === 'card' ? (
        <div className="w-full p-4 rounded-3xl bg-gradient-to-r from-emerald-50 to-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-between gap-3 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />
          
          <button
            type="button"
            onClick={handleActionClick}
            className="flex-1 flex items-center justify-between gap-3 min-w-0 cursor-pointer active:scale-[0.99] transition-transform text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-[#16A34A] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Smartphone size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-tight text-slate-900 truncate">
                  {adminApkUrl ? 'Download Official APK' : 'Install AP Tournament App'}
                </p>
                <p className="text-[10px] font-bold text-[#16A34A] truncate mt-0.5">
                  {adminApkUrl ? 'Direct Android release build & instant updates' : 'Fullscreen PWA, home screen shortcut & live alerts'}
                </p>
              </div>
            </div>
            <span className="px-3.5 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-xs">
              <Download size={13} />
              <span>{adminApkUrl ? 'Download' : 'Install'}</span>
            </span>
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss banner"
              className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleActionClick}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <Download size={15} />
          <span>{adminApkUrl ? 'Download APK' : 'Install App'}</span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-slate-200 p-6 shadow-2xl text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="AP Tournament"
                  className="w-9 h-9 rounded-xl border border-[#BBF7D0] object-cover"
                />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                    Install AP Tournament
                  </h3>
                  <p className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider">
                    Android & Web PWA Experience
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
                <p className="flex items-center gap-2 font-semibold text-slate-800">
                  <Share size={15} className="text-[#16A34A] shrink-0" />
                  1. Tap the <strong>Share</strong> button in Safari toolbar.
                </p>
                <p className="flex items-center gap-2 font-semibold text-slate-800">
                  <PlusSquare size={15} className="text-[#16A34A] shrink-0" />
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
                <p className="flex items-start gap-2 font-semibold text-slate-800">
                  <Smartphone size={15} className="text-[#16A34A] shrink-0 mt-0.5" />
                  <span>
                    1. Open Chrome menu (<strong>⋮</strong> at top-right on Android).
                  </span>
                </p>
                <p className="flex items-start gap-2 font-semibold text-slate-800">
                  <Download size={15} className="text-[#16A34A] shrink-0 mt-0.5" />
                  <span>
                    2. Tap <strong>Add to Home screen</strong> &gt; <strong>Install</strong> to launch AP Tournament like a native app.
                  </span>
                </p>
                <p className="flex items-start gap-2 text-[11px] text-[#16A34A] font-semibold bg-[#ECFDF5] p-2.5 rounded-xl border border-[#BBF7D0]">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                  <span>Fully configured for PWA installation & Android TWA packaging.</span>
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 w-full min-h-[44px] rounded-2xl bg-[#16A34A] hover:bg-[#15803D] py-3 text-xs font-black uppercase tracking-wider text-white transition-all cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
