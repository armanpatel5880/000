import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import { Page, User } from './types';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, limit, getDocs, writeBatch, onSnapshot, increment, updateDoc, deleteField } from 'firebase/firestore';
import { GAMES } from './constants';

// Pages
import Auth from './pages/Auth';
import Home from './pages/Home';
import Tournaments from './pages/Tournaments';
import JoinMatch from './pages/JoinMatch';
import WalletPage from './pages/Wallet';
import AddMoney from './pages/AddMoney';
import Withdraw from './pages/Withdraw';
import ProfilePage from './pages/Profile';
import AdminPage from './pages/Admin';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminEditMatch from './pages/AdminEditMatch';
import AdminCreateMatch from './pages/AdminCreateMatch';
import ReferralPage from './pages/Referral';
import ProfileDetails from './pages/ProfileDetails';
import GameStats from './pages/GameStats';
import GameModes from './pages/GameModes';
import AdminModes from './pages/AdminModes';
import Leaderboard from './pages/Leaderboard';
import MatchDetails from './pages/MatchDetails';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Terms from './pages/Terms';
import RefundPolicy from './pages/RefundPolicy';
import FairPlayPolicy from './pages/FairPlayPolicy';
import GlobalNotificationListener from './components/GlobalNotificationListener';
import ConsentBanner from './components/ConsentBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { generateReferralCode } from './utils/referralUtils';
import { checkDeviceBan, getDeviceId, getDeviceFingerprint, getDeviceInfo, resolveBanDetails, extractUserIgn, fetchRegistrationIgnFallback, DeviceBanStatus } from './utils/deviceHelper';
import { DEFAULT_STAFF_PERMISSIONS, PRIMARY_ADMIN_EMAIL, hasAdminPanelAccess, hasSectionPermission, isFullAdmin, normalizeStaffPermissions, resolveUserRole } from './utils/adminPermissions';
import DeviceBannedScreen from './components/DeviceBannedScreen';

const DEFAULT_USER_DATA = {
  wallet: {
    deposit: 0,
    winnings: 0,
    bonus: 0,
  },
  isKycVerified: false,
  isAdmin: false,
  role: 'user' as const,
  staffPermissions: { ...DEFAULT_STAFF_PERMISSIONS },
  stats: {
    matchesPlayed: 0,
    totalWins: 0,
    totalKills: 0,
    totalWinnings: 0,
  }
};

const pageToPath = {
  [Page.LOGIN]: '/login',
  [Page.SIGNUP]: '/signup',
  [Page.HOME]: '/home',
  [Page.TOURNAMENTS]: '/tournaments',
  [Page.JOIN_MATCH]: '/match',
  [Page.WALLET]: '/wallet',
  [Page.ADD_MONEY]: '/wallet/add',
  [Page.WITHDRAW]: '/wallet/withdraw',
  [Page.PROFILE]: '/profile',
  [Page.ADMIN]: '/admin',
  [Page.ADMIN_USER_PROFILE]: '/admin/user',
  [Page.ADMIN_EDIT_MATCH]: '/admin/match/edit',
  [Page.ADMIN_CREATE_MATCH]: '/admin/match/create',
  [Page.REFERRAL]: '/referral',
  [Page.PROFILE_DETAILS]: '/profile/details',
  [Page.GAME_STATS]: '/profile/stats',
  [Page.GAME_MODES]: '/game-modes',
  [Page.ADMIN_MODES]: '/admin/modes',
  [Page.LEADERBOARD]: '/leaderboard',
  [Page.MATCH_DETAILS]: '/match-details',
  [Page.PRIVACY_POLICY]: '/privacy-policy',
  [Page.TERMS]: '/terms',
  [Page.REFUND_POLICY]: '/refund-policy',
  [Page.FAIR_PLAY_POLICY]: '/fair-play-policy'
};

const pathToPage: Record<string, Page> = {
  '/login': Page.LOGIN,
  '/signup': Page.SIGNUP,
  '/home': Page.HOME,
  '/tournaments': Page.TOURNAMENTS,
  '/match': Page.JOIN_MATCH,
  '/match-details': Page.MATCH_DETAILS,
  '/wallet': Page.WALLET,
  '/wallet/add': Page.ADD_MONEY,
  '/wallet/withdraw': Page.WITHDRAW,
  '/profile': Page.PROFILE,
  '/admin': Page.ADMIN,
  '/admin/user': Page.ADMIN_USER_PROFILE,
  '/admin/match/edit': Page.ADMIN_EDIT_MATCH,
  '/admin/match/create': Page.ADMIN_CREATE_MATCH,
  '/referral': Page.REFERRAL,
  '/profile/details': Page.PROFILE_DETAILS,
  '/profile/stats': Page.GAME_STATS,
  '/game-modes': Page.GAME_MODES,
  '/admin/modes': Page.ADMIN_MODES,
  '/leaderboard': Page.LEADERBOARD,
  '/privacy-policy': Page.PRIVACY_POLICY,
  '/terms': Page.TERMS,
  '/refund-policy': Page.REFUND_POLICY,
  '/fair-play-policy': Page.FAIR_PLAY_POLICY
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);
  return null;
}

interface ProtectedRouteProps {
  isLoggedIn: boolean;
  loading: boolean;
  hasUser: boolean;
  children: React.ReactNode;
}

function ProtectedRoute({ isLoggedIn, loading, hasUser, children }: ProtectedRouteProps) {
  if (!isLoggedIn && !loading) {
    return <Navigate to="/login" replace />;
  }
  if (!hasUser && isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center pt-24">
        <div className="w-8 h-8 border-[3px] border-[#16A34A] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Loading profile...</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinedMatchIds, setJoinedMatchIds] = useState<string[]>([]);
  const [deviceBanStatus, setDeviceBanStatus] = useState<DeviceBanStatus | null>(null);
  const [isUserBanned, setIsUserBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | undefined>(undefined);

  // Immediate + Real-time Hardware Device Ban Verification on mount
  useEffect(() => {
    const devId = getDeviceId();
    const verifyDeviceBlacklist = async () => {
      try {
        const status = await checkDeviceBan();
        if (status.isBlacklisted) {
          setDeviceBanStatus(status);
        }
      } catch (e) {
        console.warn('Error checking device blacklist:', e);
      }
    };
    verifyDeviceBlacklist();

    // Real-time listener on this device's blacklist record
    let unsubDev: (() => void) | null = null;
    if (devId && devId !== 'unknown_device') {
      unsubDev = onSnapshot(doc(db, 'blacklistedDevices', devId), async (snap) => {
        if (snap.exists() && snap.data()?.isActive !== false) {
          const data = snap.data();
          const resolved = await resolveBanDetails(data);
          setDeviceBanStatus(resolved);
        } else {
          // Re-verify fingerprint fallback before clearing
          checkDeviceBan().then((res) => {
            if (!res.isBlacklisted) {
              setDeviceBanStatus(null);
            }
          }).catch(() => {});
        }
      }, () => {});
    }

    return () => {
      if (unsubDev) unsubDev();
    };
  }, []);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;
    let unsubscribeRegistrations: (() => void) | null = null;

    const seedDatabase = async (email: string, _uid: string) => {
      if (email.trim().toLowerCase() !== PRIMARY_ADMIN_EMAIL) return;
      try {
        // Independence seeding for games
        const gamesSnap = await getDocs(collection(db, 'games'));
        if (gamesSnap.empty) {
          const batch = writeBatch(db);
          GAMES.forEach(game => {
            batch.set(doc(db, 'games', game.id), game);
          });
          await batch.commit();
          console.log('Games seeded');
        }

        // Seeding game rules
        const rulesSnap = await getDocs(collection(db, 'gameRules'));
        if (rulesSnap.empty) {
          const batch = writeBatch(db);
          const defaultRules = [
            {
              id: 'battle_royale',
              type: 'Battle Royale',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Using banned apps will lead to ban.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'clash_squad',
              type: 'Clash Squad',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Teaming with enemies is banned.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'lone_wolf',
              type: 'Lone Wolf',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Rank pushing is not allowed.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            }
          ];
          defaultRules.forEach(rule => {
            batch.set(doc(db, 'gameRules', rule.id), rule);
          });
          await batch.commit();
          console.log('Game rules seeded');
        }

        // Seeding app settings
        const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
        if (!settingsSnap.exists()) {
          await setDoc(doc(db, 'appSettings', 'referral_support'), {
            referral: {
              baseUrl: window.location.origin,
              perReferralReward: 50,
              rewardType: 'bonus',
              depositPercentage: 50,
              bonusPercentage: 50,
              newUserReward: 10
            },
            support: {
              whatsapp: 'https://wa.me/910000000000',
              telegram: 'https://t.me/aptournament',
              email: 'support@aptournament.com'
            }
          });
          console.log('App settings seeded');
        }

        // Seeding initial Game Modes from constants
        const modesSnap = await getDocs(collection(db, 'gameModes'));
        if (modesSnap.empty) {
          const { GAME_MODES_DATA } = await import('./constants');
          const batch = writeBatch(db);
          Object.entries(GAME_MODES_DATA).forEach(([gameId, modes]) => {
            modes.forEach((mode, index) => {
              const modeId = `${gameId}_${mode.id}`;
              batch.set(doc(db, 'gameModes', modeId), {
                ...mode,
                gameId,
                order: index
              });
            });
          });
          await batch.commit();
          console.log('Game modes seeded from constants');
        }
      } catch (error) {
        console.error('Error seeding database:', error);
      }
    };

    getRedirectResult(auth).catch((err) => {
      console.warn('Auth redirect check notice:', err);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }

      if (firebaseUser) {
        // Seed if admin
        seedDatabase(firebaseUser.email || '', firebaseUser.uid);

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for user changes (balance, etc.)
        unsubscribeUser = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            const data = userDoc.data() as any;

            // Anti-Cheat & FairPlay: Ban verification (Real-time Account Blocked Screen)
            if (data.isBanned) {
              const userReason = data.banReason || 'Your account has been permanently blocked by administration for FairPlay / anti-cheat violation.';
              let userIgn = extractUserIgn(data);
              if (!userIgn) {
                userIgn = await fetchRegistrationIgnFallback(userDoc.id);
              }
              setIsUserBanned(true);
              setBanReason(userReason);
              setUser({ id: userDoc.id, ...data, ign: userIgn || data.ign } as User);
              setIsLoggedIn(false);
              setLoading(false);
              if (data.isDeviceBanned) {
                setDeviceBanStatus({
                  isBlacklisted: true,
                  reason: userReason,
                  bannedUserId: userDoc.id,
                  bannedUserEmail: data.email || firebaseUser.email || '',
                  bannedUsername: data.username,
                  bannedUserIgn: userIgn
                });
              }
              return;
            } else {
              setIsUserBanned(false);
              setBanReason(undefined);
            }

            // Sync hardware fingerprint & login timestamp once per session
            const currentDevId = getDeviceId();
            const currentFp = getDeviceFingerprint();
            const currentDevInfo = getDeviceInfo();
            const loginStampKey = `ap_login_stamped_${firebaseUser.uid}`;
            let isSessionStamped = false;
            try {
              isSessionStamped = sessionStorage.getItem(loginStampKey) === '1';
            } catch {}

            const needsDeviceSync =
              data.deviceId !== currentDevId ||
              data.deviceFingerprint !== currentFp ||
              data.deviceInfo !== currentDevInfo;
            const needsLoginStamp = !isSessionStamped || !data.lastLoginAt;

            if (needsDeviceSync || needsLoginStamp) {
              const updates: any = {
                deviceId: currentDevId,
                deviceFingerprint: currentFp,
                deviceInfo: currentDevInfo,
                lastActive: serverTimestamp()
              };
              if (needsLoginStamp) {
                updates.lastLoginAt = serverTimestamp();
                try {
                  sessionStorage.setItem(loginStampKey, '1');
                } catch {}
              }
              updateDoc(userDocRef, updates).catch(console.warn);
            }

            // Migration check: if user doesn't have an AP referral code
            if (!data.referralCode) {
              const newRefCode = generateReferralCode();
              updateDoc(userDocRef, { referralCode: newRefCode }).catch(console.warn);
              data.referralCode = newRefCode;
            }

            // Migration check: if user has raw 'wallet.bonus' or 'wallet.deposit' keys from setDoc merge
            if (data['wallet.bonus'] !== undefined || data['wallet.deposit'] !== undefined) {
              const rawBonus = Number(data['wallet.bonus'] || 0);
              const rawDeposit = Number(data['wallet.deposit'] || 0);
              if (rawBonus > 0 || rawDeposit > 0) {
                const cleanedWallet = {
                  deposit: Number(data.wallet?.deposit || 0) + rawDeposit,
                  winnings: Number(data.wallet?.winnings || 0),
                  bonus: Number(data.wallet?.bonus || 0) + rawBonus
                };
                updateDoc(userDocRef, {
                  wallet: cleanedWallet,
                  'wallet.bonus': deleteField(),
                  'wallet.deposit': deleteField()
                }).catch(console.warn);
                data.wallet = cleanedWallet;
              }
            }

            // Migration check: if user doesn't have the new wallet structure
            if (!data.wallet) {
              console.log("Migrating user wallet structure...");
              const migratedWallet = {
                deposit: data.walletBalance || 0,
                winnings: data.winnings || 0,
                bonus: data.bonus || 0
              };
              
              // Only migrate if we have some old data, otherwise use defaults
              if (data.walletBalance === undefined && data.winnings === undefined && data.bonus === undefined) {
                Object.assign(migratedWallet, DEFAULT_USER_DATA.wallet);
              }

              const batch = writeBatch(db);
              batch.update(userDocRef, {
                wallet: migratedWallet
              });
              await batch.commit();
              // The next snapshot will have the right data
              return;
            }

            const isUserAdmin = isFullAdmin(data as Partial<User>, firebaseUser.email, firebaseUser.uid);

            if (isUserAdmin) {
              if (!data.isAdmin || data.role !== 'admin' || data.isStaff) {
                updateDoc(userDocRef, { isAdmin: true, role: 'admin', isStaff: false }).catch(() => {});
              }

              // One-time-per-session cleanup: ensure no old/other accounts retain admin flags in Firestore
              const rosterSyncKey = 'ap_exclusive_admin_synced_v1';
              let alreadySynced = false;
              try {
                alreadySynced = sessionStorage.getItem(rosterSyncKey) === '1';
                if (!alreadySynced) sessionStorage.setItem(rosterSyncKey, '1');
              } catch {}
              if (!alreadySynced) {
                Promise.all([
                  getDocs(query(collection(db, 'users'), where('isAdmin', '==', true), limit(50))),
                  getDocs(query(collection(db, 'users'), where('role', '==', 'admin'), limit(50)))
                ]).then(async ([flagSnap, roleSnap]) => {
                  const toDemote = new Map<string, any>();
                  [...flagSnap.docs, ...roleSnap.docs].forEach((d) => {
                    const docEmail = String(d.data()?.email || '').trim().toLowerCase();
                    if (d.id !== firebaseUser.uid && docEmail !== PRIMARY_ADMIN_EMAIL) {
                      toDemote.set(d.id, d.ref);
                    }
                  });
                  if (toDemote.size > 0) {
                    const cleanupBatch = writeBatch(db);
                    toDemote.forEach((ref) => {
                      cleanupBatch.update(ref, {
                        isAdmin: false,
                        role: 'user',
                        isStaff: false,
                        staffPermissions: { ...DEFAULT_STAFF_PERMISSIONS }
                      });
                    });
                    await cleanupBatch.commit();
                  }
                }).catch((err) => {
                  console.warn('Admin roster cleanup check skipped:', err);
                });
              }
            }

            const isGoogleProvider = firebaseUser.providerData.some((p) => p.providerId === 'google.com');
            const resolvedRole = resolveUserRole(data as Partial<User>, firebaseUser.email, firebaseUser.uid);
            const resolvedPermissions = normalizeStaffPermissions(data.staffPermissions);

            setUser({
              id: userDoc.id,
              ...data,
              authProvider: data.authProvider || (isGoogleProvider ? 'google' : 'password'),
              isAdmin: isUserAdmin,
              role: resolvedRole,
              staffPermissions: resolvedPermissions
            } as User);
            setIsLoggedIn(true);
            setLoading(false);

            // Process referral rewards if eligible
            if (data.referredBy && !data.referralClaimed) {
              processReferralReward(data, firebaseUser.uid);
            }
            
            // Immediate redirect to home only if actually on login/signup/root
            const livePath = window.location.pathname;
            if (livePath === '/login' || livePath === '/signup' || livePath === '/') {
              navigate('/home', { replace: true });
            }
          } else {
            // For Google Auth or unexpected cases, create default profile
            const isGoogleProvider = firebaseUser.providerData.some((p) => p.providerId === 'google.com');
            const isAdmin = (firebaseUser.email || '').trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
            const newUser: User = {
              username: firebaseUser.displayName || `Gamer_${firebaseUser.uid.slice(0, 5)}`,
              email: firebaseUser.email || '',
              phone: firebaseUser.phoneNumber || '',
              authProvider: isGoogleProvider ? 'google' : 'password',
              profileCompleted: false,
              referralCode: generateReferralCode(),
              deviceId: getDeviceId(),
              deviceFingerprint: getDeviceFingerprint(),
              deviceInfo: getDeviceInfo(),
              ...DEFAULT_USER_DATA,
              isAdmin: isAdmin,
              role: isAdmin ? 'admin' : 'user',
              staffPermissions: { ...DEFAULT_STAFF_PERMISSIONS }
            };
            await setDoc(userDocRef, {
              ...newUser,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
              lastActive: serverTimestamp(),
            });
            try {
              sessionStorage.setItem(`ap_login_stamped_${firebaseUser.uid}`, '1');
            } catch {}
            // Snapshot will pick this up
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          setLoading(false);
        });

        // Listen to registrations in real-time
        if (unsubscribeRegistrations) {
          unsubscribeRegistrations();
          unsubscribeRegistrations = null;
        }
        try {
          const q = query(collection(db, 'registrations'), where('userId', '==', firebaseUser.uid));
          unsubscribeRegistrations = onSnapshot(q, (regSnap) => {
            const matchIds = regSnap.docs.map(doc => doc.data().tournamentId).filter(Boolean);
            setJoinedMatchIds(matchIds);
          }, (error) => {
            console.error("Error listening to registrations:", error);
          });
        } catch (error) {
          console.error("Error setting up registrations listener:", error);
        }
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setJoinedMatchIds([]);
        if (unsubscribeRegistrations) {
          unsubscribeRegistrations();
          unsubscribeRegistrations = null;
        }
        if (!['/login', '/signup'].includes(window.location.pathname)) {
          navigate('/login', { replace: true });
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeRegistrations) unsubscribeRegistrations();
    };
  }, []);

  const handleLogin = () => {
    console.log("Redirecting to home...");
    navigate('/home');
  };

  const handleLogout = async () => {
    try {
      if (auth.currentUser?.uid) {
        sessionStorage.removeItem(`ap_login_stamped_${auth.currentUser.uid}`);
      }
    } catch {}
    setIsUserBanned(false);
    setBanReason(undefined);
    await auth.signOut();
    navigate('/login');
  };

  const handlePageChange = useCallback((page: Page, id?: string) => {
    let path = pageToPath[page];
    if (id) {
      if (page === Page.TOURNAMENTS) path = `${path}/${id}`;
      else if (page === Page.JOIN_MATCH) path = `${path}/${id}`;
      else if (page === Page.MATCH_DETAILS) path = `${path}/${id}`;
      else if (page === Page.ADMIN_USER_PROFILE) path = `${path}/${id}`;
      else if (page === Page.ADMIN_EDIT_MATCH) path = `${path}/${id}`;
      else if (page === Page.ADMIN_CREATE_MATCH) path = `${path}/${id}`;
      else if (page === Page.GAME_MODES) path = `${path}/${id}`;
    }
    navigate(path);
  }, [navigate]);

  const handleJoinSuccess = (matchId: string) => {
    setJoinedMatchIds(prev => [...prev, matchId]);
  };

  const processReferralReward = async (currentUser: any, uid: string) => {
    if (!currentUser.referredBy || currentUser.referralClaimed) return;

    console.log("Checking referral reward for user:", currentUser.username, "referred by:", currentUser.referredBy);
    try {
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
      if (!settingsSnap.exists()) return;
      const settings = settingsSnap.data();
      const refSettings = settings.referral;
      if (!refSettings) return;

      // Find referrer by referralCode OR username
      const refCodeToSearch = (currentUser.referredBy || '').toUpperCase();
      const qCode = query(collection(db, 'users'), where('referralCode', '==', refCodeToSearch));
      let referrerSnap = await getDocs(qCode);

      if (referrerSnap.empty) {
        const qUser = query(collection(db, 'users'), where('username', '==', currentUser.referredBy));
        referrerSnap = await getDocs(qUser);
      }

      if (referrerSnap.empty) {
        console.log("Referrer not found:", currentUser.referredBy);
        // Mark as claimed to stop checking
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true }).catch(console.warn);
        return;
      }

      // Device check: Allow testing up to 10 accounts on same dev device
      if (currentUser.deviceId && currentUser.deviceId !== 'unknown') {
        const qDevice = query(collection(db, 'users'), where('deviceId', '==', currentUser.deviceId), where('referralClaimed', '==', true));
        const deviceSnap = await getDocs(qDevice);
        if (deviceSnap.size >= 10) {
          console.warn("Fraud alert: Device exceeded referral limit");
          await updateDoc(doc(db, 'users', uid), { referralClaimed: true }).catch(console.warn);
          return;
        }
      }
      
      const referrerDoc = referrerSnap.docs[0];
      const referrerId = referrerDoc.id;

      const rewardType = refSettings.rewardType || 'bonus';
      const refReward = Number(refSettings.perReferralReward || 0);
      const newUserReward = Number(refSettings.newUserReward > 0 ? refSettings.newUserReward : (refSettings.perReferralReward || 0));

      const batch = writeBatch(db);

      const getWalletUpdates = (amount: number) => {
        const updates: any = {};
        if (rewardType === 'deposit') {
          updates['wallet.deposit'] = increment(amount);
        } else if (rewardType === 'both') {
          const depPct = Number(refSettings.depositPercentage || 50);
          const depAmt = Math.round((amount * depPct) / 100);
          const bonusAmt = amount - depAmt;
          if (depAmt > 0) updates['wallet.deposit'] = increment(depAmt);
          if (bonusAmt > 0) updates['wallet.bonus'] = increment(bonusAmt);
        } else {
          // Default: bonus
          updates['wallet.bonus'] = increment(amount);
        }
        return updates;
      };

      let hasOperations = false;

      // 1. Reward Referrer
      if (refReward > 0) {
        const referrerUpdates = getWalletUpdates(refReward);
        batch.update(doc(db, 'users', referrerId), referrerUpdates);
        
        batch.set(doc(collection(db, 'transactions')), {
          userId: referrerId,
          type: rewardType === 'deposit' ? 'deposit' : 'bonus',
          amount: refReward,
          status: 'completed',
          title: `🎁 Referral Reward: ${currentUser.username} joined using your code (${refCodeToSearch})`,
          createdAt: serverTimestamp()
        });
        hasOperations = true;
      }

      // 2. Reward New User
      const newUserUpdates = newUserReward > 0 ? getWalletUpdates(newUserReward) : {};
      newUserUpdates.referralClaimed = true;
      batch.update(doc(db, 'users', uid), newUserUpdates);
      hasOperations = true;

      if (newUserReward > 0) {
        batch.set(doc(collection(db, 'transactions')), {
          userId: uid,
          type: rewardType === 'deposit' ? 'deposit' : 'bonus',
          amount: newUserReward,
          status: 'completed',
          title: `🎁 Signup Bonus: Used Referral Code (${currentUser.referredBy})`,
          createdAt: serverTimestamp()
        });
      }

      if (hasOperations) {
        await batch.commit();
        console.log(`Referral rewards processed! Referrer +${refReward}, New User +${newUserReward} (${rewardType})`);
      }
    } catch (err) {
      console.error("Error processing referral reward:", err);
    }
  };

  const resolvedUserIgn = extractUserIgn(user);

  // 1. Hardware Blacklist Lockout - App does not open on blacklisted device
  if (deviceBanStatus?.isBlacklisted) {
    return (
      <DeviceBannedScreen 
        type="device" 
        reason={deviceBanStatus.reason} 
        username={deviceBanStatus.bannedUsername || user?.username}
        ign={deviceBanStatus.bannedUserIgn || resolvedUserIgn}
        email={deviceBanStatus.bannedUserEmail || user?.email}
        bannedUserId={deviceBanStatus.bannedUserId || user?.id}
      />
    );
  }

  // 2. Account Suspension Lockout
  if (isUserBanned) {
    return (
      <DeviceBannedScreen 
        type="user" 
        reason={banReason} 
        username={user?.username}
        ign={resolvedUserIgn}
        email={user?.email}
        bannedUserId={user?.id}
        onLogout={handleLogout}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center">
        <div className="w-11 h-11 border-4 border-[#16A34A] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-xs font-extrabold uppercase tracking-widest text-slate-500">Initializing...</p>
      </div>
    );
  }

  // Derive currentPage for components that still need it
  const currentPath = location.pathname;
  let currentPage = Page.HOME;
  for (const [path, page] of Object.entries(pathToPage)) {
    if (currentPath.startsWith(path)) {
      currentPage = page;
      break;
    }
  }

  const protect = (node: React.ReactNode) => (
    <ProtectedRoute isLoggedIn={isLoggedIn} loading={loading} hasUser={Boolean(user)}>
      {node}
    </ProtectedRoute>
  );

  const authEmail = auth.currentUser?.email;
  const authUid = auth.currentUser?.uid;
  const canOpenAdminRoute = hasAdminPanelAccess(user, authEmail, authUid);
  const protectAdmin = (node: React.ReactNode, requiredSection?: Parameters<typeof hasSectionPermission>[1]) =>
    protect(
      !canOpenAdminRoute ? (
        <Navigate to="/home" replace />
      ) : requiredSection && !hasSectionPermission(user, requiredSection, authEmail, authUid) ? (
        <Navigate to="/admin" replace />
      ) : (
        node
      )
    );

  // Pages that display header/nav
  const showChrome = isLoggedIn && !['/login', '/signup'].includes(location.pathname);
  const showHeader = showChrome && !['/home', '/tournaments', '/match/', '/match-details/', '/wallet/add', '/wallet/withdraw', '/admin', '/referral', '/profile/details', '/profile/stats', '/game-modes', '/profile'].some(p => location.pathname.startsWith(p));
  const showNav = showChrome && !['/match/', '/match-details/', '/admin/match/'].some(p => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen bg-[#F2FBF6] text-[#0F172A] relative selection:bg-[#16A34A]/25">
      <ScrollToTop />
      <ConsentBanner />
      <GlobalNotificationListener 
        user={user} 
        joinedMatchIds={joinedMatchIds} 
        onPageChange={handlePageChange} 
      />
      {showHeader && <Header user={user!} onPageChange={handlePageChange} />}
      
      <main className={`mx-auto ${location.pathname.startsWith('/admin') ? 'max-w-2xl' : 'max-w-lg'} min-h-screen bg-[#F2FBF6] overflow-x-hidden`}>
        <div className="w-full">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/login" element={<Auth onLogin={handleLogin} />} />
            <Route path="/signup" element={<Auth onLogin={handleLogin} />} />
            
            <Route path="/home" element={protect(
              <Home user={user!} onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} onLogout={handleLogout} />
            )} />

            <Route path="/game-modes/:gameId" element={protect(
              <GameModes onPageChange={handlePageChange} />
            )} />
            
            <Route path="/tournaments" element={protect(
              <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
            )} />
            
            <Route path="/tournaments/:gameId" element={protect(
              <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
            )} />

            <Route path="/match-details/:id" element={protect(
              <MatchDetails 
                user={user!}
                onPageChange={handlePageChange} 
                joinedMatchIds={joinedMatchIds}
              />
            )} />

            <Route path="/match/:id" element={protect(
              <JoinMatch 
                user={user!}
                onPageChange={handlePageChange} 
                joinedMatchIds={joinedMatchIds}
                onJoinSuccess={handleJoinSuccess}
              />
            )} />

            <Route path="/wallet" element={protect(
              <WalletPage user={user} onPageChange={handlePageChange} />
            )} />

            <Route path="/wallet/add" element={protect(
              <AddMoney onPageChange={handlePageChange} />
            )} />

            <Route path="/wallet/withdraw" element={protect(
              <Withdraw user={user} onPageChange={handlePageChange} />
            )} />

            <Route path="/profile" element={protect(
              <ProfilePage user={user} onPageChange={handlePageChange} onLogout={handleLogout} />
            )} />

            <Route path="/profile/details" element={protect(
              <ProfileDetails user={user!} onPageChange={handlePageChange} />
            )} />

            <Route path="/profile/stats" element={protect(
              <GameStats user={user!} onPageChange={handlePageChange} />
            )} />

            <Route path="/referral" element={protect(
              <ReferralPage user={user!} onPageChange={handlePageChange} />
            )} />

            <Route path="/privacy-policy" element={protect(
              <PrivacyPolicy onPageChange={handlePageChange} />
            )} />

            <Route path="/terms" element={protect(
              <Terms onPageChange={handlePageChange} />
            )} />

            <Route path="/refund-policy" element={protect(
              <RefundPolicy onPageChange={handlePageChange} />
            )} />

            <Route path="/fair-play-policy" element={protect(
              <FairPlayPolicy onPageChange={handlePageChange} />
            )} />

            <Route path="/admin" element={protectAdmin(
              <AdminPage user={user} onPageChange={handlePageChange} />
            )} />

            <Route path="/admin/user/:id" element={protectAdmin(
              <AdminUserDetail user={user} onPageChange={handlePageChange} />,
              'usersAndBlacklist'
            )} />

            <Route path="/admin/match/edit/:id" element={protectAdmin(
              <AdminEditMatch user={user} onPageChange={handlePageChange} />,
              'matches'
            )} />

            <Route path="/admin/match/create" element={protectAdmin(
              <AdminCreateMatch user={user} onPageChange={handlePageChange} />,
              'matches'
            )} />

            <Route path="/admin/match/create/:duplicateId" element={protectAdmin(
              <AdminCreateMatch user={user} onPageChange={handlePageChange} />,
              'matches'
            )} />

            <Route path="/admin/modes" element={protectAdmin(
              <AdminModes user={user} onPageChange={handlePageChange} />,
              'gameModes'
            )} />

            <Route path="/leaderboard" element={protect(
              <Leaderboard />
            )} />

            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </main>

      {showNav && (
        <BottomNav 
          currentPage={currentPage} 
          onPageChange={handlePageChange} 
          user={user}
        />
      )}
      
      <OfflineIndicator />

      {/* Ambient Green Esports Glow Wash */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[75%] h-[40%] bg-[#16A34A]/[0.10] blur-[120px] rounded-full" />
        <div className="absolute top-[35%] right-[-15%] w-[65%] h-[35%] bg-emerald-400/[0.08] blur-[100px] rounded-full" />
        <div className="absolute bottom-[-5%] left-[-10%] w-[75%] h-[40%] bg-[#16A34A]/[0.09] blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
