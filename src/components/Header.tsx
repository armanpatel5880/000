import { Shield, Wallet } from 'lucide-react';
import { Page, User } from '../types';
import SafeImage, { APP_LOGO } from './SafeImage';
import { auth } from '../lib/firebase';
import { hasAdminPanelAccess, isFullAdmin } from '../utils/adminPermissions';

interface HeaderProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function Header({ user, onPageChange }: HeaderProps) {
  const totalBalance = (user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0);
  const canOpenAdminPanel = hasAdminPanelAccess(user, auth.currentUser?.email, auth.currentUser?.uid);
  const isAdminUser = isFullAdmin(user, auth.currentUser?.email, auth.currentUser?.uid);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md py-3 border-b border-emerald-200/90 shadow-[0_2px_15px_rgba(22,163,74,0.06)]">
      <div className="flex items-center justify-between px-4 sm:px-5 max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          <div 
            onClick={() => onPageChange(Page.PROFILE)}
            className="w-10 h-10 rounded-xl overflow-hidden cursor-pointer border-2 border-[#16A34A] bg-emerald-50 shadow-xs active:scale-95 transition-all"
          >
            <SafeImage 
              src={APP_LOGO} 
              alt="Logo" 
              className="w-full h-full"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[9px] text-emerald-700 font-extrabold uppercase tracking-widest leading-none">Server Online</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
            </div>
            <h1 className="text-base sm:text-lg font-black tracking-tight uppercase leading-none text-slate-900">
              AP <span className="text-[#16A34A]">Tournament</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {canOpenAdminPanel && (
            <button
              onClick={() => onPageChange(Page.ADMIN)}
              className="flex items-center gap-1 bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] px-2.5 py-2 rounded-xl text-[#16A34A] shadow-2xs active:scale-95 transition-all cursor-pointer"
              title={isAdminUser ? 'Open Admin Panel' : 'Open Staff Panel'}
            >
              <Shield size={14} />
              <span className="text-[10px] font-black uppercase tracking-wider">
                {isAdminUser ? 'Admin' : 'Staff'}
              </span>
            </button>
          )}
          <button 
            onClick={() => onPageChange(Page.WALLET)}
            className="flex items-center gap-2 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:brightness-105 border border-emerald-600 px-3.5 py-1.5 rounded-xl text-white shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <span className="text-white font-extrabold text-sm tabular-nums">
              ₹{totalBalance.toLocaleString()}
            </span>
            <div className="p-1 bg-white/20 rounded-lg text-white">
              <Wallet size={13} />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
