import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Page, User } from '../types';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import SafeImage, { APP_LOGO_CIRCLE } from './SafeImage';

interface HomeHeaderProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
  onOpenNotifications?: () => void;
}

export default function HomeHeader({ user, onPageChange, onOpenNotifications }: HomeHeaderProps) {
  const displayName = user?.username || 'AP Tournament';
  const totalBalance = (user?.wallet?.deposit || 0) + (user?.wallet?.winnings || 0);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), limit(15));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!user?.id) {
        setUnreadCount(snapshot.size);
        return;
      }
      let unread = 0;
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (!data.readBy || !data.readBy.includes(user.id)) {
          unread++;
        }
      });
      setUnreadCount(unread);
    }, () => {});

    return () => unsub();
  }, [user?.id]);

  return (
    <header className="px-4 sm:px-5 pt-3 pb-2.5 bg-white/95 backdrop-blur-md sticky top-0 z-30 border-b border-emerald-200/90 shadow-[0_2px_15px_rgba(22,163,74,0.06)]">
      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-emerald-50/90 via-white to-emerald-50/90 border border-emerald-200/90 rounded-2xl px-3.5 py-2 shadow-xs">
        {/* Left: Circular Avatar / AP Tournament Gaming Logo Badge */}
        <div 
          onClick={() => onPageChange(Page.PROFILE)}
          className="flex items-center cursor-pointer active:scale-95 transition-transform shrink-0"
        >
          <div className="w-10 h-10 rounded-full bg-white p-0.5 border-2 border-[#16A34A] shadow-xs flex items-center justify-center overflow-hidden">
            <SafeImage src={APP_LOGO_CIRCLE} alt="Logo" className="w-full h-full rounded-full" />
          </div>
        </div>

        {/* Center: Welcome Back & User Name */}
        <div className="text-center flex-1 px-1 min-w-0">
          <p className="text-[10px] sm:text-xs font-bold text-emerald-700/80 tracking-tight leading-tight">
            Welcome Back,
          </p>
          <h1 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight leading-tight truncate max-w-[180px] mx-auto mt-0.5">
            {displayName}
          </h1>
        </div>

        {/* Right: Notifications Bell + Emerald Cash Balance Pill */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenNotifications && (
            <button
              onClick={onOpenNotifications}
              className="relative w-9 h-9 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center active:scale-95 transition-all shadow-2xs cursor-pointer"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={16} className="text-[#16A34A]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#16A34A] text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:brightness-105 text-white border border-emerald-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-[10px] leading-none shrink-0 select-none">
              ₹
            </div>
            <span className="text-xs sm:text-sm font-black text-white tracking-tight tabular-nums">
              {totalBalance.toFixed(2)}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
