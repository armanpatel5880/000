import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  Wallet,
  Trophy,
  Gift,
  HelpCircle,
  ShieldCheck,
  BarChart3,
  PlusCircle,
  ArrowDownToLine,
  Shield,
  ChevronRight,
  Bell
} from 'lucide-react';
import { Page, User as UserType } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { countEnabledStaffPermissions, hasAdminPanelAccess, isFullAdmin } from '../utils/adminPermissions';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserType | null;
  onPageChange: (page: Page, param?: string) => void;
  onOpenRules?: () => void;
  onOpenSupport?: () => void;
  onOpenNotifications?: () => void;
}

export default function MenuDrawer({
  isOpen,
  onClose,
  user,
  onPageChange,
  onOpenRules,
  onOpenSupport,
  onOpenNotifications
}: MenuDrawerProps) {
  const menuItems = [
    {
      id: 'profile',
      label: 'My Profile & IGN',
      desc: 'Update Free Fire IGN and profile info',
      icon: User,
      color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
      action: () => {
        onClose();
        onPageChange(Page.PROFILE);
      }
    },
    {
      id: 'notifications',
      label: 'Notifications & Alerts',
      desc: 'Official updates, room alerts & offers',
      icon: Bell,
      color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
      action: () => {
        onClose();
        if (onOpenNotifications) {
          onOpenNotifications();
        }
      }
    },
    {
      id: 'wallet',
      label: 'Wallet & Passbook',
      desc: 'Check deposits, winnings and transactions',
      icon: Wallet,
      color: 'bg-emerald-50 text-[#16A34A] border-emerald-200',
      action: () => {
        onClose();
        onPageChange(Page.WALLET);
      }
    },
    {
      id: 'add_money',
      label: 'Add Cash',
      desc: 'Instant QR / UPI Deposit',
      icon: PlusCircle,
      color: 'bg-emerald-50 text-[#16A34A] border-emerald-200',
      action: () => {
        onClose();
        onPageChange(Page.ADD_MONEY);
      }
    },
    {
      id: 'withdraw',
      label: 'Withdraw Cash',
      desc: 'Withdraw match winnings directly to UPI',
      icon: ArrowDownToLine,
      color: 'bg-emerald-50 text-[#16A34A] border-emerald-200',
      action: () => {
        onClose();
        onPageChange(Page.WITHDRAW);
      }
    },
    {
      id: 'tournaments',
      label: 'Esports Tournaments',
      desc: 'Browse CS, BR & Lone Wolf rooms',
      icon: Trophy,
      color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
      action: () => {
        onClose();
        onPageChange(Page.TOURNAMENTS);
      }
    },
    {
      id: 'stats',
      label: 'My Career & Stats',
      desc: 'Track kills, wins and matches history',
      icon: BarChart3,
      color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
      action: () => {
        onClose();
        onPageChange(Page.GAME_STATS);
      }
    },
    {
      id: 'referral',
      label: 'Refer & Earn',
      desc: 'Invite friends & earn ₹50 bonus cash',
      icon: Gift,
      color: 'bg-emerald-50 text-[#16A34A] border-emerald-200',
      action: () => {
        onClose();
        onPageChange(Page.REFERRAL);
      }
    },
    {
      id: 'rules',
      label: 'Match Rules & FairPlay',
      desc: 'Tournament rules, bans and guidelines',
      icon: ShieldCheck,
      color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
      action: () => {
        onClose();
        if (onOpenRules) onOpenRules();
      }
    },
    {
      id: 'support',
      label: 'Customer Support',
      desc: '24/7 WhatsApp & Telegram assistance',
      icon: HelpCircle,
      color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
      action: () => {
        onClose();
        if (onOpenSupport) onOpenSupport();
      }
    },
    ...(hasAdminPanelAccess(user) ? [{
      id: 'admin',
      label: isFullAdmin(user) ? 'Admin Control Panel' : 'Staff Admin Panel',
      desc: isFullAdmin(user)
        ? 'Create matches, manage users & payments'
        : `Authorized access (${countEnabledStaffPermissions(user?.staffPermissions)}/11 sections)`,
      icon: Shield,
      color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
      action: () => {
        onClose();
        onPageChange(Page.ADMIN);
      }
    }] : [])
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0">
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
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="relative w-full max-w-lg bg-white border-t border-slate-200 rounded-t-[2.25rem] p-6 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10 text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                  <Shield size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                    AP TOURNAMENT
                  </h3>
                  <p className="text-[10px] font-bold text-[#16A34A] uppercase tracking-widest">
                    Quick Navigation Menu
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Menu List */}
            <div className="mt-4 space-y-2 overflow-y-auto custom-scrollbar pr-1 flex-1">
              <PWAInstallButton variant="card" onInstalled={onClose} />
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className="w-full p-3.5 rounded-2xl bg-slate-50/70 hover:bg-[#ECFDF5]/50 border border-slate-200 hover:border-[#16A34A]/40 flex items-center justify-between transition-all group active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${item.color}`}>
                        <Icon size={18} />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-xs font-extrabold uppercase tracking-tight text-slate-900 group-hover:text-[#16A34A] transition-colors truncate">
                          {item.label}
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium truncate">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    <ChevronRight size={16} className="text-slate-400 group-hover:text-[#16A34A] transition-colors shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>

            {/* Close Button */}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <button
                onClick={onClose}
                className="w-full py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer"
              >
                Close Menu
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
