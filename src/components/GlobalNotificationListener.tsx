import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, X, Key, Trophy, Gift, ShieldCheck, Zap, Wallet, 
  ChevronRight, CheckCircle2, Smartphone, Clock, Flame, 
  Swords, AlertTriangle, ArrowRight, Radio
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, getDocs, query, orderBy, limit, where, documentId, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Page, AppNotification, User, Tournament } from '../types';
import { 
  registerNotificationServiceWorker, 
  requestMobileNotificationPermission, 
  triggerMobileStatusBarNotification 
} from '../utils/mobileNotificationHelper';
import { 
  getMatchRemainingTime, 
  playMatchAlertChime, 
  triggerHapticFeedback, 
  MatchCountdownStatus 
} from '../utils/matchAlertHelper';
import { formatMatchTime } from '../utils/dateUtils';

interface GlobalNotificationListenerProps {
  user?: User | null;
  joinedMatchIds?: string[];
  onPageChange: (page: Page, id?: string) => void;
  onOpenNotificationsModal?: () => void;
}

interface ActiveMatchAlert {
  match: Tournament;
  urgency: '15min' | '5min' | 'started';
  remainingMs: number;
  formattedCountdown: string;
}

export default function GlobalNotificationListener({
  user,
  joinedMatchIds = [],
  onPageChange,
  onOpenNotificationsModal
}: GlobalNotificationListenerProps) {
  // General Firestore Notification popup
  const [activePopup, setActivePopup] = useState<AppNotification | null>(null);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  // 15-Minute Match Start Alert Toast & Dock States
  const [activeMatchToast, setActiveMatchToast] = useState<ActiveMatchAlert | null>(null);
  const [allMatches, setAllMatches] = useState<Tournament[]>([]);
  const [isDockMinimized, setIsDockMinimized] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  const seenNotifIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef<boolean>(false);
  const toastDismissTimerRef = useRef<any>(null);
  const joinedMatchIdsRef = useRef<string[]>(joinedMatchIds);
  joinedMatchIdsRef.current = joinedMatchIds;
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onOpenNotificationsModalRef = useRef(onOpenNotificationsModal);
  onOpenNotificationsModalRef.current = onOpenNotificationsModal;
  const joinedMatchIdsKey = useMemo(() => [...joinedMatchIds].sort().join(','), [joinedMatchIds]);

  // Initialize Service Worker & check permission on mount
  useEffect(() => {
    registerNotificationServiceWorker();

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const dismissed = sessionStorage.getItem('kg_notif_banner_dismissed');
        if (!dismissed) {
          const timer = setTimeout(() => {
            setShowPermissionBanner(true);
          }, 2500);
          return () => clearTimeout(timer);
        }
      }
    }
  }, []);

  // Listen for navigation requests coming from Service Worker notification clicks
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NAVIGATE_FROM_NOTIFICATION') {
        if (event.data.actionPage) {
          onPageChangeRef.current(event.data.actionPage as Page, event.data.targetMatchId);
        } else if (onOpenNotificationsModalRef.current) {
          onOpenNotificationsModalRef.current();
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      };
    }
  }, []);

  // Sync browser notification permission status to Firestore user document
  useEffect(() => {
    if (!user?.id) return;

    if ('Notification' in window && Notification.permission === 'granted') {
      if (!user.fcmEnabled || !user.notificationsEnabled) {
        updateDoc(doc(db, 'users', user.id), {
          fcmEnabled: true,
          notificationsEnabled: true
        }).catch(() => {});
      }
    }
  }, [user?.id, user?.fcmEnabled, user?.notificationsEnabled]);

  // -------------------------------------------------------------
  // Fetch ONLY the user's joined matches (one-time getDocs when authenticated)
  // -------------------------------------------------------------
  useEffect(() => {
    const ids = joinedMatchIdsRef.current;
    if (!user?.id || !ids.length) {
      setAllMatches([]);
      return;
    }

    let isMounted = true;
    const fetchJoinedMatches = async () => {
      try {
        const uniqueIds: string[] = Array.from(new Set<string>(ids.filter(Boolean))).slice(0, 30);
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueIds.length; i += 10) {
          chunks.push(uniqueIds.slice(i, i + 10));
        }

        const results: Tournament[] = [];
        for (const chunk of chunks) {
          const snap = await getDocs(
            query(collection(db, 'matches'), where(documentId(), 'in', chunk), limit(10))
          );
          snap.docs.forEach((d) => {
            results.push({ id: d.id, ...d.data() } as Tournament);
          });
        }

        if (isMounted) {
          setAllMatches(results);
        }
      } catch (err) {
        console.warn('Joined matches alert fetch notice:', err);
      }
    };

    fetchJoinedMatches();

    return () => {
      isMounted = false;
    };
  }, [user?.id, joinedMatchIdsKey]);

  // Filter joined matches that are upcoming or active
  const userJoinedMatches = useMemo(() => {
    if (!joinedMatchIds.length || !allMatches.length) return [];
    return allMatches.filter(m => 
      joinedMatchIds.includes(m.id) && 
      m.status !== 'completed' &&
      Boolean(m.time)
    );
  }, [joinedMatchIds, allMatches]);

  // 1-second interval clock only when user actually has active joined matches or toast open
  useEffect(() => {
    if (userJoinedMatches.length === 0 && !activeMatchToast) return;
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [userJoinedMatches.length, Boolean(activeMatchToast)]);

  // Find the joined match starting soonest within 15 minutes (for the persistent dock)
  const imminentMatch = useMemo(() => {
    let closest: { match: Tournament; status: MatchCountdownStatus } | null = null;
    for (const match of userJoinedMatches) {
      const status = getMatchRemainingTime(match.time);
      if (status.is15MinWindow) {
        if (!closest || status.remainingMs < closest.status.remainingMs) {
          closest = { match, status };
        }
      }
    }
    return closest;
  }, [userJoinedMatches, currentTime]);

  // ----------------------------------------------------------------------------------
  // 15-Minute (and 5-Minute) Match Start Alert Evaluation Loop
  // ----------------------------------------------------------------------------------
  useEffect(() => {
    if (!userJoinedMatches.length) return;

    userJoinedMatches.forEach((match) => {
      const status = getMatchRemainingTime(match.time);
      if (status.remainingMs <= 0) return;

      const matchScheduleTime = new Date(match.time).getTime();
      const storageKey15m = `kg_alert_15m_${match.id}_${matchScheduleTime}`;
      const storageKey5m = `kg_alert_5m_${match.id}_${matchScheduleTime}`;

      // 1. 15-Minute Alert Check
      if (status.is15MinWindow) {
        const alreadyAlerted15m = localStorage.getItem(storageKey15m);
        if (!alreadyAlerted15m) {
          localStorage.setItem(storageKey15m, Date.now().toString());

          // Trigger Native Mobile Status Bar & Lock Screen Notification
          triggerMobileStatusBarNotification(
            `🚨 Match Starting in 15 Mins! #${match.matchNumber || ''} ${match.title || 'Free Fire'}`,
            `Match starts at ${formatMatchTime(match.time)}! Room ID & Password will be revealed shortly. Tap to prepare your squad.`,
            {
              tag: `match-alert-15m-${match.id}`,
              targetMatchId: match.id,
              actionPage: 'match_details',
              icon: '/pwa-192x192.png',
              badge: '/badge-96x96.png'
            }
          );

          // Audio & Haptic feedback
          playMatchAlertChime('15min');
          triggerHapticFeedback([250, 100, 250, 100, 400]);

          // Show prominent In-App Toast
          setActiveMatchToast({
            match,
            urgency: '15min',
            remainingMs: status.remainingMs,
            formattedCountdown: status.formattedCountdown
          });

          // Auto-hide large toast after 14 seconds (dock remains)
          if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
          toastDismissTimerRef.current = setTimeout(() => {
            setActiveMatchToast(null);
          }, 14000);
        }
      }

      // 2. 5-Minute Urgent Final Call Check
      if (status.is5MinWindow) {
        const alreadyAlerted5m = localStorage.getItem(storageKey5m);
        if (!alreadyAlerted5m) {
          localStorage.setItem(storageKey5m, Date.now().toString());

          // Trigger Urgent Mobile Notification
          triggerMobileStatusBarNotification(
            `⚡ URGENT: Match Starts in 5 Mins! #${match.matchNumber || ''} ${match.title || 'Free Fire'}`,
            `Room ID and Password are now active! Enter the custom room immediately to avoid forfeit.`,
            {
              tag: `match-alert-5m-${match.id}`,
              targetMatchId: match.id,
              actionPage: 'match_details',
              icon: '/pwa-192x192.png',
              badge: '/badge-96x96.png'
            }
          );

          // High urgency sound + vibration
          playMatchAlertChime('5min');
          triggerHapticFeedback([300, 100, 300, 100, 500]);

          // Show Urgent In-App Toast
          setActiveMatchToast({
            match,
            urgency: '5min',
            remainingMs: status.remainingMs,
            formattedCountdown: status.formattedCountdown
          });

          if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
          toastDismissTimerRef.current = setTimeout(() => {
            setActiveMatchToast(null);
          }, 14000);
        }
      }
    });
  }, [userJoinedMatches, currentTime]);

  // Update activeMatchToast countdown every second if active
  useEffect(() => {
    if (activeMatchToast?.match) {
      const status = getMatchRemainingTime(activeMatchToast.match.time);
      if (status.remainingMs <= 0) {
        setActiveMatchToast(null);
      } else {
        setActiveMatchToast(prev => prev ? {
          ...prev,
          remainingMs: status.remainingMs,
          formattedCountdown: status.formattedCountdown
        } : null);
      }
    }
  }, [currentTime]);

  // -------------------------------------------------------------
  // Listen for simulated 15-minute alert (for testing and demo)
  // -------------------------------------------------------------
  useEffect(() => {
    const handleSimulateAlert = (event: Event) => {
      const customEvent = event as CustomEvent;
      const match = customEvent.detail?.match as Tournament;
      if (!match) return;

      const status = getMatchRemainingTime(match.time);

      triggerMobileStatusBarNotification(
        `🚨 [TEST] Match Starting in 15 Mins! #${match.matchNumber || ''} ${match.title}`,
        `Your Free Fire match begins at ${formatMatchTime(match.time)}! Room ID & Password are ready. Tap to enter match.`,
        {
          tag: `test-match-15m-${Date.now()}`,
          targetMatchId: match.id,
          actionPage: 'match_details',
          icon: '/pwa-192x192.png',
          badge: '/badge-96x96.png'
        }
      );

      playMatchAlertChime(customEvent.detail?.urgency || '15min');
      triggerHapticFeedback([250, 100, 250, 100, 400]);

      setActiveMatchToast({
        match,
        urgency: customEvent.detail?.urgency || '15min',
        remainingMs: status.remainingMs > 0 ? status.remainingMs : 14.5 * 60 * 1000,
        formattedCountdown: status.remainingMs > 0 ? status.formattedCountdown : '14m 30s'
      });

      if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
      toastDismissTimerRef.current = setTimeout(() => {
        setActiveMatchToast(null);
      }, 14000);
    };

    window.addEventListener('kg-simulate-match-alert', handleSimulateAlert);
    return () => {
      window.removeEventListener('kg-simulate-match-alert', handleSimulateAlert);
      if (toastDismissTimerRef.current) clearTimeout(toastDismissTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------
  // Real-time Firestore notifications listener (Authenticated Only)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!user?.id) {
      initialLoadDone.current = false;
      seenNotifIds.current.clear();
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!initialLoadDone.current) {
        snapshot.docs.forEach((d) => seenNotifIds.current.add(d.id));
        initialLoadDone.current = true;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const notifId = change.doc.id;
          if (seenNotifIds.current.has(notifId)) return;
          seenNotifIds.current.add(notifId);

          const data = { id: notifId, ...change.doc.data() } as AppNotification;

          let isForUser = true;
          if (data.audience === 'match' && data.targetMatchId) {
            isForUser = joinedMatchIdsRef.current.includes(data.targetMatchId);
          } else if (data.audience === 'user' && data.targetUserId) {
            isForUser = user.id === data.targetUserId;
          }

          if (isForUser) {
            setActivePopup(data);
            playMatchAlertChime('general');
            triggerHapticFeedback([200, 100, 200]);

            triggerMobileStatusBarNotification(data.title, data.message, {
              tag: data.id || 'ap-tournament-alert',
              targetMatchId: data.targetMatchId,
              actionPage: data.actionPage,
              icon: '/pwa-192x192.png',
              badge: '/badge-96x96.png'
            });

            setTimeout(() => {
              setActivePopup((curr) => (curr?.id === notifId ? null : curr));
            }, 6500);
          }
        }
      });
    }, (err) => {
      console.warn('Realtime notifications listener notice:', err);
    });

    return () => {
      unsub();
      initialLoadDone.current = false;
    };
  }, [user?.id]);

  const handleEnablePermission = async () => {
    setIsRequestingPermission(true);
    try {
      const res = await requestMobileNotificationPermission(user?.id);
      if (res === 'granted') {
        setShowPermissionBanner(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleDismissPermissionBanner = () => {
    setShowPermissionBanner(false);
    sessionStorage.setItem('kg_notif_banner_dismissed', 'true');
  };

  const handleDismissGeneralPopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePopup(null);
  };

  const handleTapGeneralPopup = () => {
    if (!activePopup) return;
    
    if (user?.id && activePopup.id) {
      updateDoc(doc(db, 'notifications', activePopup.id), {
        readBy: arrayUnion(user.id)
      }).catch(() => {});
    }

    if (activePopup.actionPage) {
      onPageChange(activePopup.actionPage as Page, activePopup.targetMatchId);
    } else if (onOpenNotificationsModal) {
      onOpenNotificationsModal();
    }
    setActivePopup(null);
  };

  const handleOpenMatchDetails = (matchId: string) => {
    setActiveMatchToast(null);
    onPageChange(Page.MATCH_DETAILS, matchId);
  };

  const getGeneralIcon = (type?: string) => {
    switch (type) {
      case 'room_creds': return <Key size={18} className="text-[#16A34A]" />;
      case 'tournament': return <Trophy size={18} className="text-[#16A34A]" />;
      case 'offer': return <Gift size={18} className="text-[#16A34A]" />;
      case 'wallet': return <Wallet size={18} className="text-[#16A34A]" />;
      case 'fairplay': return <ShieldCheck size={18} className="text-amber-600" />;
      default: return <Bell size={18} className="text-[#16A34A]" />;
    }
  };

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* 1. HIGH-PRIORITY 15-MINUTE MATCH START ALERT TOAST                */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {activeMatchToast && (
          <div className="fixed top-2.5 left-0 right-0 z-[60] px-3 sm:px-4 pointer-events-none flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 350 }}
              className="w-full max-w-md bg-white border-2 border-[#16A34A] p-4 rounded-3xl shadow-xl pointer-events-auto relative overflow-hidden group text-slate-900"
            >
              {/* Top Banner Tag */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-full ${
                  activeMatchToast.urgency === '5min'
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : 'bg-[#ECFDF5] border-[#BBF7D0] text-[#16A34A]'
                }`}>
                  <Flame size={13} className="animate-bounce" />
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {activeMatchToast.urgency === '5min' 
                      ? '⚡ FINAL CALL • STARTS IN 5 MINS' 
                      : '🚨 MATCH STARTS IN 15 MINUTES'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full text-slate-900 text-[11px] font-black tabular-nums">
                    <Clock size={12} className="text-[#16A34A] animate-pulse" />
                    <span>{activeMatchToast.formattedCountdown}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMatchToast(null)}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
                    title="Dismiss"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Match Information */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] shrink-0 flex flex-col items-center justify-center text-center p-1">
                  <Swords size={18} className="text-[#16A34A]" />
                  <span className="text-[8px] font-black text-[#16A34A] leading-none mt-0.5">
                    #{activeMatchToast.match.matchNumber || 'FF'}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-black text-slate-900 truncate leading-tight tracking-tight">
                    {activeMatchToast.match.title || 'Free Fire Tournament'}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 font-semibold mt-1 flex-wrap">
                    <span className="text-[#16A34A] bg-[#ECFDF5] px-2 py-0.5 rounded-md border border-[#BBF7D0] font-bold">
                      {activeMatchToast.match.mode || 'Solo'}
                    </span>
                    <span>•</span>
                    <span>Map: {activeMatchToast.match.map || 'Bermuda'}</span>
                    <span>•</span>
                    <span className="text-[#16A34A] font-bold tabular-nums">
                      Prize: {activeMatchToast.match.prize || '₹' + (activeMatchToast.match.prizePool || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenMatchDetails(activeMatchToast.match.id)}
                  className="flex-1 h-11 bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.98] text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Key size={15} className="stroke-[2.5]" />
                  <span>View Room ID & Password</span>
                  <ArrowRight size={14} className="stroke-[2.5]" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* 2. PERSISTENT PRE-MATCH MINI DOCK (When Match Starts in <15 Mins)  */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {imminentMatch && !activeMatchToast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-[74px] sm:bottom-20 left-0 right-0 z-40 px-3 sm:px-4 pointer-events-none flex justify-center"
          >
            <div className="w-full max-w-md bg-white/95 border border-[#BBF7D0] backdrop-blur-xl p-2.5 rounded-2xl shadow-lg pointer-events-auto flex items-center justify-between gap-2.5 text-slate-900">
              <div 
                onClick={() => handleOpenMatchDetails(imminentMatch.match.id)}
                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <div className="w-8 h-8 rounded-xl bg-[#16A34A] flex items-center justify-center text-white shrink-0 shadow-xs">
                  <Flame size={16} className="animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#16A34A]">
                      Match Starting Soon
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-ping" />
                  </div>
                  <p className="text-[11px] font-black text-slate-900 truncate leading-tight">
                    #{imminentMatch.match.matchNumber || 'FF'} {imminentMatch.match.title || 'Free Fire'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <div className="bg-[#ECFDF5] border border-[#BBF7D0] px-2 py-1 rounded-lg text-[#16A34A] font-mono text-xs font-black tabular-nums">
                  {imminentMatch.status.formattedCountdown}
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenMatchDetails(imminentMatch.match.id)}
                  className="px-2.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] active:scale-95 text-white font-black text-[10px] uppercase tracking-wider rounded-lg shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <Key size={12} />
                  <span>Room</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* 3. MOBILE STATUS BAR NOTIFICATION PERMISSION PROMPT BANNER         */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {showPermissionBanner && (
          <div className="fixed bottom-20 left-0 right-0 z-50 px-3 sm:px-4 pointer-events-none flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              className="w-full max-w-md bg-white border border-slate-200 backdrop-blur-xl p-4 rounded-3xl shadow-xl pointer-events-auto flex items-center justify-between gap-3 text-slate-900"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A] shrink-0">
                  <Smartphone size={20} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">
                    Enable 15-Min Match Alerts
                  </h4>
                  <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                    Receive Room ID, Password, and 15-minute countdown alerts!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleEnablePermission}
                  disabled={isRequestingPermission}
                  className="px-3.5 py-2 bg-[#16A34A] hover:bg-[#15803D] active:scale-95 text-white font-black rounded-xl text-[10px] uppercase tracking-wider shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Bell size={12} />
                  <span>{isRequestingPermission ? 'Enabling...' : 'Allow'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDismissPermissionBanner}
                  className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* 4. GENERAL LIVE IN-APP NOTIFICATION BANNER                         */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {activePopup && !activeMatchToast && (
          <div className="fixed top-3 left-0 right-0 z-50 px-3 sm:px-4 pointer-events-none flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: -40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              onClick={handleTapGeneralPopup}
              className="w-full max-w-md bg-white/95 backdrop-blur-xl border border-[#BBF7D0] p-3.5 rounded-2xl shadow-lg pointer-events-auto cursor-pointer flex items-center justify-between gap-3 group active:scale-[0.98] transition-transform text-slate-900"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center shrink-0 text-[#16A34A]">
                  {getGeneralIcon(activePopup.type)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#16A34A]">
                      Live Notification
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                  </div>
                  <h4 className="text-xs font-black text-slate-900 truncate leading-tight mt-0.5">
                    {activePopup.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5 font-medium">
                    {activePopup.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-[#ECFDF5] flex items-center justify-center text-slate-500 group-hover:text-[#16A34A] transition-colors">
                  <ChevronRight size={15} />
                </div>
                <button
                  type="button"
                  onClick={handleDismissGeneralPopup}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
