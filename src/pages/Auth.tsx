import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Phone, User as UserIcon, Ticket, ArrowRight, Gamepad2, Chrome, AlertCircle, CheckCircle2, X, Shield, BookOpen, FileText, Award, AlertTriangle, UserCheck, Trash2, Eye, EyeOff } from 'lucide-react';
import SafeImage, { APP_LOGO_SQUARE } from '../components/SafeImage';
import { auth, db } from '../lib/firebase';
import { 
  signInWithPopup, 
  signInWithRedirect,
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, query, collection, where, getDocs, getDoc, increment, updateDoc } from 'firebase/firestore';
import { generateReferralCode } from '../utils/referralUtils';
import { checkDeviceBan, getDeviceId, getDeviceFingerprint, getDeviceInfo, extractUserIgn, fetchRegistrationIgnFallback, DeviceBanStatus } from '../utils/deviceHelper';
import DeviceBannedScreen from '../components/DeviceBannedScreen';

interface AuthProps {
  onLogin: () => void;
}

const DEFAULT_USER_DATA = {
  wallet: {
    deposit: 0,
    winnings: 0,
    bonus: 0,
  },
  isKycVerified: false,
  stats: {
    matchesPlayed: 0,
    totalWins: 0,
    totalKills: 0,
    totalWinnings: 0,
  }
};

export default function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !(window.location.pathname === '/signup' || params.get('ref'));
  });
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [referralInput, setReferralInput] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);
  
  const [policyModal, setPolicyModal] = useState<'privacy' | 'terms' | null>(null);
  const [appSettings, setAppSettings] = useState<any>(null);
  const [deviceBanStatus, setDeviceBanStatus] = useState<DeviceBanStatus | null>(null);
  const [userBanInfo, setUserBanInfo] = useState<{ reason: string; username?: string; ign?: string; email?: string; userId?: string } | null>(null);

  useEffect(() => {
    const verifyDevice = async () => {
      try {
        const status = await checkDeviceBan();
        if (status.isBlacklisted) {
          setDeviceBanStatus(status);
        }
      } catch (e) {
        console.warn('Auth device check error:', e);
      }
    };
    verifyDevice();
  }, []);

  useEffect(() => {
    const urlRef = getReferrerFromUrl();
    if (urlRef) {
      setReferralInput(urlRef.toUpperCase());
      setIsLogin(false);
    }
  }, []);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'referral_support'), (snap) => {
      if (snap.exists()) {
        setAppSettings(snap.data());
      }
    }, (err) => console.warn('AppSettings fetch error in Auth:', err));
    return () => unsub();
  }, []);

  const validatePhone = (p: string) => {
    return p.length === 10 && /^\d+$/.test(p);
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeout]);
  };

  const getReferrerFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref');
  };

  const mapAuthError = (code: string) => {
    switch (code) {
      case 'auth/email-already-in-use': return 'Email already registered';
      case 'auth/weak-password': return 'Password must be at least 6 characters';
      case 'auth/network-request-failed': return 'Check your internet connection';
      case 'auth/invalid-email': return 'Enter valid email';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'Invalid email or password';
      default: return 'An unexpected error occurred. Try again.';
    }
  };

  const handleForgotPassword = async () => {
    setErrors({});
    setSuccessMsg('');

    if (!email) {
      setErrors({ email: 'Enter your email' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrors({ email: 'Invalid email format' });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await withTimeout(sendPasswordResetEmail(auth, email), 5000, 'Request timed out. Please try again.');
      setSuccessMsg('Password reset link sent to your email');
    } catch (error: any) {
      console.error(error);
      setErrors({ email: mapAuthError(error.code) });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    setErrors({});
    setSuccessMsg('');
    
    const newErrors: { [key: string]: string } = {};
    if (!email) newErrors.email = 'Email required';
    if (!password) newErrors.password = 'Password required';
    if (password && password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    
    if (!isLogin) {
      if (!username) newErrors.username = 'Username required';
      if (!phone) {
        newErrors.phone = '10 digit phone required';
      } else if (!validatePhone(phone)) {
        newErrors.phone = 'Enter valid 10 digit number';
      }
      if (!consentAgreed) {
        newErrors.consent = 'Please read & check DPDP Data Consent to proceed';
      }

      if (referralInput.trim()) {
        const codeToTest = referralInput.trim();
        try {
          const qCode = query(collection(db, 'users'), where('referralCode', '==', codeToTest.toUpperCase()));
          let snap = await getDocs(qCode);
          if (snap.empty) {
            const qUser = query(collection(db, 'users'), where('username', '==', codeToTest));
            snap = await getDocs(qUser);
          }
          if (snap.empty) {
            newErrors.referral = 'Invalid referral code';
          }
        } catch (e) {
          console.warn('Referral verification error:', e);
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      // Anti-Cheat Hardware Ban Verification before ANY login or new account registration
      const devBanStatus = await checkDeviceBan();
      if (devBanStatus.isBlacklisted) {
        setDeviceBanStatus(devBanStatus);
        setErrors({ general: 'This device is permanently blacklisted due to FairPlay / hack violation. Login and new registration are blocked.' });
        setLoading(false);
        return;
      }

      if (isLogin) {
        try {
          const userCred = await withTimeout(signInWithEmailAndPassword(auth, email, password), 5000, 'Login taking too long. Check connection.');
          // Check if user account is banned before proceeding
          const uSnap = await getDoc(doc(db, 'users', userCred.user.uid));
          if (uSnap.exists() && uSnap.data()?.isBanned) {
            const uData = uSnap.data();
            const banMsg = uData?.banReason || 'Your account has been permanently blocked by administration.';
            let uIgn = extractUserIgn(uData);
            if (!uIgn) {
              uIgn = await fetchRegistrationIgnFallback(userCred.user.uid);
            }
            await auth.signOut();
            setUserBanInfo({
              reason: banMsg,
              username: uData?.username,
              ign: uIgn,
              email: uData?.email || email,
              userId: userCred.user.uid
            });
            setErrors({ general: `Account Blocked: ${banMsg}` });
            setLoading(false);
            return;
          }
          await updateDoc(doc(db, 'users', userCred.user.uid), {
            lastLoginAt: serverTimestamp(),
            lastActive: serverTimestamp(),
            deviceId: getDeviceId(),
            deviceFingerprint: getDeviceFingerprint(),
            deviceInfo: getDeviceInfo()
          }).catch(console.warn);
          try {
            sessionStorage.setItem(`ap_login_stamped_${userCred.user.uid}`, '1');
          } catch {}
          onLogin();
        } catch (error: any) {
          setErrors({ general: mapAuthError(error.code || error.message) });
        }
      } else {
        try {
          const userCredential = await withTimeout(
            createUserWithEmailAndPassword(auth, email, password),
            5000,
            'Signup taking too long. Check connection.'
          );
          const firebaseUser = userCredential.user;

          const deviceId = getDeviceId();
          const deviceFingerprint = getDeviceFingerprint();
          const deviceInfo = getDeviceInfo();

          const myReferralCode = generateReferralCode();
          const finalReferredBy = referralInput.trim() || getReferrerFromUrl() || null;

          let initialWallet = { deposit: 0, winnings: 0, bonus: 0 };
          let referralClaimed = false;

          if (finalReferredBy) {
            try {
              const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
              const refSettings = settingsSnap.exists() ? settingsSnap.data()?.referral : null;
              const rewardType = refSettings?.rewardType || 'bonus';
              const newUserReward = Number(
                refSettings?.newUserReward > 0 
                  ? refSettings.newUserReward 
                  : (refSettings?.perReferralReward || 10)
              );

              if (newUserReward > 0) {
                if (rewardType === 'deposit') {
                  initialWallet = { deposit: newUserReward, winnings: 0, bonus: 0 };
                } else if (rewardType === 'both') {
                  const depPct = Number(refSettings?.depositPercentage || 50);
                  const depAmt = Math.round((newUserReward * depPct) / 100);
                  const bonusAmt = newUserReward - depAmt;
                  initialWallet = { deposit: depAmt, winnings: 0, bonus: bonusAmt };
                } else {
                  initialWallet = { deposit: 0, winnings: 0, bonus: newUserReward };
                }
              }
              referralClaimed = true;

              const refCodeUpper = finalReferredBy.toUpperCase();
              const qCode = query(collection(db, 'users'), where('referralCode', '==', refCodeUpper));
              let refSnap = await getDocs(qCode);
              if (refSnap.empty) {
                const qUser = query(collection(db, 'users'), where('username', '==', finalReferredBy));
                refSnap = await getDocs(qUser);
              }
              if (!refSnap.empty) {
                const referrerId = refSnap.docs[0].id;
                const perRefReward = Number(refSettings?.perReferralReward || 0);
                if (perRefReward > 0) {
                  const refUpdates: any = {};
                  if (rewardType === 'deposit') refUpdates['wallet.deposit'] = increment(perRefReward);
                  else if (rewardType === 'both') {
                    const depPct = Number(refSettings?.depositPercentage || 50);
                    const depAmt = Math.round((perRefReward * depPct) / 100);
                    const bonusAmt = perRefReward - depAmt;
                    if (depAmt > 0) refUpdates['wallet.deposit'] = increment(depAmt);
                    if (bonusAmt > 0) refUpdates['wallet.bonus'] = increment(bonusAmt);
                  } else {
                    refUpdates['wallet.bonus'] = increment(perRefReward);
                  }
                  
                  await updateDoc(doc(db, 'users', referrerId), refUpdates).catch(async () => {
                    const rSnap = await getDoc(doc(db, 'users', referrerId));
                    if (rSnap.exists()) {
                      const rData = rSnap.data();
                      const curWallet = rData.wallet || { deposit: 0, winnings: 0, bonus: 0 };
                      if (rewardType === 'deposit') curWallet.deposit = (curWallet.deposit || 0) + perRefReward;
                      else if (rewardType === 'both') {
                        const depPct = Number(refSettings?.depositPercentage || 50);
                        const depAmt = Math.round((perRefReward * depPct) / 100);
                        const bonusAmt = perRefReward - depAmt;
                        curWallet.deposit = (curWallet.deposit || 0) + depAmt;
                        curWallet.bonus = (curWallet.bonus || 0) + bonusAmt;
                      } else {
                        curWallet.bonus = (curWallet.bonus || 0) + perRefReward;
                      }
                      await setDoc(doc(db, 'users', referrerId), { wallet: curWallet }, { merge: true });
                    }
                  });

                  await setDoc(doc(collection(db, 'transactions')), {
                    userId: referrerId,
                    type: rewardType === 'deposit' ? 'deposit' : 'bonus',
                    amount: perRefReward,
                    status: 'completed',
                    title: `🎁 Referral Reward: ${username} joined using your code (${finalReferredBy})`,
                    createdAt: serverTimestamp()
                  }).catch(console.warn);
                }
              }
            } catch (refErr) {
              console.warn("Direct referral setup notice:", refErr);
            }
          }

          try {
            await withTimeout(
              setDoc(doc(db, 'users', firebaseUser.uid), {
                username,
                email,
                phone,
                authProvider: 'password',
                profileCompleted: false,
                ...DEFAULT_USER_DATA,
                wallet: initialWallet,
                referralCode: myReferralCode,
                referredBy: finalReferredBy,
                deviceId,
                deviceFingerprint,
                deviceInfo,
                lastLoginAt: serverTimestamp(),
                lastActive: serverTimestamp(),
                referralClaimed,
                createdAt: serverTimestamp(),
              }),
              3000,
              'Profile creation delayed.'
            );
            try {
              sessionStorage.setItem(`ap_login_stamped_${firebaseUser.uid}`, '1');
            } catch {}

            const totalBonus = initialWallet.deposit + initialWallet.bonus;
            if (totalBonus > 0) {
              await setDoc(doc(collection(db, 'transactions')), {
                userId: firebaseUser.uid,
                type: initialWallet.deposit > 0 ? 'deposit' : 'bonus',
                amount: totalBonus,
                status: 'completed',
                title: `🎁 Signup Bonus: Used Referral Code (${finalReferredBy})`,
                createdAt: serverTimestamp()
              }).catch(console.warn);
            }
          } catch (fsError) {
            console.warn('Firestore profile creation failed or timed out:', fsError);
            setErrors({ general: 'Profile created with warnings. Please update phone in settings later.' });
          }

          setSuccessMsg('Registration successful! Redirecting...');
          onLogin();
        } catch (error: any) {
          setErrors({ general: mapAuthError(error.code || error.message) });
        }
      }
    } catch (err: any) {
      setErrors({ general: err.message || 'Something went wrong' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setErrors({});
    try {
      const devBanStatus = await checkDeviceBan();
      if (devBanStatus.isBlacklisted) {
        setDeviceBanStatus(devBanStatus);
        setErrors({ general: 'This device is permanently blacklisted due to FairPlay / hack violation. Google login is blocked.' });
        setLoading(false);
        return;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        const result = await signInWithPopup(auth, provider);
        const firebaseUser = result.user;
        const uSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          if (uData?.isBanned) {
            const banMsg = uData?.banReason || 'Your account has been permanently blocked by administration.';
            let uIgn = extractUserIgn(uData);
            if (!uIgn) {
              uIgn = await fetchRegistrationIgnFallback(firebaseUser.uid);
            }
            await auth.signOut();
            setUserBanInfo({
              reason: banMsg,
              username: uData?.username,
              ign: uIgn,
              email: uData?.email || firebaseUser.email || '',
              userId: firebaseUser.uid
            });
            setErrors({ general: `Account Blocked: ${banMsg}` });
            setLoading(false);
            return;
          }
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            authProvider: 'google',
            lastLoginAt: serverTimestamp(),
            lastActive: serverTimestamp(),
            deviceId: getDeviceId(),
            deviceFingerprint: getDeviceFingerprint(),
            deviceInfo: getDeviceInfo()
          }).catch(console.warn);
        }
        try {
          sessionStorage.setItem(`ap_login_stamped_${firebaseUser.uid}`, '1');
        } catch {}
        onLogin();
      } catch (popupErr: any) {
        if (popupErr?.code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider);
          return;
        }
        if (popupErr?.code === 'auth/popup-closed-by-user' || popupErr?.code === 'auth/cancelled-popup-request') {
          setErrors({ general: 'Google sign-in was cancelled. Please try again.' });
          setLoading(false);
          return;
        }
        throw popupErr;
      }
    } catch (error: any) {
      console.error('Google Login failed:', error);
      setErrors({ general: error.message || 'Google login failed. Try email login.' });
    } finally {
      setLoading(false);
    }
  };

  if (deviceBanStatus?.isBlacklisted) {
    return (
      <DeviceBannedScreen
        type="device"
        reason={deviceBanStatus.reason}
        username={deviceBanStatus.bannedUsername}
        ign={deviceBanStatus.bannedUserIgn}
        email={deviceBanStatus.bannedUserEmail}
        bannedUserId={deviceBanStatus.bannedUserId}
      />
    );
  }

  if (userBanInfo) {
    return (
      <DeviceBannedScreen
        type="user"
        reason={userBanInfo.reason}
        username={userBanInfo.username}
        ign={userBanInfo.ign}
        email={userBanInfo.email}
        bannedUserId={userBanInfo.userId}
        onLogout={() => setUserBanInfo(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col px-4 pt-10 pb-8 max-w-lg mx-auto relative text-slate-900">
      <div className="flex-1 flex flex-col pt-4">
        <div className="mb-8 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mb-3 p-2.5 bg-white rounded-3xl border border-slate-200 shadow-sm"
          >
            <SafeImage 
              src={APP_LOGO_SQUARE} 
              alt="Logo" 
              className="w-20 h-auto rounded-2xl"
            />
          </motion.div>
          <h1 className="text-xl font-black tracking-tight uppercase text-slate-900">
            AP <span className="text-[#16A34A]">Tournament</span>
          </h1>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">Start winning real rewards</p>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-8 shadow-sm relative overflow-hidden mb-6">
          <div className="flex gap-2 mb-7 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => { setIsLogin(true); setErrors({}); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                isLogin ? 'bg-[#16A34A] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => { setIsLogin(false); setErrors({}); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                !isLogin ? 'bg-[#16A34A] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Register
            </button>
          </div>

          {errors.general && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-[11px] font-bold"
            >
              <AlertCircle size={15} className="shrink-0" />
              {errors.general}
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-[#16A34A] text-[11px] font-bold"
            >
              <CheckCircle2 size={15} className="shrink-0" />
              {successMsg}
            </motion.div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <AnimatePresence mode="wait">
              {isLogin ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 ml-1 block">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className={`w-full h-11 bg-slate-50 focus:bg-white rounded-xl px-4 text-xs font-semibold text-slate-900 border transition-colors focus:outline-hidden ${
                        errors.email ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                      }`}
                    />
                    {errors.email && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1">{errors.email}</span>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 ml-1 block">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`w-full h-11 bg-slate-50 focus:bg-white rounded-xl pl-4 pr-10 text-xs font-semibold text-slate-900 border transition-colors focus:outline-hidden ${
                          errors.password ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1">{errors.password}</span>}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotPasswordLoading || loading}
                      className="text-[10px] font-extrabold uppercase tracking-wider text-[#16A34A] hover:text-[#15803D] transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      {forgotPasswordLoading && <div className="w-2.5 h-2.5 border border-[#16A34A]/30 border-t-[#16A34A] rounded-full animate-spin" />}
                      Forgot Password?
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 ml-1 block">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      className={`w-full h-11 bg-slate-50 focus:bg-white rounded-xl px-4 text-xs font-semibold text-slate-900 border transition-colors focus:outline-hidden ${
                        errors.username ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                      }`}
                    />
                    {errors.username && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1">{errors.username}</span>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 ml-1 block">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className={`w-full h-11 bg-slate-50 focus:bg-white rounded-xl px-4 text-xs font-semibold text-slate-900 border transition-colors focus:outline-hidden ${
                        errors.email ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                      }`}
                    />
                    {errors.email && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1">{errors.email}</span>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 ml-1 block">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10 digit number"
                      className={`w-full h-11 bg-slate-50 focus:bg-white rounded-xl px-4 text-xs font-semibold text-slate-900 border transition-colors focus:outline-hidden ${
                        errors.phone ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                      }`}
                    />
                    {errors.phone && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1">{errors.phone}</span>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 ml-1 block">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className={`w-full h-11 bg-slate-50 focus:bg-white rounded-xl pl-4 pr-10 text-xs font-semibold text-slate-900 border transition-colors focus:outline-hidden ${
                          errors.password ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1">{errors.password}</span>}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 ml-1">Referral Code (Optional)</label>
                      <span className="text-[9px] text-[#16A34A] font-extrabold uppercase tracking-wider flex items-center gap-1">
                        <Ticket size={11} /> Bonus Reward
                      </span>
                    </div>
                    <input
                      type="text"
                      value={referralInput}
                      onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                      placeholder="e.g. AP8428"
                      className={`w-full h-11 bg-slate-50 focus:bg-white rounded-xl px-4 text-xs font-bold text-slate-900 uppercase font-mono tracking-wider border transition-colors focus:outline-hidden ${
                        errors.referral ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                      }`}
                    />
                    {errors.referral && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1">{errors.referral}</span>}
                  </div>

                  <div className="pt-2 space-y-1">
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={consentAgreed}
                        onChange={(e) => setConsentAgreed(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#16A34A] focus:ring-[#16A34A] cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-600 leading-relaxed">
                        I am 18+ (or have parental consent) and agree to DPDP data processing as per{' '}
                        <button 
                          type="button" 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPolicyModal('privacy'); }}
                          className="text-[#16A34A] font-bold underline hover:text-[#15803D] transition-colors cursor-pointer"
                        >
                          Privacy Notice
                        </button>{' '}
                        &{' '}
                        <button 
                          type="button" 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPolicyModal('terms'); }}
                          className="text-[#16A34A] font-bold underline hover:text-[#15803D] transition-colors cursor-pointer"
                        >
                          Terms
                        </button>.
                      </span>
                    </label>
                    {errors.consent && <span className="text-[9px] text-red-600 font-bold uppercase tracking-wider ml-1 block">{errors.consent}</span>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#16A34A] hover:bg-[#15803D] text-white font-black h-12 rounded-xl mt-4 shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all text-xs uppercase tracking-[0.2em] disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                isLogin ? 'Login' : 'Register'
              )}
            </button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">OR</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-black h-12 rounded-xl shadow-2xs flex items-center justify-center gap-3 active:scale-95 transition-all text-xs uppercase tracking-[0.15em] disabled:opacity-50 cursor-pointer"
          >
            <Chrome size={18} className="text-[#16A34A]" />
            {loading ? 'Processing...' : 'Continue with Google'}
          </button>
          
          <div className="text-xs text-center mt-6 text-slate-500">
            {isLogin ? 'New player?' : 'Existing player?'}{' '}
            <button 
              type="button"
              disabled={loading}
              onClick={() => { setIsLogin(!isLogin); setErrors({}); setSuccessMsg(''); }} 
              className="text-[#16A34A] font-extrabold hover:underline disabled:no-underline cursor-pointer"
            >
              {isLogin ? 'Register here' : 'Login here'}
            </button>
          </div>
        </div>
      </div>
      
      <div className="space-y-2.5 text-center px-2">
        <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">
          By continuing, you agree to our{' '}
          <button 
            type="button"
            onClick={() => setPolicyModal('terms')}
            className="text-[#16A34A] font-bold underline hover:text-[#15803D] transition-colors cursor-pointer"
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <button 
            type="button"
            onClick={() => setPolicyModal('privacy')}
            className="text-[#16A34A] font-bold underline hover:text-[#15803D] transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
        </p>
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] text-slate-600 leading-relaxed font-medium shadow-2xs">
          <p className="font-bold text-slate-800 uppercase tracking-wider mb-1">🎮 Game of Skill & Legal Compliance</p>
          AP Tournament hosts skill-based Esports events. Not a gambling platform. Participation restricted in states where online skill-gaming is prohibited by law (e.g. Assam, Odisha, Telangana, Andhra Pradesh). 18+ Only.
        </div>
      </div>

      <AnimatePresence>
        {policyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setPolicyModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh] text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#ECFDF5] text-[#16A34A] border border-[#BBF7D0] rounded-xl">
                    {policyModal === 'privacy' ? <Shield size={20} /> : <BookOpen size={20} />}
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                      {policyModal === 'privacy' ? 'Privacy & DPDP Notice' : 'Terms of Service'}
                    </h3>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                      {policyModal === 'privacy' ? 'AP Tournament Security & Legal Privacy' : 'AP Tournament Usage & Game Rules'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setPolicyModal(null)}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs text-slate-600 leading-relaxed font-medium no-scrollbar">
                {policyModal === 'privacy' ? (
                  appSettings?.privacyPolicy ? (
                    <div className="whitespace-pre-wrap font-sans text-slate-700">
                      {appSettings.privacyPolicy}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <FileText size={14} className="text-[#16A34A]" /> 1. Data Collected & Purpose
                        </h4>
                        <p className="text-slate-600 text-[11px]">
                          Under DPDP Act 2023, we collect Username, Email, Phone Number, and Free Fire IGN strictly for custom room matchmaking, slot booking, and wallet prize payouts.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <UserCheck size={14} className="text-[#16A34A]" /> 2. Data Principal Rights
                        </h4>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                          <li><strong>Access:</strong> View your stored profile data anytime.</li>
                          <li><strong>Correction:</strong> Modify inaccurate profile details.</li>
                          <li><strong>Erasure:</strong> Request full deletion of your account and personal data.</li>
                          <li><strong>Withdraw Consent:</strong> Revoke consent anytime without penalty.</li>
                        </ul>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <Lock size={14} className="text-[#16A34A]" /> 3. Security & Storage
                        </h4>
                        <p className="text-slate-600 text-[11px]">
                          Data is encrypted in transit and at rest. We never sell or share your personal information with 3rd-party advertisers.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <Trash2 size={14} className="text-[#16A34A]" /> 4. DPO Contact & Grievance
                        </h4>
                        <p className="text-slate-600 text-[11px]">
                          Contact Data Protection Officer at: <strong>dpo@aptournament.com</strong> / <strong>support@aptournament.com</strong>
                        </p>
                      </div>
                    </>
                  )
                ) : (
                  appSettings?.termsOfService ? (
                    <div className="whitespace-pre-wrap font-sans text-slate-700">
                      {appSettings.termsOfService}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <Award size={14} className="text-[#16A34A]" /> 1. Game of Skill Declaration
                        </h4>
                        <p className="text-slate-600 text-[11px]">
                          AP Tournament hosts skill-based Esports events. Outcome depends strictly on aiming, reflexes, and strategy. Protected under Article 19(1)(g) of the Constitution of India.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <AlertTriangle size={14} className="text-amber-500" /> 2. Restricted States Notice
                        </h4>
                        <p className="text-slate-600 text-[11px]">
                          Participation in paid cash tournaments is prohibited for residents of <strong>Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, and Sikkim</strong>.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <Shield size={14} className="text-red-600" /> 3. Anti-Cheat & Emulators
                        </h4>
                        <p className="text-slate-600 text-[11px]">
                          Strictly mobile/tablet only. Hacking, OBB scripts, emulators (PC), or slot jumping result in permanent ban and wallet forfeiture.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-black text-slate-900 uppercase text-xs flex items-center gap-2">
                          <FileText size={14} className="text-[#16A34A]" /> 4. IP Disclaimer
                        </h4>
                        <p className="text-slate-600 text-[11px]">
                          Free Fire is owned by Garena. AP Tournament is an independent esports organizer and is not affiliated with or sponsored by Garena.
                        </p>
                      </div>
                    </>
                  )
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 mt-4 shrink-0">
                <button
                  onClick={() => {
                    setPolicyModal(null);
                    setConsentAgreed(true);
                  }}
                  className="w-full py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  I Understand & Accept
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
