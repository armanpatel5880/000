import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'button' | 'card';
  onInstalled?: () => void;
  onDismiss?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'button',
  onInstalled,
  onDismiss
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Suppress if already running in standalone installed Android/PWA mode
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok && onInstalled) onInstalled();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'card' ? (
        <div className="w-full p-3.5 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-between gap-2.5 text-left shadow-2xs">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 flex items-center justify-between gap-3 min-w-0 cursor-pointer active:scale-[0.99] transition-transform text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/pwa-192x192.png"
                alt="AP Tournament"
                className="w-10 h-10 rounded-xl border border-[#BBF7D0] shrink-0 object-cover shadow-2xs"
              />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-tight text-slate-900 truncate">
                  Install Android App
                </p>
                <p className="text-[10px] font-semibold text-[#16A34A] truncate">
                  Home screen icon, fullscreen & live match alerts
                </p>
              </div>
            </div>
            <span className="min-h-[36px] px-3 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-xs">
              <Download size={12} />
              <span>Install</span>
            </span>
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss install banner"
              className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white/70 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <Download size={14} />
          <span>Install App</span>
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
                    Android App Mode · Alerts & Fast Launch
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
                    2. Tap <strong>Add to Home screen</strong> &gt; <strong>Install</strong> to install AP Tournament as an Android app!
                  </span>
                </p>
                <p className="flex items-start gap-2 text-[11px] text-[#16A34A] font-semibold bg-[#ECFDF5] p-2.5 rounded-xl border border-[#BBF7D0]">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                  <span>Also ready for Android APK / Play Store TWA packaging with manifest & assetlinks.json.</span>
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
};
