import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, X, ShieldCheck, Gift, Trophy, ArrowRight, 
  Key, Zap, Wallet, Smartphone, CheckCircle2, Clock, Flame, ExternalLink
} from 'lucide-react';
import { Page, AppNotification, User } from '../types';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';
import SafeImage from './SafeImage';
import { requestMobileNotificationPermission, triggerMobileStatusBarNotification } from '../utils/mobileNotificationHelper';
import { dispatchSimulatedMatchAlert } from '../utils/matchAlertHelper';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPageChange: (page: Page, id?: string) => void;
  user?: User | null;
  joinedMatchIds?: string[];
}

export default function NotificationsModal({ 
  isOpen, 
  onClose, 
  onPageChange,
  user,
  joinedMatchIds = []
}: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const joinedMatchIdsRef = React.useRef<string[]>(joinedMatchIds);
  joinedMatchIdsRef.current = joinedMatchIds;

  useModalBackHandler(isOpen, onClose);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'notifications'),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        const snapshot = await getDocs(q);
        if (!isMounted) return;

        const list = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as AppNotification));

        const currentJoinedIds = joinedMatchIdsRef.current;
        const filtered = list.filter(item => {
          if (!item.audience || item.audience === 'all') return true;
          if (item.audience === 'match' && item.targetMatchId) {
            return currentJoinedIds.includes(item.targetMatchId);
          }
          if (item.audience === 'user' && item.targetUserId) {
            return item.targetUserId === user.id;
          }
          return true;
        });

        setNotifications(filtered);
      } catch (err) {
        console.error('Error fetching notifications:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, [isOpen, user?.id]);

  const handleEnableMobileNotifications = async () => {
    setIsRequestingPermission(true);
    try {
      const perm = await requestMobileNotificationPermission(user?.id);
      setPermissionStatus(perm);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const [matchAlertSimulated, setMatchAlertSimulated] = useState(false);

  const handleSendTestNotification = async () => {
    await triggerMobileStatusBarNotification(
      'AP Tournament • Free Fire Match Alert!',
      'Room ID: 893412 • Pass: 1234 | Match starts in 10 minutes!',
      { tag: 'test-mobile-bar-alert' }
    );
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleSimulate15MinAlert = () => {
    dispatchSimulatedMatchAlert();
    setMatchAlertSimulated(true);
    setTimeout(() => setMatchAlertSimulated(false), 3000);
  };

  const handleMarkAsRead = async (notifId?: string) => {
    if (!notifId || !user?.id) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notifId
          ? { ...n, readBy: Array.from(new Set([...(n.readBy || []), user.id!])) }
          : n
      )
    );
    try {
      await updateDoc(doc(db, 'notifications', notifId), {
        readBy: arrayUnion(user.id)
      });
    } catch (e) {
      console.error('Could not mark as read:', e);
    }
  };

  const getIconAndStyle = (type?: string) => {
    switch (type) {
      case 'room_creds':
        return {
          icon: Key,
          color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
          badge: 'Room Credentials'
        };
      case 'tournament':
        return {
          icon: Trophy,
          color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
          badge: 'Tournament Alert'
        };
      case 'offer':
        return {
          icon: Gift,
          color: 'bg-emerald-50 text-[#16A34A] border-emerald-200',
          badge: 'Exclusive Offer'
        };
      case 'wallet':
        return {
          icon: Wallet,
          color: 'bg-emerald-50 text-[#16A34A] border-emerald-200',
          badge: 'Wallet / Cash'
        };
      case 'fairplay':
        return {
          icon: ShieldCheck,
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          badge: 'FairPlay Notice'
        };
      case 'alert':
      default:
        return {
          icon: Zap,
          color: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
          badge: 'Announcement'
        };
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const displayItems = notifications.length > 0 ? notifications : [
    {
      id: 'default_1',
      title: 'Grand Free Fire Championship',
      message: 'Join our daily Mega Clash Squad & Battle Royale tournaments. Instant room credentials and guaranteed prize distribution.',
      type: 'tournament' as const,
      audience: 'all' as const,
      actionPage: Page.TOURNAMENTS,
      actionText: 'View Arena',
      createdAt: null
    },
    {
      id: 'default_2',
      title: 'FairPlay & Anti-Cheat Active',
      message: 'All custom rooms are strictly monitored. Emulators, hacks and config files result in immediate permanent ban.',
      type: 'fairplay' as const,
      audience: 'all' as const,
      actionPage: undefined,
      actionText: undefined,
      createdAt: null
    },
    {
      id: 'default_3',
      title: 'Refer & Earn ₹50 Bonus Cash',
      message: 'Invite your Free Fire squad to AP TOURNAMENT and earn instant cash rewards on every deposit.',
      type: 'offer' as const,
      audience: 'all' as const,
      actionPage: Page.REFERRAL,
      actionText: 'Invite Friends',
      createdAt: null
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white border border-slate-200 rounded-[2rem] p-5 sm:p-6 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                  <Bell size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 flex items-center gap-1.5">
                    Notifications
                    {notifications.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#16A34A] text-[10px] font-bold border border-[#BBF7D0] tabular-nums">
                        {notifications.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider">
                    Official Updates & Alerts
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

            {/* Alert Control Cards */}
            <div className="mt-3 space-y-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A] shrink-0">
                    <Smartphone size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">
                      Mobile Notification Bar
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">
                      {permissionStatus === 'granted' 
                        ? 'Active • Alerts appear in phone status bar' 
                        : 'Disabled • Tap to enable status bar alerts'}
                    </p>
                  </div>
                </div>

                {permissionStatus === 'granted' ? (
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-[#16A34A] hover:bg-emerald-100 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 size={11} />
                    <span>{testSent ? 'Sent!' : 'Test Bar'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnableMobileNotifications}
                    disabled={isRequestingPermission}
                    className="px-3 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl text-[10px] uppercase tracking-wider shadow-xs transition-all shrink-0 active:scale-95 cursor-pointer"
                  >
                    {isRequestingPermission ? '...' : 'Enable'}
                  </button>
                )}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A] shrink-0">
                    <Flame size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">
                      15-Min Match Start Alert
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">
                      Toast & audio alert sent 15 mins before match starts
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSimulate15MinAlert}
                  className="px-2.5 py-1.5 bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] text-[#16A34A] rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <Clock size={11} />
                  <span>{matchAlertSimulated ? 'Triggered!' : 'Test 15m Alert'}</span>
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="mt-3 space-y-2.5 overflow-y-auto custom-scrollbar pr-0.5 relative z-10 flex-1">
              {displayItems.map((item) => {
                const style = getIconAndStyle(item.type);
                const Icon = style.icon;
                const isRead = user?.id && item.readBy?.includes(user.id);

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition-all relative overflow-hidden ${
                      isRead 
                        ? 'bg-slate-50/70 border-slate-200 opacity-85' 
                        : 'bg-white border-slate-200 shadow-2xs hover:border-[#16A34A]/40'
                    }`}
                  >
                    {!isRead && user?.id && item.id && !item.id.startsWith('default') && (
                      <div className="absolute top-3 right-3 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                      </div>
                    )}

                    {item.imageUrl && (
                      <div className="mb-3 rounded-xl overflow-hidden border border-slate-200 max-h-40 bg-slate-50">
                        <SafeImage 
                          src={item.imageUrl} 
                          alt={item.title || 'Notification Attachment'}
                          className="w-full h-36"
                          imgClassName="w-full h-36 object-cover"
                        />
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${style.color}`}>
                        <Icon size={16} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap pr-4">
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${style.color}`}>
                            {style.badge}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-400">
                            {formatTimeAgo(item.createdAt)}
                          </span>
                        </div>

                        <h4 className="text-xs font-black text-slate-900 leading-tight tracking-tight">
                          {item.title}
                        </h4>

                        <p className="text-[11px] text-slate-600 leading-relaxed font-normal mt-1 whitespace-pre-line">
                          {item.message}
                        </p>

                        {item.targetMatchTitle && (
                          <div className="mt-2 text-[9px] font-bold text-[#16A34A] bg-[#ECFDF5] px-2 py-1 rounded-lg border border-[#BBF7D0] inline-block">
                            🎮 Match: {item.targetMatchTitle}
                          </div>
                        )}

                        {(item.actionPage || item.actionUrl || item.actionText) && (
                          <div className="mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
                            <button
                              onClick={() => {
                                handleMarkAsRead(item.id);
                                onClose();
                                if (item.actionUrl) {
                                  window.open(item.actionUrl, '_blank');
                                } else if (item.actionPage) {
                                  onPageChange(item.actionPage as Page, item.targetMatchId);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#16A34A] hover:text-[#15803D] transition-colors cursor-pointer"
                            >
                              <span>{item.actionText || 'Open Details'}</span>
                              {item.actionUrl ? <ExternalLink size={11} /> : <ArrowRight size={12} />}
                            </button>

                            {!isRead && user?.id && item.id && !item.id.startsWith('default') && (
                              <button
                                onClick={() => handleMarkAsRead(item.id)}
                                className="text-[9px] font-bold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                              >
                                Mark as Read
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Footer */}
            <div className="mt-3.5 pt-3 border-t border-slate-200 flex gap-2">
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-xs active:scale-[0.98] cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
