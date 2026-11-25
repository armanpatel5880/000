import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  User as UserIcon,
  Wallet,
  Gamepad2,
  ShoppingCart,
  BarChart2,
  Gift,
  Headphones,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { Page, User } from '../types';
import SupportModal from '../components/SupportModal';
import RulesModal from '../components/RulesModal';
import MyOrdersModal from '../components/MyOrdersModal';
import SafeImage, { APP_LOGO_CIRCLE } from '../components/SafeImage';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { auth } from '../lib/firebase';
import { countEnabledStaffPermissions, hasAdminPanelAccess, isFullAdmin } from '../utils/adminPermissions';
import {
  arePushNotificationsLocallyEnabled,
  getNotificationPermissionState,
  NotificationPermissionState,
  requestMobileNotificationPermission,
  setPushNotificationsPreference,
  triggerMobileStatusBarNotification
} from '../utils/mobileNotificationHelper';

interface ProfilePageProps {
  user: User;
  onPageChange: (page: Page, param?: string) => void;
  onLogout: () => void;
}

export default function ProfilePage({ user, onPageChange, onLogout }: ProfilePageProps) {
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [showNotifBlockedModal, setShowNotifBlockedModal] = useState(false);
  const [isRequestingNotif, setIsRequestingNotif] = useState(false);
  const [testAlertSent, setTestAlertSent] = useState(false);
  const [permState, setPermState] = useState<NotificationPermissionState>(() =>
    getNotificationPermissionState()
  );
  const [pushEnabled, setPushEnabled] = useState(() => {
    const p = getNotificationPermissionState();
    if (p === 'denied') return false;
    return arePushNotificationsLocallyEnabled() && user?.notificationsEnabled !== false;
  });

  const handleTogglePush = async () => {
    if (isRequestingNotif) return;

    const currentPerm = getNotificationPermissionState();
    setPermState(currentPerm);

    if (!pushEnabled || currentPerm !== 'granted') {
      if (currentPerm === 'denied') {
        setShowNotifBlockedModal(true);
        return;
      }
      setIsRequestingNotif(true);
      try {
        const result = await requestMobileNotificationPermission(user?.id);
        setPermState(result);
        if (result === 'granted') {
          setPushEnabled(true);
          await setPushNotificationsPreference(true, user?.id);
        } else if (result === 'denied') {
          setPushEnabled(false);
          setShowNotifBlockedModal(true);
        }
      } finally {
        setIsRequestingNotif(false);
      }
      return;
    }

    setPushEnabled(false);
    await setPushNotificationsPreference(false, user?.id);
  };

  const handleSendTestAlert = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await triggerMobileStatusBarNotification(
      'AP Tournament • Notifications Working!',
      'You will receive live Room ID, Password, and match start alerts on your device.',
      { tag: 'profile-test-alert' }
    );
    setTestAlertSent(true);
    setTimeout(() => setTestAlertSent(false), 3000);
  };

  const isAdminUser = isFullAdmin(user, auth.currentUser?.email, auth.currentUser?.uid);
  const canOpenAdminPanel = hasAdminPanelAccess(user, auth.currentUser?.email, auth.currentUser?.uid);
  const enabledStaffSections = countEnabledStaffPermissions(user?.staffPermissions);

  const totalBalance =
    (user?.wallet?.deposit || 0) + (user?.wallet?.winnings || 0);

  const displayName = user?.username || 'mps07';
  const matchesPlayed = user?.stats?.matchesPlayed || 0;
  const totalKills = user?.stats?.totalKills || 0;
  const amountWon = user?.stats?.totalWinnings || 0;

  return (
    <div className="min-h-screen bg-[#F2FBF6] text-slate-900 pb-24 select-none relative overflow-hidden border-x border-emerald-200/60">
      <div className="relative z-10">
        {/* 1. Header */}
        <header className="bg-white/95 backdrop-blur-md px-4 sm:px-5 pt-3.5 pb-3 border-b border-emerald-200/90 shadow-[0_2px_15px_rgba(22,163,74,0.06)]">
          <div className="flex items-center justify-between">
            {/* Left: Circular AP Tournament Gaming Logo Badge */}
            <div
              onClick={() => onPageChange(Page.HOME)}
              className="flex items-center cursor-pointer active:scale-95 transition-transform"
            >
              <div className="w-11 h-11 rounded-full bg-white p-0.5 border-2 border-[#16A34A] shadow-xs flex items-center justify-center overflow-hidden">
                <SafeImage src={APP_LOGO_CIRCLE} alt="Logo" className="w-full h-full" />
              </div>
            </div>

            {/* Center: Welcome Back & User Name */}
            <div className="text-center flex-1 px-2">
              <p className="text-[11px] sm:text-xs font-bold text-emerald-700/80 tracking-tight leading-tight">
                Welcome Back,
              </p>
              <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-wide leading-tight truncate max-w-[200px] mx-auto mt-0.5">
                {displayName}
              </h1>
            </div>

            {/* Right: Balance Card Pill */}
            <button
              onClick={() => onPageChange(Page.WALLET)}
              className="bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:brightness-105 text-white border border-emerald-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-[10px] leading-none shrink-0 select-none">
                ₹
              </div>
              <span className="text-xs sm:text-sm font-black text-white tracking-tight tabular-nums">
                {totalBalance.toFixed(2)}
              </span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="px-4 sm:px-5 pt-6 pb-4">
          {/* 2. Large Circular Profile Emblem */}
          <div className="flex flex-col items-center justify-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-white border-2 border-[#16A34A] shadow-sm flex items-center justify-center overflow-hidden relative group"
            >
              <SafeImage src={APP_LOGO_CIRCLE} alt="Logo" className="w-full h-full" />
            </motion.div>

            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mt-3 mb-4">
              {displayName}
            </h2>
          </div>

          {/* 3. White Stats Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs mb-5"
          >
            <div className="grid grid-cols-3 divide-x divide-slate-200">
              <div className="text-center px-1">
                <p className="text-lg sm:text-xl font-black text-[#16A34A] tracking-tight leading-none mb-1.5 tabular-nums">
                  {matchesPlayed}
                </p>
                <p className="text-[11px] sm:text-xs font-semibold text-slate-500 leading-tight">
                  Matches<br />Played
                </p>
              </div>

              <div className="text-center px-1">
                <p className="text-lg sm:text-xl font-black text-[#16A34A] tracking-tight leading-none mb-1.5 tabular-nums">
                  {totalKills}
                </p>
                <p className="text-[11px] sm:text-xs font-semibold text-slate-500 leading-tight">
                  Total<br />Killed
                </p>
              </div>

              <div className="text-center px-1">
                <div className="flex items-center justify-center gap-1.5 leading-none mb-1.5">
                  <div className="w-4 h-4 rounded-full bg-[#16A34A] flex items-center justify-center text-white text-[9px] font-black">
                    ₹
                  </div>
                  <p className="text-lg sm:text-xl font-black text-[#16A34A] tracking-tight leading-none tabular-nums">
                    {amountWon}
                  </p>
                </div>
                <p className="text-[11px] sm:text-xs font-semibold text-slate-500 leading-tight">
                  Amount<br />Won
                </p>
              </div>
            </div>
          </motion.div>

          {/* 4. Menu Cards List */}
          <div className="space-y-2.5">
            {/* Admin / Staff Panel Quick Access (Top Position) */}
            {canOpenAdminPanel && (
              <button
                onClick={() => onPageChange(Page.ADMIN)}
                className="w-full bg-[#ECFDF5] hover:bg-emerald-100 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-[#BBF7D0] shadow-xs group transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0 text-left">
                  <div className="text-[#16A34A] shrink-0">
                    <ShieldAlert size={20} className="stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-black text-[#16A34A] tracking-tight block truncate">
                      {isAdminUser ? 'Admin Control Panel' : 'Staff Admin Panel'}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700/80 block truncate">
                      {isAdminUser
                        ? 'Full Access • All Sections & Staff Management'
                        : `${enabledStaffSections} / 11 Sections Enabled • Tap to Open`}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-[#16A34A] group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            )}

            {/* Android App Install Card (Automatically hides when installed) */}
            <PWAInstallButton variant="card" />

            {/* Card 1: Push Notification with Real Android/Browser Permission */}
            <div className="bg-white rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="text-[#16A34A] shrink-0">
                  <Bell size={20} />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-bold text-slate-900 tracking-tight block">
                    Push Notification
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 block truncate">
                    {permState === 'denied'
                      ? 'Blocked in Device Settings — Tap to fix'
                      : permState === 'granted' && pushEnabled
                      ? 'Permission Allowed · Match alerts active'
                      : 'Tap switch to allow Android notifications'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {permState === 'granted' && pushEnabled && (
                  <button
                    type="button"
                    onClick={handleSendTestAlert}
                    className="px-2.5 py-1 rounded-lg bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-emerald-100 transition-colors"
                  >
                    {testAlertSent ? 'Sent!' : 'Test'}
                  </button>
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushEnabled && permState === 'granted'}
                  disabled={isRequestingNotif}
                  onClick={handleTogglePush}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer disabled:opacity-60 ${
                    pushEnabled && permState === 'granted' ? 'bg-[#16A34A]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-300 ${
                      pushEnabled && permState === 'granted' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

             {/* Card 2: My Profile */}
            <button
              onClick={() => onPageChange(Page.PROFILE_DETAILS)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <UserIcon size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  My Profile
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 3: My Wallet */}
            <button
              onClick={() => onPageChange(Page.WALLET)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <Wallet size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  My Wallet
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 4: My Matches */}
            <button
              onClick={() => onPageChange(Page.TOURNAMENTS)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <Gamepad2 size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  My Matches
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 5: My Order */}
            <button
              onClick={() => setIsOrdersOpen(true)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <ShoppingCart size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  My Order
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

             {/* Card 6: My Statistics */}
            <button
              onClick={() => onPageChange(Page.GAME_STATS)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <BarChart2 size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  My Statistics
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 7: My Rewards */}
            <button
              onClick={() => onPageChange(Page.REFERRAL)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <Gift size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  My Rewards
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 8: Customer Support */}
            <button
              onClick={() => setIsSupportOpen(true)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <Headphones size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  Customer Support
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 9: Rules & Game Regulations */}
            <button
              onClick={() => setIsRulesOpen(true)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <ShieldCheck size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  Rules & Game Regulations
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 9b: Fair Play Policy */}
            <button
              onClick={() => onPageChange(Page.FAIR_PLAY_POLICY)}
              className="w-full bg-white hover:bg-red-50/40 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-red-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-red-600">
                  <ShieldAlert size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  Fair Play & Anti-Cheat Policy
                </span>
              </div>
              <ChevronRight size={18} className="text-red-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Card 9c: Refund & Cancellation */}
            <button
              onClick={() => onPageChange(Page.REFUND_POLICY)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <ShieldCheck size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  Refund & Cancellation Policy
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 9d: Privacy Policy */}
            <button
              onClick={() => onPageChange(Page.PRIVACY_POLICY)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <ShieldCheck size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  Privacy Policy
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 9e: Terms of Service */}
            <button
              onClick={() => onPageChange(Page.TERMS)}
              className="w-full bg-white hover:bg-slate-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-[#16A34A]">
                  <ShieldCheck size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-slate-900 tracking-tight">
                  Terms of Service
                </span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:text-[#16A34A] group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Card 11: Log Out */}
            <button
              onClick={() => setIsLogoutDialogOpen(true)}
              className="w-full bg-red-50/70 hover:bg-red-50 rounded-xl sm:rounded-2xl px-4 py-3.5 flex items-center justify-between border border-red-200 shadow-2xs group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="text-red-600">
                  <LogOut size={20} className="stroke-[2.2]" />
                </div>
                <span className="text-sm font-bold text-red-600 tracking-tight">
                  Log Out
                </span>
              </div>
              <ChevronRight size={18} className="text-red-500 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <p className="mt-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            AP Tournament Esports • v3.2.0
          </p>
        </div>
      </div>

      {/* Modals */}
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <RulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
        section="Battle Royale & Esports Fair Play"
        onJoin={() => setIsRulesOpen(false)}
        isJoined={true}
      />
      <MyOrdersModal
        isOpen={isOrdersOpen}
        onClose={() => setIsOrdersOpen(false)}
        user={user}
        onPageChange={onPageChange}
      />

      {/* Logout Confirmation Dialog */}
      <AnimatePresence>
        {isLogoutDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogoutDialogOpen(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl z-10 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3 border border-red-200">
                <LogOut size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Log Out of AP Tournament?</h3>
              <p className="text-xs text-slate-600 mb-5">
                Are you sure you want to log out of your gaming account?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsLogoutDialogOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsLogoutDialogOpen(false);
                    onLogout();
                  }}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  Yes, Log Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Notification Permission Blocked Helper Modal */}
      <AnimatePresence>
        {showNotifBlockedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifBlockedModal(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl z-10"
            >
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 border border-amber-200">
                <Bell size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-900 text-center mb-1.5">
                Enable Notification Permission
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Notifications are currently blocked by your Android device or browser settings:
              </p>
              <ol className="text-xs text-slate-700 space-y-2 mb-5 list-decimal pl-4 font-medium">
                <li>Tap the <strong>Lock / Site Settings</strong> icon near the top bar (or open Android <strong>Settings &gt; Apps &gt; AP Tournament</strong>).</li>
                <li>Open <strong>Permissions &gt; Notifications</strong> and switch it to <strong>Allow</strong>.</li>
                <li>Reload the app to receive instant Room ID & Password alerts.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowNotifBlockedModal(false)}
                className="w-full min-h-[44px] py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-xs rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Got It
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
