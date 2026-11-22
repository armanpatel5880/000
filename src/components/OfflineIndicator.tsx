import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full bg-amber-500 px-4 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-lg">
      <WifiOff size={13} />
      <span>Offline Mode — Reconnecting...</span>
    </div>
  );
};
