import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { Page, User, Transaction, Wallet } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc,
  deleteDoc,
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { ChevronLeft, Shield, ShieldAlert, Wallet as WalletIcon, Trophy, History, Plus, Minus, User as UserIcon, Mail, Phone, Smartphone, Ban, Unlock, AlertTriangle, X, Check, Lock, Calendar, Clock, Gamepad2, Hash } from 'lucide-react';
import { extractUserIgn, extractUserGameUid, fetchRegistrationIgnFallback } from '../utils/deviceHelper';
import { formatUserDateTime } from '../utils/dateUtils';
import {
  DEFAULT_STAFF_PERMISSIONS,
  PRIMARY_ADMIN_EMAIL,
  hasAdminPanelAccess,
  hasSectionPermission,
  isFullAdmin,
  resolveUserRole
} from '../utils/adminPermissions';

interface AdminUserDetailProps {
  user?: User | null;
  onPageChange: (page: Page, id?: string) => void;
}

export default function AdminUserDetail({ user, onPageChange }: AdminUserDetailProps) {
  const { id: userId } = useParams();
  const authEmail = auth.currentUser?.email;
  const authUid = auth.currentUser?.uid;
  const isAdminUser = isFullAdmin(user, authEmail, authUid);
  const canManageUsers = hasSectionPermission(user, 'usersAndBlacklist', authEmail, authUid);
  const canAccessPanel = hasAdminPanelAccess(user, authEmail, authUid);
  const [userData, setUserData] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [joinedMatches, setJoinedMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceModal, setBalanceModal] = useState<{ open: boolean; type: 'add' | 'deduct'; walletType: keyof Wallet } | null>(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  // Ban & Device Blacklist Modal State
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banReasonInput, setBanReasonInput] = useState('Free Fire Hack / Config File');
  const [blacklistDeviceChecked, setBlacklistDeviceChecked] = useState(true);
  const [unbanDeviceChecked, setUnbanDeviceChecked] = useState(true);
  const [isDeviceBlacklisted, setIsDeviceBlacklisted] = useState(false);
  const [isBanProcessing, setIsBanProcessing] = useState(false);
  const [regProfileFallback, setRegProfileFallback] = useState<{ ign: string; gameUid: string }>({ ign: '', gameUid: '' });

  useEffect(() => {
    if (!userId || !canManageUsers) {
      setLoading(false);
      return;
    }

    const unsubscribeUser = onSnapshot(doc(db, 'users', userId), (doc) => {
      if (doc.exists()) {
        setUserData({ id: doc.id, ...doc.data() } as User);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
      setLoading(false);
    });

    const qTransactions = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    const fetchMatches = async () => {
      try {
        const qReg = query(collection(db, 'registrations'), where('userId', '==', userId));
        const regSnap = await getDocs(qReg);
        const regDocs = regSnap.docs.map(d => d.data());
        let fallbackIgn = '';
        let fallbackGameUid = '';
        for (const r of regDocs) {
          if (!fallbackIgn && typeof r.ign === 'string' && r.ign.trim()) fallbackIgn = r.ign.trim();
          if (!fallbackGameUid && typeof r.gameUid === 'string' && r.gameUid.trim()) fallbackGameUid = r.gameUid.trim();
          if (fallbackIgn && fallbackGameUid) break;
        }
        setRegProfileFallback({ ign: fallbackIgn, gameUid: fallbackGameUid });

        const matchIds = regDocs.map(d => d.tournamentId);
        
        if (matchIds.length > 0) {
          const qMatches = query(
            collection(db, 'matches'), 
            where('__name__', 'in', matchIds.slice(0, 30))
          );
          const matchSnap = await getDocs(qMatches);
          const matches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setJoinedMatches(matches);
        }
      } catch (error) {
        console.error("Error fetching matches:", error);
      }
    };

    fetchMatches();

    return () => {
      unsubscribeUser();
      unsubscribeTransactions();
    };
  }, [userId, canManageUsers]);

  // Listen to device blacklist status for this user's deviceId
  useEffect(() => {
    if (!canManageUsers || !userData?.deviceId) {
      setIsDeviceBlacklisted(false);
      return;
    }
    const unsubDevice = onSnapshot(doc(db, 'blacklistedDevices', userData.deviceId), (snap) => {
      setIsDeviceBlacklisted(snap.exists() && snap.data()?.isActive !== false);
    }, () => {});
    return () => unsubDevice();
  }, [userData?.deviceId, canManageUsers]);

  const handleOpenBanModal = () => {
    if (!userData || !canManageUsers) return;
    if (!isAdminUser && resolveUserRole(userData) === 'admin') {
      alert('Staff members cannot ban or modify administrator accounts.');
      return;
    }
    setBanReasonInput(userData.banReason || 'Free Fire Hack / Config File');
    setBlacklistDeviceChecked(Boolean(userData.deviceId));
    setUnbanDeviceChecked(isDeviceBlacklisted || Boolean(userData.isDeviceBanned));
    setBanModalOpen(true);
  };

  const handleConfirmBanAction = async () => {
    if (!userData || !userId || isBanProcessing || !canManageUsers) return;
    if (!isAdminUser && resolveUserRole(userData) === 'admin') return;
    setIsBanProcessing(true);

    try {
      if (!userData.isBanned) {
        // BAN USER (+ Optional Blacklist Device)
        const finalReason = (banReasonInput.trim() || 'Free Fire Hack / FairPlay Violation').slice(0, 480);
        const shouldBlacklist = blacklistDeviceChecked && Boolean(userData.deviceId);

        await updateDoc(doc(db, 'users', userId), {
          isBanned: true,
          isDeviceBanned: shouldBlacklist,
          banReason: finalReason,
          bannedAt: serverTimestamp()
        });

        if (shouldBlacklist && userData.deviceId) {
          let userIgn = extractUserIgn(userData);
          if (!userIgn) {
            userIgn = await fetchRegistrationIgnFallback(userId);
          }
          await setDoc(doc(db, 'blacklistedDevices', userData.deviceId), {
            deviceId: String(userData.deviceId).slice(0, 128),
            deviceFingerprint: String(userData.deviceFingerprint || '').slice(0, 250),
            deviceInfo: String(userData.deviceInfo || 'Unknown Device').slice(0, 250),
            bannedUserId: String(userId).slice(0, 128),
            bannedUserEmail: String(userData.email || '').slice(0, 190),
            bannedUsername: String(userData.username || '').slice(0, 95),
            bannedUserIgn: String(userIgn || '').slice(0, 95),
            reason: finalReason,
            bannedAt: serverTimestamp(),
            bannedBy: String(auth.currentUser?.email || 'staff').slice(0, 190),
            isActive: true
          });
        }
      } else {
        // UNBAN USER (+ Optional Remove Device from Blacklist)
        await updateDoc(doc(db, 'users', userId), {
          isBanned: false,
          isDeviceBanned: unbanDeviceChecked ? false : Boolean(userData.isDeviceBanned),
          banReason: ''
        });

        if (unbanDeviceChecked && userData.deviceId) {
          await deleteDoc(doc(db, 'blacklistedDevices', userData.deviceId)).catch(console.warn);
        }
      }

      setBanModalOpen(false);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      alert(`Action failed: ${error?.message || 'Permission denied or network error.'}`);
    } finally {
      setIsBanProcessing(false);
    }
  };

  const handleRevokeAdmin = async () => {
    if (!isAdminUser || !userData || !userId) return;
    if ((userData.email || '').trim().toLowerCase() === PRIMARY_ADMIN_EMAIL) return;
    if (confirm(`Remove admin privileges for ${userData.username || userData.email}?`)) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          isAdmin: false,
          role: 'user',
          isStaff: false,
          staffPermissions: { ...DEFAULT_STAFF_PERMISSIONS }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      }
    }
  };

  const handleUpdateBalance = async () => {
    if (!isAdminUser) {
      alert('Only Admins can add or deduct user wallet balance.');
      return;
    }
    if (!userData || !userId || !balanceModal || !amount) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', userId);
      const newBalance = balanceModal.type === 'add' 
        ? userData.wallet[balanceModal.walletType] + numAmount 
        : Math.max(0, userData.wallet[balanceModal.walletType] - numAmount);

      batch.update(userRef, {
        [`wallet.${balanceModal.walletType}`]: newBalance
      });

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        userId,
        type: balanceModal.type === 'add' ? 'deposit' : 'withdraw',
        amount: numAmount,
        status: 'completed',
        title: reason || `Admin ${balanceModal.type} balance (${balanceModal.walletType})`,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setBalanceModal(null);
      setAmount('');
      setReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (!canManageUsers) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pt-24 px-4 text-center max-w-2xl mx-auto border-x border-slate-200">
        <div className="max-w-sm mx-auto bg-white border border-slate-200 rounded-3xl p-7 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mb-4">
            <Lock size={22} />
          </div>
          <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 font-medium mt-1.5">
            You do not have permission to view or manage user profiles.
          </p>
          <button
            onClick={() => onPageChange(canAccessPanel ? Page.ADMIN : Page.HOME)}
            className="mt-5 w-full py-3 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer"
          >
            {canAccessPanel ? 'Back to Admin Panel' : 'Go Home'}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pt-24 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pt-24 px-4 text-center">
        <p className="text-slate-600 font-bold">User not found</p>
        <button onClick={() => onPageChange(Page.ADMIN)} className="mt-4 text-[#16A34A] text-xs font-black uppercase cursor-pointer">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 max-w-2xl mx-auto pt-6 pb-24 px-4 border-x border-slate-200">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => onPageChange(Page.ADMIN)}
          className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-[#16A34A] hover:border-emerald-300 transition-colors cursor-pointer"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900 italic">User Profile</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#16A34A]">Admin Management Panel</p>
        </div>
      </div>

      {/* User Info Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-6 shadow-xs">
        <div className="flex items-start justify-between mb-6 gap-3">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#ECFDF5] rounded-2xl flex items-center justify-center border border-[#BBF7D0] text-[#16A34A] shrink-0">
              <UserIcon size={32} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 italic">{userData.username}</h2>
              <p className="text-xs text-slate-500 font-medium break-all">ID: {userId}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {userData.isBanned && (
                  <span className="inline-block px-2.5 py-0.5 bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-red-200">
                    Account Banned
                  </span>
                )}
                {(isDeviceBlacklisted || userData.isDeviceBanned) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-900 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-full border border-red-500/40">
                    <Lock size={9} /> Device Blacklisted
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdminUser && (userData.isAdmin || userData.role === 'admin') && (userData.email || '').trim().toLowerCase() !== PRIMARY_ADMIN_EMAIL && (
              <button 
                onClick={handleRevokeAdmin}
                title="Revoke Stale Admin Role"
                className="px-3 py-2.5 rounded-2xl border bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Shield size={16} className="text-amber-600" />
                <span>Revoke Admin</span>
              </button>
            )}
            {(isAdminUser || resolveUserRole(userData) !== 'admin') && (
              <button 
                onClick={handleOpenBanModal}
                title={userData.isBanned ? 'Unban / Manage Ban' : 'Block User & Device'}
                className={`px-3 py-2.5 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  userData.isBanned 
                    ? 'bg-emerald-50 border-emerald-200 text-[#16A34A] hover:bg-emerald-100' 
                    : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                }`}
              >
                {userData.isBanned ? <Unlock size={16} /> : <Ban size={16} />}
                <span>{userData.isBanned ? 'Unban' : 'Block'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <Mail size={16} className="text-[#16A34A]" />
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Email Address</p>
              <p className="text-sm font-medium text-slate-900 truncate">{userData.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <Phone size={16} className="text-[#16A34A]" />
            <div>
              <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Phone Number</p>
              <p className="text-sm font-medium text-slate-900">{userData.phone || 'Not provided'}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <Calendar size={16} className="text-[#16A34A] shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Joined Date & Time</p>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {formatUserDateTime(userData.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <Clock size={16} className="text-[#16A34A] shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Last Login Date & Time</p>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {formatUserDateTime(userData.lastLoginAt || userData.lastActive)}
                </p>
              </div>
            </div>
          </div>
          {/* In-Game Profile (IGN & UID) */}
          {(() => {
            const primaryIgn = extractUserIgn(userData) || regProfileFallback.ign;
            const primaryUid = extractUserGameUid(userData) || regProfileFallback.gameUid;
            const perGameEntries = [
              { label: 'Free Fire', ign: userData.gameIGNs?.freefire || userData.ign || '', uid: userData.gameUIDs?.freefire || userData.gameUid || '' },
              { label: 'BGMI', ign: userData.gameIGNs?.bgmi || '', uid: userData.gameUIDs?.bgmi || '' },
              { label: 'COD Mobile', ign: userData.gameIGNs?.codm || '', uid: userData.gameUIDs?.codm || '' }
            ].filter((g) => g.ign || g.uid);

            return (
              <div className="p-3.5 bg-[#ECFDF5]/60 rounded-2xl border border-[#BBF7D0] space-y-2.5">
                <div className="flex items-center gap-2">
                  <Gamepad2 size={15} className="text-[#16A34A]" />
                  <p className="text-[9px] font-black uppercase text-[#15803D] tracking-widest">
                    In-Game Profile (IGN & UID)
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-white rounded-xl p-2.5 border border-emerald-100">
                    <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">In-Game Name (IGN)</p>
                    <p className="text-xs font-extrabold text-slate-900 mt-0.5 truncate select-all">
                      {primaryIgn || <span className="text-slate-400 italic font-medium">Not set</span>}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 border border-emerald-100">
                    <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1">
                      <Hash size={10} className="text-[#16A34A]" /> In-Game UID
                    </p>
                    <p className="text-xs font-black font-mono text-[#16A34A] mt-0.5 truncate select-all">
                      {primaryUid || <span className="text-slate-400 italic font-sans font-medium">Not set</span>}
                    </p>
                  </div>
                </div>
                {perGameEntries.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                    {perGameEntries.map((g) => (
                      <div key={g.label} className="bg-white/90 rounded-xl px-2.5 py-2 border border-slate-200 text-[10px]">
                        <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider mb-0.5">{g.label}</p>
                        <p className="font-bold text-slate-900 truncate">IGN: {g.ign || '—'}</p>
                        <p className="font-bold font-mono text-[#16A34A] truncate">UID: {g.uid || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border ${isDeviceBlacklisted ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <Smartphone size={16} className={isDeviceBlacklisted ? 'text-red-600 shrink-0' : 'text-[#16A34A] shrink-0'} />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Registered Device & Hardware ID</p>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {userData.deviceInfo || 'Android / Web Client'}
                </p>
                <p className="text-[10px] font-mono text-slate-500 truncate">
                  {userData.deviceId || 'Device ID not captured yet'}
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 ${
              isDeviceBlacklisted
                ? 'bg-red-600 text-white'
                : 'bg-emerald-50 text-[#16A34A] border border-emerald-200'
            }`}>
              {isDeviceBlacklisted ? 'Blacklisted' : 'Active'}
            </span>
          </div>
        </div>
      </div>

      {/* Wallet Breakdown */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 ml-2">Wallet Breakdown</h3>
      <div className="grid grid-cols-1 gap-3 mb-8">
        {(['deposit', 'winnings', 'bonus'] as (keyof Wallet)[]).map((type) => (
          <div key={type} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[#16A34A]">
                <WalletIcon size={18} />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">{type}</p>
                <p className="text-base font-black text-slate-900 italic tabular-nums">₹{(userData.wallet?.[type] || 0).toLocaleString()}</p>
              </div>
            </div>
            {isAdminUser && (
              <div className="flex gap-2">
                <button 
                  onClick={() => setBalanceModal({ open: true, type: 'deduct', walletType: type })}
                  className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl hover:bg-red-100 transition-colors cursor-pointer"
                  title={`Deduct from ${type}`}
                >
                  <Minus size={18} />
                </button>
                <button 
                  onClick={() => setBalanceModal({ open: true, type: 'add', walletType: type })}
                  className="p-2.5 bg-emerald-50 border border-emerald-200 text-[#16A34A] rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
                  title={`Add to ${type}`}
                >
                  <Plus size={18} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats & Matches */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs">
           <Trophy size={20} className="text-[#16A34A] mb-3" />
           <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Matches Played</p>
           <p className="text-2xl font-black text-slate-900 italic tabular-nums">{userData.stats.matchesPlayed}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs">
           <History size={20} className="text-[#16A34A] mb-3" />
           <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Recent Matches</p>
           <p className="text-2xl font-black text-slate-900 italic tabular-nums">{joinedMatches.length}</p>
        </div>
      </div>

      {/* Joined Matches List */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 ml-2">Recent Joined Matches</h3>
      <div className="space-y-3 mb-8">
        {joinedMatches.length > 0 ? (
          joinedMatches.map((match) => (
            <div key={match.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
              <div>
                <p className="text-[10px] font-black text-[#16A34A] uppercase italic mb-1">{match.section}</p>
                <h4 className="text-sm font-black text-slate-900 italic">{match.title}</h4>
                <p className="text-[10px] text-slate-500">{match.time}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-[#16A34A] italic tabular-nums">₹{match.entryFee}</p>
                <span className={`text-[9px] font-black uppercase tracking-widest ${match.status === 'completed' ? 'text-[#16A34A]' : 'text-[#16A34A]'}`}>
                  {match.status || 'Active'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center">
            <p className="text-xs text-slate-500">No matches joined yet</p>
          </div>
        )}
      </div>

      {/* Transactions History */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 ml-2">Transaction History</h3>
      <div className="space-y-3">
        {transactions.map((tx) => (
          <div key={tx.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl border ${
                tx.type === 'deposit' || tx.type === 'win' ? 'bg-emerald-50 border-emerald-200 text-[#16A34A]' : 'bg-red-50 border-red-200 text-red-600'
              }`}>
                {tx.type === 'deposit' || tx.type === 'win' ? <Plus size={14} /> : <Minus size={14} />}
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 italic">{tx.title || tx.type.toUpperCase()}</h4>
                <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">
                  {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Recent'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-black italic tabular-nums ${
                tx.type === 'deposit' || tx.type === 'win' ? 'text-[#16A34A]' : 'text-red-600'
              }`}>
                {tx.type === 'deposit' || tx.type === 'win' ? '+' : '-'}₹{tx.amount}
              </p>
              <p className={`text-[8px] font-black uppercase tracking-widest ${
                tx.status === 'completed' ? 'text-[#16A34A]' : 'text-amber-600'
              }`}>
                {tx.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Balance Modal */}
      {isAdminUser && balanceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setBalanceModal(null)}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-sm bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border ${
              balanceModal.type === 'add' ? 'bg-emerald-50 border-emerald-200 text-[#16A34A]' : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              {balanceModal.type === 'add' ? <Plus size={32} /> : <Minus size={32} />}
            </div>
            
            <h2 className="text-2xl font-black text-slate-900 italic mb-2">
              {balanceModal.type === 'add' ? 'Add' : 'Deduct'} Balance
            </h2>
            <p className="text-xs text-slate-600 font-medium mb-6">
              Adjusting <span className="text-[#16A34A] font-black uppercase italic">{balanceModal.walletType}</span> for {userData.username}
            </p>

            <div className="space-y-4 mb-8">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Amount (₹)</label>
                <input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold placeholder:text-slate-400 focus:outline-none focus:border-[#16A34A] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Reason (Optional)</label>
                <input 
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Winning Prize"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-bold placeholder:text-slate-400 focus:outline-none focus:border-[#16A34A] transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setBalanceModal(null)}
                className="flex-1 px-4 py-4 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateBalance}
                disabled={!amount}
                className={`flex-1 px-4 py-4 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 cursor-pointer ${
                  balanceModal.type === 'add' ? 'bg-[#16A34A] hover:bg-[#15803D]' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Ban & Device Blacklist Modal */}
      <AnimatePresence>
        {banModalOpen && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => !isBanProcessing && setBanModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              className="relative w-full max-w-md bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-7 shadow-2xl text-slate-900"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${
                    userData.isBanned
                      ? 'bg-emerald-50 border-emerald-200 text-[#16A34A]'
                      : 'bg-red-50 border-red-200 text-red-600'
                  }`}>
                    {userData.isBanned ? <Unlock size={22} /> : <ShieldAlert size={22} />}
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-slate-900">
                      {userData.isBanned ? 'Unban Player & Device' : 'Block Hacker / Ban User'}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {userData.username} • {userData.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isBanProcessing && setBanModalOpen(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Device Fingerprint Summary */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl mb-4 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-black uppercase text-slate-500 tracking-wider">Device Info:</span>
                  <span className="font-bold text-slate-900">{userData.deviceInfo || 'Unknown Device'}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-black uppercase text-slate-500 tracking-wider">Hardware ID:</span>
                  <span className="font-mono font-bold text-slate-700 truncate max-w-[190px]">
                    {userData.deviceId || 'Not recorded yet'}
                  </span>
                </div>
              </div>

              {!userData.isBanned ? (
                <div className="space-y-4">
                  {/* Ban Reason Input + Quick Presets */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                      Violation / Ban Reason
                    </label>
                    <input
                      type="text"
                      value={banReasonInput}
                      onChange={(e) => setBanReasonInput(e.target.value)}
                      placeholder="e.g. Free Fire Hack / Config File"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-red-500 transition-colors"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Free Fire Hack / Config File',
                        'Headshot Hack / Injector',
                        'Teaming / Cheating',
                        'Emulator / Banned App'
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setBanReasonInput(preset)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                            banReasonInput === preset
                              ? 'bg-red-50 border-red-300 text-red-700'
                              : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Blacklist Device Checkbox */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      !userData.deviceId
                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                        : blacklistDeviceChecked
                        ? 'bg-red-50/80 border-red-500 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={blacklistDeviceChecked && Boolean(userData.deviceId)}
                      disabled={!userData.deviceId}
                      onChange={(e) => setBlacklistDeviceChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500 accent-red-600 cursor-pointer shrink-0"
                    />
                    <div>
                      <p className="text-xs font-black uppercase tracking-tight text-red-700 flex items-center gap-1.5">
                        <Smartphone size={14} /> Blacklist Device (Hardware Ban)
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600 leading-relaxed mt-0.5">
                        {userData.deviceId
                          ? 'Checked rakhne par is phone/device me app kabhi nahi khulega, login nahi hoga aur na hi naya account ban payega.'
                          : 'Is user ka Device ID record nahi hua hai (sirf account ban hoga).'}
                      </p>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-bold text-amber-800 flex items-start gap-2">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="uppercase text-[10px] font-black tracking-wider">Ban Reason:</p>
                      <p>{userData.banReason || 'FairPlay Violation'}</p>
                    </div>
                  </div>

                  {userData.deviceId && (isDeviceBlacklisted || userData.isDeviceBanned) && (
                    <label
                      className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        unbanDeviceChecked
                          ? 'bg-emerald-50 border-[#16A34A]'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={unbanDeviceChecked}
                        onChange={(e) => setUnbanDeviceChecked(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-emerald-300 text-[#16A34A] accent-[#16A34A] cursor-pointer shrink-0"
                      />
                      <div>
                        <p className="text-xs font-black uppercase tracking-tight text-[#16A34A]">
                          Remove Device From Blacklist
                        </p>
                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                          Is user ka phone hardware blacklist se bhi hata dein taaki app dobara chal sake.
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  disabled={isBanProcessing}
                  onClick={() => setBanModalOpen(false)}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest rounded-2xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBanProcessing}
                  onClick={handleConfirmBanAction}
                  className={`flex-1 py-3.5 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    userData.isBanned
                      ? 'bg-[#16A34A] hover:bg-[#15803D]'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isBanProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : userData.isBanned ? (
                    <>
                      <Check size={16} /> Confirm Unban
                    </>
                  ) : (
                    <>
                      <Ban size={16} /> Confirm Block
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
