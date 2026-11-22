import React from 'react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { Home as HomeIcon, Wallet, Zap, User as UserIcon } from 'lucide-react';
import { Page, User } from '../types';

interface BottomNavProps {
  currentPage?: Page;
  onPageChange: (page: Page, param?: string) => void;
  user?: User | null;
  onOpenRules?: () => void;
  onOpenSupport?: () => void;
}

export default function BottomNav({
  onPageChange
}: BottomNavProps) {
  const location = useLocation();

  const tabs = [
    {
      id: 'home',
      label: 'Home',
      icon: HomeIcon,
      path: '/home',
      page: Page.HOME
    },
    {
      id: 'wallet',
      label: 'Wallet',
      icon: Wallet,
      path: '/wallet',
      page: Page.WALLET
    },
    {
      id: 'earn',
      label: 'Earn',
      icon: Zap,
      path: '/referral',
      page: Page.REFERRAL
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: UserIcon,
      path: '/profile',
      page: Page.PROFILE
    }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-emerald-200/90 pb-safe z-40 shadow-[0_-4px_25px_rgba(22,163,74,0.08)] select-none">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2 sm:px-4">
        {tabs.map((tab) => {
          const isHome = tab.id === 'home';
          const isActive = isHome
            ? location.pathname === '/' ||
              location.pathname.startsWith('/home') ||
              location.pathname.startsWith('/game-modes') ||
              location.pathname.startsWith('/tournaments')
            : location.pathname.startsWith(tab.path);

          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onPageChange(tab.page)}
              className={`relative flex flex-col items-center justify-center w-full h-full min-h-[44px] transition-all group cursor-pointer ${
                isActive ? 'text-[#16A34A]' : 'text-slate-400 hover:text-emerald-700'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeBottomTab"
                  className="absolute top-0 w-9 h-0.5 bg-[#16A34A] rounded-full shadow-[0_2px_8px_rgba(22,163,74,0.5)]"
                />
              )}
              <div className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
                isActive ? 'bg-emerald-50/90 border border-emerald-200/80' : ''
              }`}>
                <div className="mb-0.5 transition-transform group-active:scale-90">
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={
                      isActive
                        ? 'text-[#16A34A]'
                        : 'text-slate-400 group-hover:text-emerald-600 transition-colors'
                    }
                  />
                </div>
                <span
                  className={`text-[10px] font-extrabold tracking-tight transition-colors ${
                    isActive
                      ? 'text-[#16A34A]'
                      : 'text-slate-500 group-hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
