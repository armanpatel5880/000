import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Shield, Users, Trophy, DollarSign, Settings, 
  Search, Ban, Unlock, Wallet, Plus, Minus, Trash2, 
  Clock, Map as MapIcon, Users as UsersIcon, LogOut,
  CheckCircle2, AlertCircle, Loader2, Save, RefreshCw,
  Edit2, Copy, Upload, Gamepad2, Key, Check, CheckCheck,
  ListChecks, FileText, Sparkles, PlusCircle, RotateCcw,
  Filter, ChevronUp, ChevronDown, Send, Bell, Smartphone, Landmark, X, Banknote, Lock, ShieldAlert, AlertTriangle,
  Menu, LayoutDashboard, ChevronRight, Image as ImageIcon, ShieldCheck
} from 'lucide-react';
import { AdminSectionKey, Page, User, Tournament, Banner, PaymentGateway, BlacklistedDevice } from '../types';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatMatchTime, formatUserDateTime } from '../utils/dateUtils';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';
import AdminNotificationsTab from '../components/AdminNotificationsTab';
import AdminStaffManagementTab from '../components/AdminStaffManagementTab';
import { extractUserIgn, fetchRegistrationIgnFallback } from '../utils/deviceHelper';
import {
  getAllowedAdminSections,
  hasAdminPanelAccess,
  hasSectionPermission,
  isFullAdmin,
  resolveUserRole
} from '../utils/adminPermissions';

import { 
  collection, doc, onSnapshot, updateDoc, deleteDoc,
  addDoc, serverTimestamp, runTransaction, writeBatch,
  query, where, orderBy, getDocs, increment, setDoc, getDoc, limit
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

interface AdminPageProps {
  user?: User | null;
  onPageChange: (page: Page, id?: string) => void;
}

enum AdminTab {
  DASHBOARD = 'dashboard',
  WITHDRAWALS = 'withdrawals',
  NOTIFICATIONS = 'notifications',
  USERS = 'users',
  MATCHES = 'matches',
  TRANSACTIONS = 'transactions',
  RULES = 'rules',
  REFERRAL = 'referral',
  BANNERS = 'banners',
  MODES = 'modes',
  PAYMENT = 'payment',
  STAFF_MANAGEMENT = 'staff_management'
}

const TAB_TO_PERMISSION: Partial<Record<AdminTab, AdminSectionKey>> = {
  [AdminTab.DASHBOARD]: 'dashboard',
  [AdminTab.WITHDRAWALS]: 'withdrawals',
  [AdminTab.NOTIFICATIONS]: 'notifications',
  [AdminTab.USERS]: 'usersAndBlacklist',
  [AdminTab.MATCHES]: 'matches',
  [AdminTab.TRANSACTIONS]: 'transactions',
  [AdminTab.RULES]: 'gameRules',
  [AdminTab.MODES]: 'gameModes',
  [AdminTab.BANNERS]: 'banners',
  [AdminTab.REFERRAL]: 'referralAndSupport',
  [AdminTab.PAYMENT]: 'paymentGateways'
};

const PERMISSION_TO_TAB: Record<AdminSectionKey, AdminTab> = {
  dashboard: AdminTab.DASHBOARD,
  withdrawals: AdminTab.WITHDRAWALS,
  notifications: AdminTab.NOTIFICATIONS,
  usersAndBlacklist: AdminTab.USERS,
  matches: AdminTab.MATCHES,
  transactions: AdminTab.TRANSACTIONS,
  gameRules: AdminTab.RULES,
  gameModes: AdminTab.MODES,
  banners: AdminTab.BANNERS,
  referralAndSupport: AdminTab.REFERRAL,
  paymentGateways: AdminTab.PAYMENT
};

// Built-in rule presets for various game modes and sections
const RULE_PRESETS: Record<string, { title: string; category: string; rules: string[] }> = {
  battle_royale: {
    title: 'Battle Royale',
    category: 'Battle Royale',
    rules: [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: Strictly mobile & tablet devices only. Emulators/PC are 100% prohibited.',
      'Registration Name: Enter exact in-game IGN without font errors or unsupported special characters.',
      'Anti-Teaming Rule: Teaming with opponents is strictly prohibited and results in permanent ban.',
      'Hacking & Scripts: Zero-tolerance policy for aimbots, auto-headshots, speed hacks, or modified game files.',
      'Late Entry: Room closes 2 minutes before match start time. Late entry is not entertained.',
      'Screenshot Policy: In case of ranking/kill dispute, high-definition final match screenshot is mandatory.',
      'Match Result Policy: Scores will be verified by the admin team post-match before prize distribution.',
      'Cancellation & Refund Policy: If a match is cancelled by admin, 100% of entry fee is refunded back to wallet instantly.'
    ]
  },
  clash_squad: {
    title: 'Clash Squad (4v4 / Duo)',
    category: 'Clash Squad',
    rules: [
      'Level Requirement: Minimum Level 40 in Free Fire account.',
      'Headshot Rate: Clash Squad headshot rate must remain below 70%.',
      'Device Requirements: Mobile & Tablet only. Emulators will be immediately kicked and banned.',
      'Gun Attributes: Gun attributes and character skill settings will be as per custom room setup.',
      'Grenades & Items: Usage of limited tactical items will follow room preset rules.',
      'Teaming & Sabotage: Teaming or intentional feeding is strictly forbidden.',
      'Screenshot Policy: Winning team captain must submit end-game score screenshot in case of dispute.',
      'Prize Distribution: Winnings will be credited automatically to winning player/team wallets post verification.',
      'Admin Decision: Admin ruling will be final and binding for all participants.'
    ]
  },
  lone_wolf: {
    title: 'Lone Wolf (1v1 / 2v2)',
    category: 'Lone Wolf',
    rules: [
      'Level Requirement: Level 30+ Free Fire profile.',
      'Headshot Rate: Lone Wolf headshot rate maximum 75%.',
      'Device Requirements: Mobile / Tablet players only. No PC / Emulators.',
      'Fair Duel: One-on-one duel requires true sportsman spirit without glitch exploiting.',
      'Weapon Restrictions: Respect custom weapon restrictions if specified in room title (e.g. M1887 only, Sniper only).',
      'Disconnect Policy: If a player disconnects mid-round, rematch will only be granted if admin verifies technical glitch.',
      'Screenshot Requirement: Final victory screen screenshot mandatory for dispute settlement.',
      'Instant Payout: Winnings credited within 10-15 minutes after match confirmation.'
    ]
  },
  custom_room: {
    title: 'Custom Room / Tournament',
    category: 'Custom Room',
    rules: [
      'All standard esports tournament fairplay rules apply.',
      'Slot Assignment: Players must join ONLY their assigned slot number. Wrong slot leads to kick without refund.',
      'Room Settings: Custom room parameters (Ammo, Fall Damage, Character Skills) are set as specified in match title.',
      'No third-party crosshairs, config files, or GFX tools allowed.',
      'Admin decision is final in all dispute settlements.'
    ]
  },
  sniper_only: {
    title: 'Sniper Only Challenge',
    category: 'Sniper Only',
    rules: [
      'Only Sniper Rifles (AWM, Kar98k, M82B, Barrett) are permitted for combat.',
      'Using pistols, melee, or AR/SMG weapons will result in immediate disqualification with 0 points.',
      'No emulator or modified script allowed.',
      'Final kill feed and damage screenshot must be submitted.'
    ]
  },
  four_v_four: {
    title: '4v4 Clash Duel',
    category: '4v4 Clash',
    rules: [
      'Full squad (4 players) must be ready before room launch time.',
      'All 4 players must have registered with valid IGNs.',
      'No roof camping or out-of-bounds wall glitching.',
      'First team to win the required round count wins the contest.'
    ]
  },
  one_v_one: {
    title: '1v1 Duel Arena',
    category: '1v1 Duel',
    rules: [
      'Pure 1v1 head-to-head showdown on chosen map.',
      'Gun selection rules as specified in room rules (e.g. Desert Eagle only or Shotgun only).',
      'No wall-trapping or infinite gloo wall glitch.',
      'Proof screenshot required for claiming bounty prize.'
    ]
  }
};

export default function AdminPage({ user, onPageChange }: AdminPageProps) {
  const authEmail = auth.currentUser?.email;
  const authUid = auth.currentUser?.uid;
  const isAdminUser = isFullAdmin(user, authEmail, authUid);
  const canAccessPanel = hasAdminPanelAccess(user, authEmail, authUid);
  const allowedSections = React.useMemo(
    () => getAllowedAdminSections(user, authEmail, authUid),
    [user, authEmail, authUid]
  );

  const allowedSectionsKey = allowedSections.join(',');
  const onPageChangeRef = React.useRef(onPageChange);
  React.useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  const canAccessSection = React.useCallback(
    (section: AdminSectionKey) => hasSectionPermission(user, section, authEmail, authUid),
    [user, authEmail, authUid]
  );

  const isTabAllowed = React.useCallback(
    (tab: AdminTab) => {
      if (tab === AdminTab.STAFF_MANAGEMENT) return isAdminUser;
      const permKey = TAB_TO_PERMISSION[tab];
      if (!permKey) return false;
      return canAccessSection(permKey);
    },
    [isAdminUser, canAccessSection]
  );

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (isAdminUser || canAccessSection('dashboard')) return AdminTab.DASHBOARD;
    const firstKey = allowedSections.find((k) => k !== 'gameModes') || allowedSections[0];
    return firstKey ? PERMISSION_TO_TAB[firstKey] : AdminTab.DASHBOARD;
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersRetryKey, setUsersRetryKey] = useState(0);
  const [usersLimit, setUsersLimit] = useState(500);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [dbUserSearchResults, setDbUserSearchResults] = useState<User[]>([]);
  const [isSearchingUsersInDb, setIsSearchingUsersInDb] = useState(false);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [blacklistedDevices, setBlacklistedDevices] = useState<BlacklistedDevice[]>([]);
  const [usersSubTab, setUsersSubTab] = useState<'all' | 'blacklist'>('all');
  const [banModalUser, setBanModalUser] = useState<User | null>(null);
  const [banReasonInput, setBanReasonInput] = useState('Free Fire Hack / Config File');
  const [blacklistDeviceChecked, setBlacklistDeviceChecked] = useState(true);
  const [unbanDeviceChecked, setUnbanDeviceChecked] = useState(true);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<{ isOpen: boolean, matchId: string }>({ isOpen: false, matchId: '' });
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [selectedMatchResults, setSelectedMatchResults] = useState<Tournament | null>(null);
  const [playerResults, setPlayerResults] = useState<Record<string, number>>({}); // userId -> value (kills or rank)
  const [playerPositionResults, setPlayerPositionResults] = useState<Record<string, number>>({}); // userId -> rank (for PER KILL matches)
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Dynamic Rules State for All Game Mode Sections
  const [gameRulesDocs, setGameRulesDocs] = useState<Record<string, { id: string; title: string; category?: string; section?: string; rules: string[]; updatedAt?: any }>>({});
  const [gameModesList, setGameModesList] = useState<any[]>([]);
  const [activeRuleTab, setActiveRuleTab] = useState<string>('battle_royale');
  const [activeSectionTitle, setActiveSectionTitle] = useState<string>('Battle Royale');
  const [activeSectionCategory, setActiveSectionCategory] = useState<string>('Battle Royale');
  const [ruleText, setRuleText] = useState('');
  const [ruleList, setRuleList] = useState<string[]>([]);
  const [ruleEditMode, setRuleEditMode] = useState<'interactive' | 'raw'>('interactive');
  const [newSingleRuleText, setNewSingleRuleText] = useState('');
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [newSectionForm, setNewSectionForm] = useState({ title: '', category: '', template: 'battle_royale' });

  // Room ID & Password Declaration State
  const [isDeclareRoomModalOpen, setIsDeclareRoomModalOpen] = useState(false);
  const [selectedDeclareRoomMatch, setSelectedDeclareRoomMatch] = useState<Tournament | null>(null);
  const [declareRoomForm, setDeclareRoomForm] = useState({
    roomId: '',
    roomPassword: '',
    setStatusLive: true,
    customNotes: '',
    sendNotificationOnRoomDeclare: true
  });
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'need_room' | 'room_ready' | 'live' | 'completed'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Withdrawals Management State
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('pending');
  const [withdrawalSearch, setWithdrawalSearch] = useState('');
  const [approvalModalTx, setApprovalModalTx] = useState<any | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [rejectionModalTx, setRejectionModalTx] = useState<any | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [copiedWithdrawalId, setCopiedWithdrawalId] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<any>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [bannerType, setBannerType] = useState<Banner['type']>('main');
  const [bannerOrder, setBannerOrder] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [gatewayForm, setGatewayForm] = useState({
    name: '',
    apiKey: '',
    secretKey: '',
    merchantId: '',
    webhookSecret: '',
    upiId: ''
  });

  // Modal back handlers
  useModalBackHandler(isMenuOpen, () => setIsMenuOpen(false));
  useModalBackHandler(isDeleteConfirmOpen.isOpen, () => setIsDeleteConfirmOpen({ isOpen: false, matchId: '' }));
  useModalBackHandler(isResultModalOpen, () => setIsResultModalOpen(false));
  useModalBackHandler(isBannerModalOpen, () => setIsBannerModalOpen(false));
  useModalBackHandler(isDeclareRoomModalOpen, () => setIsDeclareRoomModalOpen(false));
  useModalBackHandler(isAddSectionModalOpen, () => setIsAddSectionModalOpen(false));
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log("File picked for banner upload:", file.name);
    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      const downloadURL = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      console.log("Uploaded successfully at 100% original quality:", downloadURL);
      setImageUrl(downloadURL);
      setUploadProgress(100);
    } catch (error: any) {
      console.error('Upload Process Error:', error);
      alert('Upload failed, try again');
    } finally {
      setIsUploading(false);
    }
  };

  // Enforce valid activeTab whenever permissions update in real-time
  useEffect(() => {
    if (!canAccessPanel) return;
    if (!isTabAllowed(activeTab)) {
      const firstNonRouteKey = allowedSections.find((k) => k !== 'gameModes') || allowedSections[0];
      if (firstNonRouteKey) {
        setActiveTab(PERMISSION_TO_TAB[firstNonRouteKey]);
      }
    }
  }, [canAccessPanel, activeTab, allowedSections, isTabAllowed]);

  useEffect(() => {
    setSearchTerm('');
  }, [activeTab]);

  // Scoped real-time listeners (only subscribe to collections required by permitted sections)
  useEffect(() => {
    if (!canAccessPanel) {
      onPageChangeRef.current(Page.HOME);
      return;
    }

    const unsubscribers: (() => void)[] = [];
    const permitted = new Set(allowedSectionsKey.split(',').filter(Boolean));
    const hasPerm = (sec: AdminSectionKey) => isAdminUser || permitted.has(sec);

    const needUsers =
      isAdminUser ||
      hasPerm('dashboard') ||
      hasPerm('withdrawals') ||
      hasPerm('notifications') ||
      hasPerm('usersAndBlacklist');

    if (needUsers) {
      setUsersError(null);
      setLoadingUsers(true);
      unsubscribers.push(
        onSnapshot(query(collection(db, 'users'), limit(usersLimit)), (snapshot) => {
          setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
          setUsersError(null);
          setLoadingUsers(false);
        }, (err: any) => {
          handleFirestoreError(err, OperationType.LIST, 'users');
          setUsersError(err?.message || 'Unable to load users list. Please verify permissions.');
          setLoadingUsers(false);
        })
      );
    } else {
      setUsers([]);
      setLoadingUsers(false);
    }

    const needMatches =
      isAdminUser ||
      hasPerm('dashboard') ||
      hasPerm('matches') ||
      hasPerm('notifications');

    if (needMatches) {
      unsubscribers.push(
        onSnapshot(query(collection(db, 'matches'), limit(250)), (snapshot) => {
          setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'))
      );
    } else {
      setMatches([]);
    }

    const needTransactions =
      isAdminUser ||
      hasPerm('withdrawals') ||
      hasPerm('transactions');

    if (needTransactions) {
      unsubscribers.push(
        onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(500)), (snapshot) => {
          setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'))
      );
    } else {
      setTransactions([]);
    }

    if (hasPerm('gameRules')) {
      unsubscribers.push(
        onSnapshot(collection(db, 'gameRules'), (snapshot) => {
          const docsMap: Record<string, any> = {};
          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            docsMap[docSnap.id] = {
              id: docSnap.id,
              title: data.title || data.section || data.type || docSnap.id.replace(/_/g, ' '),
              category: data.category || data.title || 'General',
              section: data.section || data.title || docSnap.id,
              rules: data.rules || [],
              updatedAt: data.updatedAt
            };
          });
          setGameRulesDocs(docsMap);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'gameRules'))
      );
    }

    if (hasPerm('gameModes') || hasPerm('gameRules')) {
      unsubscribers.push(
        onSnapshot(collection(db, 'gameModes'), (snapshot) => {
          setGameModesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'gameModes'))
      );
    }

    if (hasPerm('referralAndSupport')) {
      unsubscribers.push(
        onSnapshot(doc(db, 'appSettings', 'referral_support'), (snapshot) => {
          if (snapshot.exists()) {
            setAppSettings(snapshot.data());
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, 'appSettings/referral_support'))
      );
    }

    if (hasPerm('banners')) {
      unsubscribers.push(
        onSnapshot(query(collection(db, 'banners'), orderBy('order', 'asc'), limit(50)), (snapshot) => {
          setBanners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'banners'))
      );
    }

    if (hasPerm('paymentGateways')) {
      unsubscribers.push(
        onSnapshot(collection(db, 'paymentSettings'), (snapshot) => {
          setPaymentGateways(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentGateway)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'paymentSettings'))
      );
    }

    if (hasPerm('usersAndBlacklist')) {
      unsubscribers.push(
        onSnapshot(query(collection(db, 'blacklistedDevices'), limit(250)), (snapshot) => {
          setBlacklistedDevices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BlacklistedDevice)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'blacklistedDevices'))
      );
    }

    setLoading(false);
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [canAccessPanel, isAdminUser, allowedSectionsKey, usersLimit, usersRetryKey]);

  // Dashboard Stats
  const totalUsers = users.length;
  const totalMatches = matches.length;
  const totalJoinedPlayers = matches.reduce((acc, m) => acc + (m.playersCount || 0), 0);
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit')
    .reduce((acc, t) => acc + (t.amount || 0), 0);
  const totalWithdrawals = transactions
    .filter(t => t.type === 'withdrawal' || t.type === 'withdraw')
    .reduce((acc, t) => acc + (t.amount || 0), 0);

  // Filtered withdrawal transactions for Admin Management
  const withdrawalTransactions = transactions.filter(
    t => t.type === 'withdraw' || t.type === 'withdrawal'
  );
  const pendingWithdrawals = withdrawalTransactions.filter(t => t.status === 'pending');
  const completedWithdrawals = withdrawalTransactions.filter(t => t.status === 'completed');
  const rejectedWithdrawals = withdrawalTransactions.filter(t => t.status === 'rejected');

  const handleApproveWithdrawal = async (tx: any, utrNote?: string) => {
    if (isProcessing || !tx?.id) return;
    setIsProcessing(true);
    try {
      const txRef = doc(db, 'transactions', tx.id);
      await runTransaction(db, async (transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('Withdrawal transaction not found.');
        if (txSnap.data()?.status !== 'pending') {
          throw new Error(`Withdrawal already ${txSnap.data()?.status || 'processed'}.`);
        }

        transaction.update(txRef, {
          status: 'completed',
          adminNote: utrNote ? `Approved (UTR/Ref: ${utrNote.trim()})` : 'Approved by Admin',
          referenceId: utrNote ? utrNote.trim() : '',
          processedAt: serverTimestamp(),
          processedBy: auth.currentUser?.email || 'admin'
        });
      });

      // Send in-app notification to the user
      try {
        await addDoc(collection(db, 'notifications'), {
          targetUserId: tx.userId,
          title: '✅ Withdrawal Successful!',
          body: `Your withdrawal of ₹${tx.amount} has been approved and transferred successfully.${utrNote ? ` Reference/UTR: ${utrNote.trim()}` : ''}`,
          type: 'wallet',
          readBy: [],
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Notification error:', e);
      }

      setApprovalModalTx(null);
      setUtrInput('');
      alert(`✅ Withdrawal request of ₹${tx.amount} approved successfully!`);
    } catch (err: any) {
      console.error('Approval failed:', err);
      alert(err.message || 'Approval failed. Please check permissions.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectWithdrawal = async (tx: any, reason: string) => {
    if (isProcessing || !tx?.id) return;
    if (!reason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }
    setIsProcessing(true);
    try {
      const txRef = doc(db, 'transactions', tx.id);
      const userRef = doc(db, 'users', tx.userId);
      const refundTxRef = doc(db, 'transactions', `refund_${tx.id}`);
      let refundAmount = Number(tx.amount || 0);

      await runTransaction(db, async (transaction) => {
        const txSnap = await transaction.get(txRef);
        const uSnap = await transaction.get(userRef);
        const existingRefundSnap = await transaction.get(refundTxRef);

        if (!txSnap.exists()) throw new Error('Withdrawal transaction not found');
        if (txSnap.data()?.status !== 'pending') {
          throw new Error(`Withdrawal already ${txSnap.data()?.status || 'processed'}`);
        }
        if (!uSnap.exists()) throw new Error('User not found');

        const txAmount = Number(txSnap.data()?.amount || 0);
        if (!Number.isFinite(txAmount) || txAmount <= 0) {
          throw new Error('Invalid withdrawal refund amount');
        }
        refundAmount = txAmount;

        // 1. Refund the winnings back into user's wallet (only if deterministic refund doc doesn't already exist)
        if (!existingRefundSnap.exists()) {
          transaction.update(userRef, {
            "wallet.winnings": increment(txAmount)
          });

          // 2. Add a deterministic refund transaction record for idempotency & user transparency
          transaction.set(refundTxRef, {
            userId: tx.userId,
            type: 'refund',
            amount: txAmount,
            sourceTransactionId: tx.id,
            status: 'completed',
            title: `Refund: Withdrawal Rejected (${reason.trim()})`,
            createdAt: serverTimestamp()
          });
        }

        // 3. Mark withdrawal transaction as rejected
        transaction.update(txRef, {
          status: 'rejected',
          rejectedReason: reason.trim(),
          adminNote: `Rejected: ${reason.trim()}. Amount refunded back to winnings.`,
          processedAt: serverTimestamp(),
          processedBy: auth.currentUser?.email || 'admin'
        });
      });

      // Send in-app notification to the user
      try {
        await addDoc(collection(db, 'notifications'), {
          targetUserId: tx.userId,
          title: '⚠️ Withdrawal Rejected (Refunded)',
          body: `Your withdrawal of ₹${refundAmount} was rejected: "${reason.trim()}". The full amount has been refunded back to your Winnings balance.`,
          type: 'wallet',
          readBy: [],
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Notification error:', e);
      }

      setRejectionModalTx(null);
      setRejectionReasonInput('');
      alert(`⚠️ Withdrawal rejected. ₹${refundAmount} has been refunded back to the user's winnings.`);
    } catch (err: any) {
      console.error('Rejection failed:', err);
      alert(err.message || 'Rejection failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const mergedAllUsers = React.useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) {
      if (u.id) map.set(u.id, u);
    }
    for (const u of dbUserSearchResults) {
      if (u.id && !map.has(u.id)) map.set(u.id, u);
    }
    return Array.from(map.values());
  }, [users, dbUserSearchResults]);

  const handleFindExactUserInDb = async () => {
    const raw = searchTerm.trim();
    if (!raw || isSearchingUsersInDb || !canAccessSection('usersAndBlacklist')) return;
    setIsSearchingUsersInDb(true);
    try {
      const found: User[] = [];
      if (raw.includes('@')) {
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', raw), limit(10)));
        snap.docs.forEach((d) => found.push({ id: d.id, ...d.data() } as User));
      } else {
        const directSnap = await getDoc(doc(db, 'users', raw));
        if (directSnap.exists()) {
          found.push({ id: directSnap.id, ...directSnap.data() } as User);
        }
        const byUsername = await getDocs(query(collection(db, 'users'), where('username', '==', raw), limit(10)));
        byUsername.docs.forEach((d) => found.push({ id: d.id, ...d.data() } as User));
        const byDevice = await getDocs(query(collection(db, 'users'), where('deviceId', '==', raw), limit(10)));
        byDevice.docs.forEach((d) => found.push({ id: d.id, ...d.data() } as User));
      }

      if (found.length === 0) {
        alert(`No user found in Firestore matching exact "${raw}". Try exact email, username, deviceId, or UID.`);
      } else {
        setDbUserSearchResults((prev) => {
          const map = new Map<string, User>();
          prev.forEach((u) => {
            if (u.id) map.set(u.id, u);
          });
          found.forEach((u) => {
            if (u.id) map.set(u.id, u);
          });
          return Array.from(map.values());
        });
      }
    } catch (e: any) {
      handleFirestoreError(e, OperationType.GET, 'users');
      alert(e?.message || 'Error searching users in database.');
    } finally {
      setIsSearchingUsersInDb(false);
    }
  };

  // User Actions & Device Blacklisting
  const handleOpenBanModal = (targetUser: User) => {
    if (!canAccessSection('usersAndBlacklist')) return;
    if (!isAdminUser && resolveUserRole(targetUser) === 'admin') {
      alert('Staff members cannot ban or modify administrator accounts.');
      return;
    }
    setBanModalUser(targetUser);
    setBanReasonInput(targetUser.banReason || 'Free Fire Hack / Config File');
    setBlacklistDeviceChecked(Boolean(targetUser.deviceId));
    const isDevBanned = Boolean(targetUser.deviceId && blacklistedDevices.some(d => d.deviceId === targetUser.deviceId && d.isActive !== false));
    setUnbanDeviceChecked(isDevBanned || Boolean(targetUser.isDeviceBanned));
  };

  const handleConfirmBanModal = async () => {
    if (isProcessing || !banModalUser?.id) return;
    if (!isAdminUser && resolveUserRole(banModalUser) === 'admin') {
      alert('Staff members cannot ban or modify administrator accounts.');
      return;
    }
    const targetId = banModalUser.id;
    setIsProcessing(true);
    try {
      if (!banModalUser.isBanned) {
        const finalReason = (banReasonInput.trim() || 'Free Fire Hack / FairPlay Violation').slice(0, 480);
        const shouldBlacklist = blacklistDeviceChecked && Boolean(banModalUser.deviceId);
        let userIgn = '';
        if (shouldBlacklist && banModalUser.deviceId) {
          userIgn = extractUserIgn(banModalUser);
          if (!userIgn) {
            userIgn = await fetchRegistrationIgnFallback(targetId);
          }
        }

        const batch = writeBatch(db);
        batch.update(doc(db, 'users', targetId), {
          isBanned: true,
          isDeviceBanned: shouldBlacklist,
          banReason: finalReason,
          bannedAt: serverTimestamp()
        });

        if (shouldBlacklist && banModalUser.deviceId) {
          batch.set(doc(db, 'blacklistedDevices', banModalUser.deviceId), {
            deviceId: String(banModalUser.deviceId).slice(0, 128),
            deviceFingerprint: String(banModalUser.deviceFingerprint || '').slice(0, 250),
            deviceInfo: String(banModalUser.deviceInfo || 'Unknown Device').slice(0, 250),
            bannedUserId: String(targetId).slice(0, 128),
            bannedUserEmail: String(banModalUser.email || '').slice(0, 190),
            bannedUsername: String(banModalUser.username || '').slice(0, 95),
            bannedUserIgn: String(userIgn || '').slice(0, 95),
            reason: finalReason,
            bannedAt: serverTimestamp(),
            bannedBy: String(auth.currentUser?.email || 'staff').slice(0, 190),
            isActive: true
          });
        }
        await batch.commit();
      } else {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', targetId), {
          isBanned: false,
          isDeviceBanned: unbanDeviceChecked ? false : Boolean(banModalUser.isDeviceBanned),
          banReason: ''
        });

        if (unbanDeviceChecked && banModalUser.deviceId) {
          batch.delete(doc(db, 'blacklistedDevices', banModalUser.deviceId));
        }
        await batch.commit();
      }
      setBanModalUser(null);
      setSelectedUser(null);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${targetId}`);
      alert(`Action failed: ${e?.message || 'Permission denied or network error. Please try again.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnblockDevice = async (deviceId: string, bannedUserId?: string) => {
    if (isProcessing) return;
    if (!confirm(`Remove device "${deviceId}" from blacklist? Is device me app dobara chalne lagega.`)) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'blacklistedDevices', deviceId));
      if (bannedUserId) {
        batch.update(doc(db, 'users', bannedUserId), {
          isDeviceBanned: false
        });
      }
      await batch.commit().catch(async () => {
        await deleteDoc(doc(db, 'blacklistedDevices', deviceId));
      });
    } catch (e: any) {
      handleFirestoreError(e, OperationType.DELETE, `blacklistedDevices/${deviceId}`);
      alert(`Failed to unblock device: ${e?.message || 'Permission denied.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateBalance = async (userId: string, amount: number, type: 'deposit' | 'withdrawal') => {
    if (!isAdminUser) {
      alert('Only Admins can add or deduct user wallet balance.');
      return;
    }
    if (isProcessing || !userId || !Number.isFinite(amount) || amount <= 0) return;
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('User not found');
        
        const userData = userSnap.data() as User;
        const currentDeposit = userData.wallet?.deposit || 0;
        
        if (type === 'withdrawal' && currentDeposit < amount) {
          throw new Error('Insufficient deposit balance');
        }

        const newDeposit = type === 'deposit' ? currentDeposit + amount : currentDeposit - amount;
        
        transaction.update(userRef, { "wallet.deposit": newDeposit });
        
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId,
          type,
          amount,
          status: 'completed',
          title: `Admin ${type}`,
          createdAt: serverTimestamp()
        });
      });
      alert(`Balance ${type}ed successfully`);
    } catch (e: any) {
      alert(e.message || 'Update failed');
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Password reset email sent to ${email}`);
    } catch (e) {
      alert('Failed to send reset email');
      console.error(e);
    }
  };


  const processDeleteMatch = async () => {
    if (isProcessing) return;
    const { matchId } = isDeleteConfirmOpen;

    if (!matchId || typeof matchId !== "string") {
      console.error("Invalid matchId provided for deletion:", matchId);
      return;
    }

    setIsProcessing(true);
    try {
      await runTransaction(db, async (tx) => {
        const matchRef = doc(db, "matches", matchId);
        const matchSnap = await tx.get(matchRef);

        if (!matchSnap.exists()) {
          return;
        }

        const matchData = matchSnap.data() as Tournament;
        const players = matchData.players || [];
        const entryFee = Number(matchData.entryFee || 0);

        // Aggregate refunds per unique userId so multi-slot players get 1 atomic update & 1 idempotent refund record
        const refundByUser = new Map<string, number>();
        if (matchData.status !== 'completed' && players.length > 0 && entryFee > 0) {
          for (const player of players) {
            if (!player.userId || typeof player.userId !== 'string') continue;
            refundByUser.set(player.userId, (refundByUser.get(player.userId) || 0) + entryFee);
          }
        }

        // All transaction reads must happen before writes
        const userEntries: { userId: string; amount: number; userRef: any; userSnap: any; refundRef: any; refundSnap: any }[] = [];
        for (const [userId, totalRefund] of refundByUser.entries()) {
          const userRef = doc(db, "users", userId);
          const refundRef = doc(db, "transactions", `refund_match_${matchId}_${userId}`);
          const [userSnap, refundSnap] = await Promise.all([tx.get(userRef), tx.get(refundRef)]);
          userEntries.push({ userId, amount: totalRefund, userRef, userSnap, refundRef, refundSnap });
        }

        for (const entry of userEntries) {
          if (entry.userSnap.exists() && !entry.refundSnap.exists()) {
            tx.update(entry.userRef, {
              "wallet.deposit": increment(entry.amount)
            });
            tx.set(entry.refundRef, {
              userId: entry.userId,
              type: 'refund',
              amount: entry.amount,
              matchId,
              status: 'completed',
              title: `REFUND: ${matchData.displayId || '#000'}`,
              createdAt: serverTimestamp()
            });
          }
        }

        tx.delete(matchRef);
      });

      setIsDeleteConfirmOpen({ isOpen: false, matchId: '' });
      alert('Match deleted successfully and players refunded (if applicable)');
    } catch (e) {
      console.error("Error during match deletion:", e);
      handleFirestoreError(e, OperationType.DELETE, `matches/${matchId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclareResult = (match: Tournament) => {
    setSelectedMatchResults(match);
    setPlayerResults({});
    setPlayerPositionResults({});
    setIsResultModalOpen(true);
  };

  const handleEditMatch = (m: Tournament) => {
    console.log("Navigating to edit match:", m.id);
    if (!m.id) {
      console.error("Match ID is missing!");
      return;
    }
    onPageChange(Page.ADMIN_EDIT_MATCH, m.id);
  };

  const handleDuplicateMatch = async (m: Tournament) => {
    console.log("Navigating to duplicate match:", m.id);
    if (!m.id) {
       console.error("Duplicate failed: Match object or ID missing");
       alert("Cannot duplicate: Match data missing");
       return;
    }
    onPageChange(Page.ADMIN_CREATE_MATCH, m.id);
  };

  const handleSubmitResult = async () => {
    if (isProcessing || !selectedMatchResults || !selectedMatchResults.id) {
      return;
    }

    setIsProcessing(true);

    try {
      await runTransaction(db, async (tx) => {
        const matchId = selectedMatchResults.id!;
        const matchRef = doc(db, 'matches', matchId);
        const resultsRef = doc(db, 'matchResults', matchId);

        // 1. Verify match is not already completed (idempotency guard against duplicate submissions)
        const [matchSnap, resultsSnap] = await Promise.all([tx.get(matchRef), tx.get(resultsRef)]);
        if (!matchSnap.exists()) {
          throw new Error('Match no longer exists.');
        }
        const liveMatchData = matchSnap.data() as Tournament;
        if (liveMatchData.status === 'completed' || resultsSnap.exists()) {
          throw new Error('Results have already been declared for this match.');
        }

        const players = liveMatchData.players || selectedMatchResults.players || [];

        // 2. Deduplicate userIds and aggregate payouts/kills per unique user
        const perUserTotals = new Map<string, { winningAmount: number; totalKills: number }>();
        const resultsArray = players.map(player => {
          const playerKey = `${player.userId}_${player.slot}`;
          const score = Number(playerResults[playerKey] || 0);
          let winningAmount = 0;

          if (liveMatchData.section === 'Battle Royale') {
            if (liveMatchData.prizeType === 'perKill') {
              const kills = score;
              const killsWinning = kills * (liveMatchData.perKillAmount || 0);
              const rank = Number(playerPositionResults[playerKey] || 0);
              const positionWinning = liveMatchData.positionPrizeDistribution?.[rank] || 0;
              winningAmount = killsWinning + positionWinning;
            } else if (liveMatchData.prizeType === 'survival') {
              winningAmount = liveMatchData.prizeDistribution?.[score] || 0;
            }
          } else {
            if (score === 1) {
              winningAmount = liveMatchData.prizePool || 0;
            }
          }

          if (player.userId && typeof player.userId === 'string') {
            const existing = perUserTotals.get(player.userId) || { winningAmount: 0, totalKills: 0 };
            existing.winningAmount += Math.max(0, Number(winningAmount) || 0);
            if (liveMatchData.prizeType === 'perKill') {
              existing.totalKills += Math.max(0, score);
            }
            perUserTotals.set(player.userId, existing);
          }

          return {
            userId: player.userId,
            slot: player.slot,
            username: player.username,
            ign: player.ign,
            rankOrKills: score,
            positionRank: playerPositionResults[playerKey] || null,
            winningAmount,
            killsWinning: liveMatchData.prizeType === 'perKill' ? score * (liveMatchData.perKillAmount || 0) : 0,
            positionWinning: liveMatchData.prizeType === 'perKill' ? (liveMatchData.positionPrizeDistribution?.[playerPositionResults[playerKey] || 0] || 0) : 0
          };
        });

        // 3. Read each unique user & deterministic win transaction BEFORE writing
        const userReadList: {
          userId: string;
          userRef: any;
          uSnap: any;
          winTxRef: any;
          winTxSnap: any;
          totals: { winningAmount: number; totalKills: number };
        }[] = [];

        for (const [userId, totals] of perUserTotals.entries()) {
          const userRef = doc(db, 'users', userId);
          const winTxRef = doc(db, 'transactions', `win_${matchId}_${userId}`);
          const [uSnap, winTxSnap] = await Promise.all([tx.get(userRef), tx.get(winTxRef)]);
          userReadList.push({ userId, userRef, uSnap, winTxRef, winTxSnap, totals });
        }

        // 4. Apply single atomic update per unique user
        for (const { userId, userRef, uSnap, winTxRef, winTxSnap, totals } of userReadList) {
          if (!uSnap.exists()) continue;

          const updates: any = {
            'stats.matchesPlayed': increment(1)
          };

          if (totals.winningAmount > 0 && !winTxSnap.exists()) {
            updates["wallet.winnings"] = increment(totals.winningAmount);
            updates['stats.totalWinnings'] = increment(totals.winningAmount);

            tx.set(winTxRef, {
              userId,
              type: 'win',
              amount: totals.winningAmount,
              matchId,
              status: 'completed',
              title: `WON IN MATCH: ${liveMatchData.displayId || '#000'}`,
              createdAt: serverTimestamp()
            });
          }

          if (liveMatchData.prizeType === 'perKill' && totals.totalKills > 0) {
            updates['stats.totalKills'] = increment(totals.totalKills);
          }

          tx.update(userRef, updates);
        }

        // 5. Save results summary and mark match completed
        tx.set(resultsRef, {
          matchId,
          matchTitle: liveMatchData.title,
          section: liveMatchData.section,
          prizeType: liveMatchData.prizeType || null,
          results: resultsArray,
          createdAt: serverTimestamp()
        });

        tx.update(matchRef, { status: 'completed', updatedAt: serverTimestamp() });
      });

      setIsResultModalOpen(false);
      alert('Results declared successfully!');
    } catch (e: any) {
      console.error("Error during result submission:", e);
      alert(e.message || 'Result submission failed');
      handleFirestoreError(e, OperationType.UPDATE, `matches/${selectedMatchResults.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract all unique sections combining presets, gameModes, and Firestore gameRules docs
  const allAvailableRuleSections = React.useMemo(() => {
    const map: Record<string, { id: string; title: string; category: string; rulesCount: number; isPreset: boolean }> = {};

    // 1. Add standard presets
    Object.keys(RULE_PRESETS).forEach(key => {
      const p = RULE_PRESETS[key];
      const firestoreDoc = gameRulesDocs[key];
      map[key] = {
        id: key,
        title: firestoreDoc?.title || p.title,
        category: firestoreDoc?.category || p.category,
        rulesCount: firestoreDoc?.rules ? firestoreDoc.rules.length : p.rules.length,
        isPreset: true
      };
    });

    // 2. Add gameModes from Firestore
    gameModesList.forEach(m => {
      const rawKey = (m.id || m.title || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
      if (rawKey && !map[rawKey]) {
        const firestoreDoc = gameRulesDocs[rawKey];
        map[rawKey] = {
          id: rawKey,
          title: firestoreDoc?.title || m.title || m.subtitle || rawKey.replace(/_/g, ' '),
          category: firestoreDoc?.category || m.category || 'Custom Mode',
          rulesCount: firestoreDoc?.rules?.length || 0,
          isPreset: false
        };
      }
    });

    // 3. Add any existing documents from gameRulesDocs
    Object.keys(gameRulesDocs).forEach(key => {
      const docData = gameRulesDocs[key];
      if (!map[key]) {
        map[key] = {
          id: key,
          title: docData.title || key.replace(/_/g, ' '),
          category: docData.category || 'Custom Section',
          rulesCount: docData.rules?.length || 0,
          isPreset: false
        };
      } else {
        map[key].title = docData.title || map[key].title;
        map[key].category = docData.category || map[key].category;
        map[key].rulesCount = docData.rules?.length || 0;
      }
    });

    return Object.values(map);
  }, [gameRulesDocs, gameModesList]);

  // Sync active section content whenever section changes or Firestore rules update
  useEffect(() => {
    const currentDoc = gameRulesDocs[activeRuleTab];
    if (currentDoc && currentDoc.rules && currentDoc.rules.length > 0) {
      setRuleList(currentDoc.rules);
      setRuleText(currentDoc.rules.join('\n'));
      setActiveSectionTitle(currentDoc.title || activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory(currentDoc.category || 'General');
    } else if (RULE_PRESETS[activeRuleTab]) {
      const p = RULE_PRESETS[activeRuleTab];
      setRuleList(p.rules);
      setRuleText(p.rules.join('\n'));
      setActiveSectionTitle(p.title);
      setActiveSectionCategory(p.category);
    } else {
      const defaultSample = [
        'Fair Play: No hacking, scripts or third-party tools allowed.',
        'Device Requirements: Mobile & tablet devices only. Strictly no emulators.',
        'Verification: High-definition victory/final scorecard screenshot mandatory in case of dispute.',
        'Match Entry: Room closes 2 minutes before match start time.',
        'Admin Decision: Admin decision is final and binding for all participants.'
      ];
      setRuleList(defaultSample);
      setRuleText(defaultSample.join('\n'));
      setActiveSectionTitle(activeRuleTab.replace(/_/g, ' '));
      setActiveSectionCategory('General');
    }
  }, [activeRuleTab, gameRulesDocs]);

  // Save current active section rules
  const handleSaveCurrentSectionRules = async () => {
    setIsProcessing(true);
    try {
      const finalRules = ruleEditMode === 'raw' 
        ? ruleText.split('\n').map(r => r.trim()).filter(r => r.length > 0)
        : ruleList.map(r => r.trim()).filter(r => r.length > 0);

      if (finalRules.length === 0) {
        alert('Please provide at least one rule item.');
        setIsProcessing(false);
        return;
      }

      await setDoc(doc(db, 'gameRules', activeRuleTab), {
        id: activeRuleTab,
        title: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
        section: activeSectionTitle.trim() || activeRuleTab.replace(/_/g, ' '),
        category: activeSectionCategory.trim() || 'General',
        rules: finalRules,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setRuleList(finalRules);
      setRuleText(finalRules.join('\n'));
      alert(`Rules for "${activeSectionTitle}" saved successfully!`);
    } catch (e) {
      console.error("Error saving rules:", e);
      handleFirestoreError(e, OperationType.UPDATE, `gameRules/${activeRuleTab}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a single rule to interactive list
  const handleAddSingleRule = () => {
    if (!newSingleRuleText.trim()) return;
    const updated = [...ruleList, newSingleRuleText.trim()];
    setRuleList(updated);
    setRuleText(updated.join('\n'));
    setNewSingleRuleText('');
  };

  // Delete a single rule from interactive list
  const handleDeleteSingleRule = (index: number) => {
    const updated = ruleList.filter((_, i) => i !== index);
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  // Move rule up or down
  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === ruleList.length - 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...ruleList];
    const item = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = item;
    setRuleList(updated);
    setRuleText(updated.join('\n'));
  };

  // Load a preset template into active section
  const handleApplyPresetTemplate = (presetKey: string) => {
    if (RULE_PRESETS[presetKey]) {
      const preset = RULE_PRESETS[presetKey];
      if (confirm(`Load "${preset.title}" rules into the current section editor?`)) {
        setRuleList([...preset.rules]);
        setRuleText(preset.rules.join('\n'));
      }
    }
  };

  // Create new section rules document
  const handleAddNewSectionSubmit = async () => {
    if (!newSectionForm.title.trim()) {
      alert('Please enter a section title / name');
      return;
    }
    const cleanId = newSectionForm.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    if (!cleanId) {
      alert('Invalid section title');
      return;
    }

    setIsProcessing(true);
    try {
      const starterTemplate = RULE_PRESETS[newSectionForm.template] || RULE_PRESETS.battle_royale;
      const initialRules = [...starterTemplate.rules];

      await setDoc(doc(db, 'gameRules', cleanId), {
        id: cleanId,
        title: newSectionForm.title.trim(),
        section: newSectionForm.title.trim(),
        category: newSectionForm.category.trim() || newSectionForm.title.trim(),
        rules: initialRules,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setActiveRuleTab(cleanId);
      setActiveSectionTitle(newSectionForm.title.trim());
      setActiveSectionCategory(newSectionForm.category.trim() || newSectionForm.title.trim());
      setRuleList(initialRules);
      setRuleText(initialRules.join('\n'));
      setIsAddSectionModalOpen(false);
      setNewSectionForm({ title: '', category: '', template: 'battle_royale' });
      alert(`Section rules for "${newSectionForm.title}" created successfully!`);
    } catch (err) {
      console.error('Failed to create new rule section:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete custom section rules
  const handleDeleteCustomSectionRules = async (secId: string, secTitle: string) => {
    if (['battle_royale', 'clash_squad', 'lone_wolf'].includes(secId)) {
      alert('Default game mode sections cannot be deleted. You can edit their rules instead.');
      return;
    }
    if (!confirm(`Are you sure you want to delete rules for section "${secTitle}"?`)) return;

    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'gameRules', secId));
      setActiveRuleTab('battle_royale');
      alert(`Rules for section "${secTitle}" removed.`);
    } catch (err) {
      console.error('Failed to delete section rules:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Room ID & Password Modal Handlers
  const handleOpenDeclareRoomModal = (m: Tournament) => {
    setSelectedDeclareRoomMatch(m);
    setDeclareRoomForm({
      roomId: m.roomId || '',
      roomPassword: m.roomPassword || '',
      setStatusLive: m.status !== 'completed',
      customNotes: (m as any).roomNotes || '',
      sendNotificationOnRoomDeclare: true
    });
    setIsDeclareRoomModalOpen(true);
  };

  const handleSaveDeclareRoom = async () => {
    if (isProcessing || !selectedDeclareRoomMatch) return;
    setIsProcessing(true);
    try {
      const cleanRoomId = declareRoomForm.roomId.trim();
      const cleanPass = declareRoomForm.roomPassword.trim();

      const updates: any = {
        roomId: cleanRoomId,
        roomPassword: cleanPass,
        roomNotes: declareRoomForm.customNotes.trim(),
        roomDeclaredAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (declareRoomForm.setStatusLive && selectedDeclareRoomMatch.status !== 'completed') {
        updates.status = 'ongoing';
      }

      await updateDoc(doc(db, 'matches', selectedDeclareRoomMatch.id), updates);

      // Auto push notification to match players if checked
      if (declareRoomForm.sendNotificationOnRoomDeclare && cleanRoomId) {
        try {
          await addDoc(collection(db, 'notifications'), {
            title: `🔑 Room ID & Pass Ready: ${selectedDeclareRoomMatch.title}`,
            message: `Room ID: ${cleanRoomId} | Password: ${cleanPass || 'No Password'}. Join immediately in Free Fire!`,
            type: 'room_creds',
            audience: 'match',
            targetMatchId: selectedDeclareRoomMatch.id,
            targetMatchTitle: selectedDeclareRoomMatch.title,
            actionPage: Page.TOURNAMENTS,
            actionText: 'View Credentials',
            createdAt: serverTimestamp(),
            readBy: []
          });
        } catch (notifErr) {
          console.warn('Could not auto push notification:', notifErr);
        }
      }

      setIsDeclareRoomModalOpen(false);
      setSelectedDeclareRoomMatch(null);
      alert('Room ID & Password declared successfully! Players can now view credentials in their match dashboard.');
    } catch (err: any) {
      console.error('Failed to declare room:', err);
      handleFirestoreError(err, OperationType.UPDATE, `matches/${selectedDeclareRoomMatch.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearRoomCredentials = async (matchId: string) => {
    if (!confirm('Are you sure you want to clear the Room ID & Password for this match?')) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'matches', matchId), {
        roomId: '',
        roomPassword: '',
        roomNotes: '',
        updatedAt: serverTimestamp()
      });
      if (isDeclareRoomModalOpen) {
        setIsDeclareRoomModalOpen(false);
        setSelectedDeclareRoomMatch(null);
      }
      alert('Room credentials cleared successfully.');
    } catch (err) {
      console.error('Failed to clear room:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyCredential = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveSettings = async (data: any) => {
    setIsProcessing(true);
    try {
      const nextData = { ...data };
      if (nextData.referral) {
        const rawUrl = (nextData.referral.baseUrl || '').trim();
        const isTemp =
          !rawUrl ||
          rawUrl.includes('ais-dev-') ||
          rawUrl.includes('ais-pre-') ||
          rawUrl.includes('localhost');
        nextData.referral = {
          ...nextData.referral,
          baseUrl: isTemp ? 'https://ap-tournaments-official.netlify.app' : rawUrl.replace(/\/+$/, '')
        };
      }
      await setDoc(doc(db, 'appSettings', 'referral_support'), nextData, { merge: true });
      alert('Settings updated successfully!');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'appSettings/referral_support');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveBanner = async () => {
    if (!imageUrl) return alert('Image URL is required');
    setIsProcessing(true);
    try {
      const bannerData = {
        imageUrl,
        redirectUrl: (bannerType === 'main' || bannerType === 'offer') ? redirectUrl : '',
        type: bannerType,
        order: Number(bannerOrder),
        isActive: true,
        updatedAt: serverTimestamp()
      };

      if (editingBanner?.id) {
        await updateDoc(doc(db, 'banners', editingBanner.id), bannerData);
      } else {
        await addDoc(collection(db, 'banners'), {
          ...bannerData,
          createdAt: serverTimestamp()
        });
      }
      setIsBannerModalOpen(false);
      setEditingBanner(null);
      setImageUrl('');
      setRedirectUrl('');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'banners');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this banner? This action cannot be undone.')) return;
    
    setDeletingBannerId(id);
    console.log("Deleting banner:", id);
    
    try {
      await deleteDoc(doc(db, 'banners', id));
    } catch (e) {
      console.error("Error deleting banner:", e);
      alert('Upload failed, try again');
      handleFirestoreError(e, OperationType.DELETE, `banners/${id}`);
    } finally {
      setDeletingBannerId(null);
    }
  };

  const handleToggleGateway = async (gatewayId: string, currentStatus: boolean) => {
    setIsProcessing(true);
    try {
      if (!currentStatus) {
        // Enforce only one active gateway: deactivate all others first
        const batch = writeBatch(db);
        paymentGateways.forEach(g => {
          if (g.isActive) {
            batch.update(doc(db, 'paymentSettings', g.id), { isActive: false });
          }
        });
        batch.update(doc(db, 'paymentSettings', gatewayId), { 
          isActive: true,
          updatedAt: serverTimestamp() 
        });
        await batch.commit();
      } else {
        await updateDoc(doc(db, 'paymentSettings', gatewayId), { 
          isActive: false,
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `paymentSettings/${gatewayId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveGateway = async () => {
    if (!gatewayForm.name) return alert('Name is required');
    setIsProcessing(true);
    try {
      const gId = editingGateway?.id || gatewayForm.name.toLowerCase().replace(/\s+/g, '_');
      const gatewayData = {
        ...gatewayForm,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'paymentSettings', gId), gatewayData, { merge: true });
      
      setIsGatewayModalOpen(false);
      setEditingGateway(null);
      setGatewayForm({
        name: '',
        apiKey: '',
        secretKey: '',
        merchantId: '',
        webhookSecret: '',
        upiId: ''
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'paymentSettings');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center max-w-2xl mx-auto border-x border-slate-200">
        <Loader2 className="text-[#16A34A] animate-spin" size={32} />
      </div>
    );
  }

  const activeBlacklistCount = blacklistedDevices.filter(d => d.isActive !== false).length;
  const allMenuDefinitions: {
    id: AdminTab;
    permissionKey?: AdminSectionKey;
    adminOnly?: boolean;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: number;
    badgeTone?: 'amber' | 'red' | 'emerald';
    isRoute?: boolean;
  }[] = [
    { id: AdminTab.DASHBOARD, permissionKey: 'dashboard', label: 'Dashboard', subtitle: 'Stats & Overview', icon: LayoutDashboard },
    {
      id: AdminTab.WITHDRAWALS,
      permissionKey: 'withdrawals',
      label: 'Withdrawals',
      subtitle: 'Payout Requests',
      icon: Banknote,
      badge: pendingWithdrawals.length > 0 ? pendingWithdrawals.length : undefined,
      badgeTone: 'amber'
    },
    { id: AdminTab.NOTIFICATIONS, permissionKey: 'notifications', label: 'Notifications', subtitle: 'Push & Broadcast Alerts', icon: Bell },
    {
      id: AdminTab.USERS,
      permissionKey: 'usersAndBlacklist',
      label: 'Users & Blacklist',
      subtitle: `${users.length} Players • ${activeBlacklistCount} Blocked`,
      icon: Users,
      badge: activeBlacklistCount > 0 ? activeBlacklistCount : undefined,
      badgeTone: 'red'
    },
    { id: AdminTab.MATCHES, permissionKey: 'matches', label: 'Matches', subtitle: `${matches.length} Tournaments`, icon: Trophy },
    { id: AdminTab.TRANSACTIONS, permissionKey: 'transactions', label: 'Transactions', subtitle: 'Deposits, Wins & History', icon: DollarSign },
    { id: AdminTab.RULES, permissionKey: 'gameRules', label: 'Game Rules', subtitle: 'Match Rules Config', icon: ListChecks },
    { id: AdminTab.MODES, permissionKey: 'gameModes', label: 'Game Modes', subtitle: 'Modes & Categories', icon: Gamepad2, isRoute: true },
    { id: AdminTab.BANNERS, permissionKey: 'banners', label: 'Banners', subtitle: 'Home & Offer Banners', icon: ImageIcon },
    { id: AdminTab.REFERRAL, permissionKey: 'referralAndSupport', label: 'Referral & Support', subtitle: 'Rewards, Links & Policies', icon: Settings },
    { id: AdminTab.PAYMENT, permissionKey: 'paymentGateways', label: 'Payment Gateways', subtitle: 'UPI, Cashfree & Razorpay', icon: Landmark },
    { id: AdminTab.STAFF_MANAGEMENT, adminOnly: true, label: 'Staff Management', subtitle: 'Roles & Section Access', icon: ShieldCheck }
  ];

  // Filter menu strictly by admin role or explicit true staff permissions
  const adminMenuItems = allMenuDefinitions.filter((item) => {
    if (item.adminOnly) return isAdminUser;
    if (!item.permissionKey) return false;
    return canAccessSection(item.permissionKey);
  });

  const currentMenuItem =
    adminMenuItems.find(item => item.id === activeTab) ||
    adminMenuItems[0] || {
      id: AdminTab.DASHBOARD,
      label: 'Access Restricted',
      subtitle: 'No Sections Assigned',
      icon: Lock
    };
  const CurrentSectionIcon = currentMenuItem.icon;

  const handleSelectMenuSection = (item: typeof allMenuDefinitions[number]) => {
    setIsMenuOpen(false);
    if (item.adminOnly && !isAdminUser) return;
    if (item.permissionKey && !canAccessSection(item.permissionKey)) return;
    if (item.isRoute) {
      onPageChange(Page.ADMIN_MODES);
      return;
    }
    setActiveTab(item.id);
    setSearchTerm('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!canAccessPanel) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="pb-24 max-w-2xl mx-auto bg-[#F8FAFC] min-h-screen text-slate-900 border-x border-slate-200 relative">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onPageChange(Page.PROFILE)}
            className="p-2.5 bg-slate-100 hover:bg-[#ECFDF5] border border-slate-200 rounded-xl text-slate-700 hover:text-[#16A34A] transition-colors cursor-pointer"
            title="Back to Profile"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight uppercase text-slate-900 leading-none">
              {isAdminUser ? 'Admin' : 'Staff'} <span className="text-[#16A34A]">Panel</span>
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#16A34A] mt-1">
              {currentMenuItem.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#16A34A]">
              {isAdminUser ? 'Admin' : `Staff (${allowedSections.length}/11)`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open Admin Menu"
            className="relative p-2.5 bg-slate-100 hover:bg-[#ECFDF5] border border-slate-200 hover:border-[#16A34A]/40 rounded-xl text-slate-800 hover:text-[#16A34A] transition-all active:scale-95 cursor-pointer"
          >
            <Menu size={20} />
            {canAccessSection('withdrawals') && pendingWithdrawals.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white tabular-nums">
                {pendingWithdrawals.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Slide-over 3-Line Menu Drawer (Opens from Left Side) */}
      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 z-[90] flex justify-start">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative z-10 w-[85%] max-w-xs h-full bg-white border-r border-slate-200 shadow-2xl flex flex-col"
            >
              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-[#F2FBF6]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#16A34A] text-white flex items-center justify-center shadow-xs">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 leading-none">
                      {isAdminUser ? 'Admin' : 'Staff'} <span className="text-[#16A34A]">Menu</span>
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">
                      {isAdminUser ? 'Select Any Section' : `${adminMenuItems.length} Section${adminMenuItems.length === 1 ? '' : 's'} Enabled`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  aria-label="Close Menu"
                  className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Links */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {adminMenuItems.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-2xl">
                    <Lock size={24} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-xs font-black uppercase text-slate-700">No Sections Enabled</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-1">
                      Ask an administrator to enable sections for your staff account.
                    </p>
                  </div>
                ) : (
                  adminMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = !item.isRoute && activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectMenuSection(item)}
                        className={`w-full p-3 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-xs'
                            : 'bg-white border-slate-200 text-slate-800 hover:bg-[#ECFDF5]/60 hover:border-[#BBF7D0]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            isActive
                              ? 'bg-white/15 border-white/25 text-white'
                              : 'bg-[#ECFDF5] border-[#BBF7D0] text-[#16A34A]'
                          }`}>
                            <Icon size={17} />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-black uppercase tracking-wide truncate ${isActive ? 'text-white' : 'text-slate-900'}`}>
                              {item.label}
                            </p>
                            <p className={`text-[10px] font-semibold truncate ${isActive ? 'text-emerald-100' : 'text-slate-500'}`}>
                              {item.subtitle}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.adminOnly && (
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                              isActive ? 'bg-white/20 text-white' : 'bg-slate-900 text-white'
                            }`}>
                              Admin
                            </span>
                          )}
                          {item.badge !== undefined && item.badge > 0 && (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tabular-nums ${
                              isActive
                                ? 'bg-white text-[#16A34A]'
                                : item.badgeTone === 'red'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {item.badge}
                            </span>
                          )}
                          <ChevronRight size={15} className={isActive ? 'text-white' : 'text-slate-400'} />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-3.5 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onPageChange(Page.PROFILE);
                  }}
                  className="w-full py-2.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Exit Admin Panel</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="px-5 py-5">
        {/* Compact Active Section Bar (tap anywhere to open 3-line menu) */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          className="w-full mb-3 p-3.5 bg-white hover:bg-[#ECFDF5]/40 border border-slate-200 hover:border-[#16A34A]/40 rounded-2xl flex items-center justify-between shadow-2xs transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] flex items-center justify-center shrink-0">
              <CurrentSectionIcon size={18} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current Section</p>
              <p className="text-xs font-black uppercase tracking-wide text-slate-900 truncate">{currentMenuItem.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider shrink-0">
            <Menu size={13} />
            <span>Menu</span>
          </div>
        </button>

        {/* Direct Quick-Switch Section Pills (strictly filtered to authorized sections) */}
        {adminMenuItems.length > 0 && (
          <div className="mb-5 -mx-1 px-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 min-w-max pb-1">
              {adminMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = !item.isRoute && activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectMenuSection(item)}
                    className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-[#ECFDF5] hover:border-[#BBF7D0] hover:text-[#16A34A]'
                    }`}
                  >
                    <Icon size={13} className="shrink-0" />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-black tabular-nums leading-none ${
                          isActive
                            ? 'bg-white text-[#16A34A]'
                            : item.badgeTone === 'red'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {adminMenuItems.length === 0 ? (
          <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Lock size={26} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase text-slate-900">No Sections Assigned Yet</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 max-w-sm mx-auto leading-relaxed">
                Your account has Staff role access, but an administrator has not enabled any Admin Panel sections for you yet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onPageChange(Page.PROFILE)}
              className="px-5 py-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              Exit Admin Panel
            </button>
          </div>
        ) : !isTabAllowed(activeTab) ? (
          <div className="p-10 bg-white border border-red-200 rounded-3xl text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
              <Lock size={26} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase text-slate-900">Access Restricted</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 max-w-sm mx-auto">
                You do not have permission to view this section. Open the menu to choose an authorized section.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="px-5 py-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              Open Allowed Sections
            </button>
          </div>
        ) : (
        <AnimatePresence mode="wait">
          {activeTab === AdminTab.DASHBOARD && canAccessSection('dashboard') && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Total Users" value={totalUsers} icon={Users} color="text-[#16A34A]" />
                <StatCard label="Total Matches" value={totalMatches} icon={Trophy} color="text-[#16A34A]" />
                <div className={!isAdminUser ? 'col-span-2' : ''}>
                  <StatCard label="Joined Players" value={totalJoinedPlayers} icon={UsersIcon} color="text-[#16A34A]" />
                </div>
                {isAdminUser && (
                  <StatCard label="Revenue" value={`₹${totalDeposits - totalWithdrawals}`} icon={DollarSign} color="text-[#16A34A]" />
                )}
              </div>

              {canAccessSection('gameModes') && (
                <div className="flex gap-4">
                  <button 
                    onClick={() => onPageChange(Page.ADMIN_MODES)}
                    className="flex-1 p-6 bg-white hover:bg-[#ECFDF5]/50 border border-slate-200 hover:border-emerald-300 rounded-3xl flex flex-col items-center gap-3 active:scale-[0.99] transition-all shadow-xs cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                      <Gamepad2 size={28} />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-[#16A34A]">Manage Game Modes</span>
                  </button>
                </div>
              )}

              {/* Pending Withdrawals Quick Alert */}
              {canAccessSection('withdrawals') && pendingWithdrawals.length > 0 && (
                <div 
                  onClick={() => setActiveTab(AdminTab.WITHDRAWALS)}
                  className="p-4 bg-amber-50 border border-amber-200 rounded-3xl flex items-center justify-between cursor-pointer hover:border-amber-300 transition-all shadow-xs active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center font-black text-lg shrink-0">
                      ₹
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight">
                        {pendingWithdrawals.length} Pending Withdrawal Request{pendingWithdrawals.length > 1 ? 's' : ''}
                      </h4>
                      <p className="text-[10px] text-amber-800 font-bold uppercase tracking-wider mt-0.5 tabular-nums">
                        Total ₹{pendingWithdrawals.reduce((sum, t) => sum + (Number(t.amount) || 0), 0).toLocaleString()} awaiting approval
                      </p>
                    </div>
                  </div>
                  <span className="px-3.5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-[10px] font-black uppercase tracking-wider transition-colors shadow-2xs shrink-0">
                    Review →
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {/* WITHDRAWALS MANAGEMENT TAB */}
          {activeTab === AdminTab.WITHDRAWALS && canAccessSection('withdrawals') && (
            <motion.div
              key="withdrawals"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-6"
            >
              {/* Header & Quick Stats */}
              <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold uppercase tracking-tight text-slate-900 flex items-center gap-2">
                      <Banknote className="text-[#16A34A]" size={20} />
                      Withdrawal Requests
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
                      Direct user payout verification & instant refund handling
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-[#16A34A] bg-[#ECFDF5] border border-[#BBF7D0] px-2.5 py-1 rounded-full tabular-nums">
                      {withdrawalTransactions.length} Total
                    </span>
                  </div>
                </div>

                {/* 3 Quick Counter Cards */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div 
                    onClick={() => setWithdrawalFilter('pending')}
                    className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${
                      withdrawalFilter === 'pending'
                        ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-amber-200'
                    }`}
                  >
                    <p className="text-[9px] font-black uppercase tracking-wider">Pending</p>
                    <p className="text-base font-black text-amber-700 mt-0.5 tabular-nums">
                      {pendingWithdrawals.length}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 tabular-nums">
                      ₹{pendingWithdrawals.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)}
                    </p>
                  </div>

                  <div 
                    onClick={() => setWithdrawalFilter('completed')}
                    className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${
                      withdrawalFilter === 'completed'
                        ? 'bg-emerald-50 border-emerald-300 text-[#16A34A] shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-200'
                    }`}
                  >
                    <p className="text-[9px] font-black uppercase tracking-wider">Approved</p>
                    <p className="text-base font-black text-[#16A34A] mt-0.5 tabular-nums">
                      {completedWithdrawals.length}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 tabular-nums">
                      ₹{completedWithdrawals.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)}
                    </p>
                  </div>

                  <div 
                    onClick={() => setWithdrawalFilter('rejected')}
                    className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${
                      withdrawalFilter === 'rejected'
                        ? 'bg-red-50 border-red-300 text-red-700 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-red-200'
                    }`}
                  >
                    <p className="text-[9px] font-black uppercase tracking-wider">Rejected</p>
                    <p className="text-base font-black text-red-600 mt-0.5 tabular-nums">
                      {rejectedWithdrawals.length}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500">
                      Refunded
                    </p>
                  </div>
                </div>

                {/* Search Bar & All filter */}
                <div className="flex gap-2 pt-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text"
                      placeholder="Search by user, phone, UPI ID..."
                      value={withdrawalSearch}
                      onChange={(e) => setWithdrawalSearch(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => setWithdrawalFilter('all')}
                    className={`px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all whitespace-nowrap ${
                      withdrawalFilter === 'all'
                        ? 'bg-[#16A34A] border-[#16A34A] text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({withdrawalTransactions.length})
                  </button>
                </div>
              </div>

              {/* Withdrawals List */}
              <div className="space-y-4">
                {(() => {
                  const filteredList = withdrawalTransactions.filter((tx) => {
                    if (withdrawalFilter !== 'all' && tx.status !== withdrawalFilter) {
                      return false;
                    }
                    if (withdrawalSearch.trim()) {
                      const q = withdrawalSearch.toLowerCase().trim();
                      const u = users.find(usr => usr.id === tx.userId);
                      const username = (tx.username || u?.username || '').toLowerCase();
                      const phone = (tx.userPhone || u?.phone || '').toLowerCase();
                      const upi = (tx.payoutDetails?.upiId || tx.upiId || '').toLowerCase();
                      const title = (tx.title || '').toLowerCase();
                      const idStr = (tx.id || '').toLowerCase();
                      return username.includes(q) || phone.includes(q) || upi.includes(q) || title.includes(q) || idStr.includes(q);
                    }
                    return true;
                  });

                  if (filteredList.length === 0) {
                    return (
                      <div className="p-12 bg-white border border-slate-200 rounded-3xl text-center space-y-2 shadow-xs">
                        <Banknote className="mx-auto text-slate-400" size={32} />
                        <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                          No {withdrawalFilter !== 'all' ? withdrawalFilter : ''} Withdrawal Requests
                        </h4>
                        <p className="text-[11px] text-slate-500 font-medium">
                          When users request to withdraw winnings, they will appear here for your approval.
                        </p>
                      </div>
                    );
                  }

                  return filteredList.map((tx) => {
                    const txUser = users.find(u => u.id === tx.userId);
                    const isPending = tx.status === 'pending';
                    const isCompleted = tx.status === 'completed';
                    const isRejected = tx.status === 'rejected';

                    const payoutMethod = tx.payoutMethod || (tx.title?.toLowerCase().includes('upi') ? 'upi' : 'bank');
                    const upiId = tx.payoutDetails?.upiId || tx.upiId || '';
                    const bankDetails = tx.payoutDetails?.method === 'bank' ? tx.payoutDetails : null;

                    return (
                      <div 
                        key={tx.id} 
                        className={`p-5 bg-white border rounded-3xl space-y-4 transition-all shadow-xs ${
                          isPending 
                            ? 'border-amber-300' 
                            : isCompleted 
                            ? 'border-emerald-200' 
                            : 'border-red-200 opacity-90'
                        }`}
                      >
                        {/* Top Row: User Info + Status Badge + Amount */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A] font-black text-sm uppercase shrink-0">
                              {(tx.username || txUser?.username || 'U')[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                                  {tx.username || txUser?.username || 'Gamer'}
                                </h4>
                                <span className="text-[9px] px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-bold uppercase font-mono">
                                  {txUser?.phone || tx.userPhone || 'No Phone'}
                                </span>
                              </div>
                              <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                                {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent'}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-base sm:text-lg font-black text-[#16A34A] tracking-tight block tabular-nums">
                              ₹{tx.amount}
                            </span>
                            <span className={`inline-block text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full mt-1 border ${
                              isPending 
                                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                : isCompleted 
                                ? 'bg-emerald-50 border-emerald-200 text-[#16A34A]' 
                                : 'bg-red-50 border-red-200 text-red-600'
                            }`}>
                              {tx.status || 'PENDING'}
                            </span>
                          </div>
                        </div>

                        {/* Payout Details Box */}
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <span className="flex items-center gap-1.5 text-slate-800">
                              {payoutMethod === 'upi' ? <Smartphone size={13} className="text-[#16A34A]" /> : <Landmark size={13} className="text-[#16A34A]" />}
                              Payout via {payoutMethod === 'upi' ? 'UPI' : 'Bank Transfer'}
                            </span>
                            <span className="text-slate-500 font-mono">ID: {tx.id.slice(0, 10)}...</span>
                          </div>

                          {payoutMethod === 'upi' && upiId ? (
                            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                              <div>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">UPI ID (VPA)</span>
                                <span className="text-xs font-black text-[#16A34A] font-mono select-all">{upiId}</span>
                                {tx.payoutDetails?.holderName && (
                                  <span className="text-[10px] text-slate-500 block font-medium">Holder: {tx.payoutDetails.holderName}</span>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(upiId);
                                  setCopiedWithdrawalId(tx.id);
                                  setTimeout(() => setCopiedWithdrawalId(null), 2000);
                                }}
                                className="px-3 py-1.5 bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] rounded-lg text-[10px] font-black uppercase text-[#16A34A] flex items-center gap-1 active:scale-95 transition-all"
                              >
                                {copiedWithdrawalId === tx.id ? <Check size={12} className="text-[#16A34A]" /> : <Copy size={12} />}
                                {copiedWithdrawalId === tx.id ? 'Copied!' : 'Copy UPI'}
                              </button>
                            </div>
                          ) : bankDetails ? (
                            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 text-xs font-mono">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-[9px] text-slate-500 uppercase block font-sans font-bold">A/C Number:</span>
                                  <span className="font-bold text-slate-900 select-all">{bankDetails.accountNumber}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const detailsStr = `A/C: ${bankDetails.accountNumber}\nIFSC: ${bankDetails.ifsc}\nName: ${bankDetails.holderName}\nBank: ${bankDetails.bankName}`;
                                    navigator.clipboard.writeText(detailsStr);
                                    setCopiedWithdrawalId(tx.id);
                                    setTimeout(() => setCopiedWithdrawalId(null), 2000);
                                  }}
                                  className="px-2.5 py-1.5 bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] rounded-lg text-[9px] font-black uppercase text-[#16A34A] flex items-center gap-1 font-sans"
                                >
                                  {copiedWithdrawalId === tx.id ? 'Copied!' : 'Copy Bank Info'}
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-sans">
                                <div>IFSC: <span className="font-mono text-slate-900 font-bold">{bankDetails.ifsc}</span></div>
                                <div>Bank: <span className="text-slate-900 font-bold">{bankDetails.bankName || 'N/A'}</span></div>
                                <div className="col-span-2">Holder: <span className="text-slate-900 font-bold">{bankDetails.holderName}</span></div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 italic">
                              {tx.title || 'Withdrawal request'}
                            </div>
                          )}

                          {/* Reference / Notes if completed or rejected */}
                          {isCompleted && tx.adminNote && (
                            <div className="text-[10px] text-[#16A34A] font-bold bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-1.5">
                              <CheckCircle2 size={13} className="shrink-0" />
                              <span>{tx.adminNote}</span>
                            </div>
                          )}

                          {isRejected && tx.rejectedReason && (
                            <div className="text-[10px] text-red-600 font-bold bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-1.5">
                              <AlertCircle size={13} className="shrink-0" />
                              <span>Reason: {tx.rejectedReason} (₹{tx.amount} Refunded to Winnings)</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons for Pending Requests */}
                        {isPending && (
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <button
                              onClick={() => {
                                setApprovalModalTx(tx);
                                setUtrInput('');
                              }}
                              disabled={isProcessing}
                              className="py-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <CheckCircle2 size={14} />
                              Approve Payout
                            </button>

                            <button
                              onClick={() => {
                                setRejectionModalTx(tx);
                                setRejectionReasonInput('');
                              }}
                              disabled={isProcessing}
                              className="py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                            >
                              <AlertCircle size={14} />
                              Reject & Refund
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.NOTIFICATIONS && canAccessSection('notifications') && (
            <motion.div
              key="notifications"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <AdminNotificationsTab 
                matches={matches} 
                users={users} 
                onPageChange={onPageChange} 
              />
            </motion.div>
          )}

          {activeTab === AdminTab.USERS && canAccessSection('usersAndBlacklist') && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-5"
            >
              {/* Sub-Tabs: All Users vs Blacklisted Devices */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                <button
                  type="button"
                  onClick={() => setUsersSubTab('all')}
                  className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    usersSubTab === 'all'
                      ? 'bg-[#16A34A] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users size={14} />
                  <span>All Users ({mergedAllUsers.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUsersSubTab('blacklist')}
                  className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    usersSubTab === 'blacklist'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Smartphone size={14} />
                  <span>Blacklisted ({blacklistedDevices.filter(d => d.isActive !== false).length})</span>
                </button>
              </div>

              {usersError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle size={16} className="shrink-0" />
                    <span className="truncate">{usersError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUsersRetryKey((k) => k + 1)}
                    className="px-2.5 py-1 bg-white border border-red-200 rounded-lg text-[10px] font-black uppercase tracking-wider text-red-700 hover:bg-red-100 shrink-0 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {usersSubTab === 'all' ? (
                <>
                  <div className="p-3 bg-[#ECFDF5] border border-[#BBF7D0] rounded-2xl flex items-center gap-2.5 text-[11px] font-bold text-[#15803D]">
                    <ShieldCheck size={16} className="text-[#16A34A] shrink-0" />
                    <span>
                      Tap <strong>Block</strong> on any user to ban their account & check <strong>Blacklist Device</strong> to permanently block their phone.
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="text"
                        placeholder="Search username, email, phone, UID or device ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pl-11 pr-4 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all shadow-2xs"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!searchTerm.trim() || isSearchingUsersInDb}
                      onClick={handleFindExactUserInDb}
                      className="px-3.5 bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] text-[#16A34A] rounded-2xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap disabled:opacity-50 cursor-pointer transition-colors"
                      title="Search directly in database for users beyond initial list"
                    >
                      {isSearchingUsersInDb ? <Loader2 size={14} className="animate-spin" /> : 'Find Exact'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {loadingUsers && mergedAllUsers.length === 0 ? (
                      <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center space-y-3 shadow-2xs">
                        <Loader2 size={26} className="mx-auto text-[#16A34A] animate-spin" />
                        <p className="text-xs font-black uppercase tracking-wider text-slate-600">Loading All Users...</p>
                      </div>
                    ) : mergedAllUsers.length === 0 ? (
                      <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center space-y-2 shadow-2xs">
                        <Users size={28} className="mx-auto text-slate-300" />
                        <p className="text-xs font-black uppercase text-slate-700">No Users Found</p>
                        <p className="text-[11px] text-slate-500">Tap Retry above or use Find Exact search.</p>
                      </div>
                    ) : null}
                    {mergedAllUsers
                      .filter((u) => {
                        const q = searchTerm.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          String(u.username || '').toLowerCase().includes(q) ||
                          String(u.email || '').toLowerCase().includes(q) ||
                          String(u.phone || '').toLowerCase().includes(q) ||
                          String(u.id || '').toLowerCase().includes(q) ||
                          String(u.deviceId || '').toLowerCase().includes(q)
                        );
                      })
                      .map((u) => {
                      const isDevBlacklisted = Boolean(u.deviceId && blacklistedDevices.some(d => d.deviceId === u.deviceId && d.isActive !== false));
                      const targetRole = resolveUserRole(u);
                      const isProtectedFromStaff = !isAdminUser && targetRole === 'admin';
                      return (
                      <div 
                        key={u.id}
                        onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, u.id)}
                        className={`p-4 bg-white border rounded-2xl flex items-center justify-between gap-2 group cursor-pointer transition-all shadow-2xs ${
                          u.isBanned || isDevBlacklisted ? 'border-red-200 bg-red-50/20' : 'border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                            u.isBanned ? 'bg-red-50 text-red-600 border-red-200' : 'bg-[#ECFDF5] text-[#16A34A] border-emerald-100'
                          }`}>
                            {u.isBanned ? <Ban size={18} /> : <Users size={18} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-[#16A34A] transition-colors truncate">{u.username}</h4>
                              {targetRole === 'admin' && (
                                <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase rounded">Admin</span>
                              )}
                              {targetRole === 'staff' && (
                                <span className="px-1.5 py-0.5 bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] text-[8px] font-black uppercase rounded">Staff</span>
                              )}
                              {u.isBanned && (
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[8px] font-black uppercase rounded">Banned</span>
                              )}
                              {isDevBlacklisted && (
                                <span className="px-1.5 py-0.5 bg-slate-900 text-red-400 text-[8px] font-black uppercase rounded flex items-center gap-0.5">
                                  <Lock size={8} /> Device
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-semibold text-slate-500 truncate">{u.email}</p>
                            {u.deviceInfo && (
                              <p className="text-[9px] text-slate-400 font-medium truncate">
                                📱 {u.deviceInfo}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[9px] font-semibold text-slate-500">
                              <span>Joined: <strong className="text-slate-700">{formatUserDateTime(u.createdAt, 'N/A')}</strong></span>
                              <span>Last Login: <strong className="text-[#16A34A]">{formatUserDateTime(u.lastLoginAt || u.lastActive, 'N/A')}</strong></span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="text-xs font-black text-[#16A34A] tabular-nums">
                            ₹{(u.wallet?.deposit || 0) + (u.wallet?.winnings || 0) + (u.wallet?.bonus || 0)}
                          </span>
                          {isProtectedFromStaff ? (
                            <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-black uppercase tracking-wider">
                              Protected
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBanModal(u);
                              }}
                              title={u.isBanned ? 'Unban / Manage Device' : 'Block Hacker / Blacklist Device'}
                              className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                                u.isBanned
                                  ? 'bg-emerald-50 border-emerald-200 text-[#16A34A] hover:bg-emerald-100'
                                  : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              {u.isBanned ? <Unlock size={12} /> : <Ban size={12} />}
                              <span>{u.isBanned ? 'Unban' : 'Block'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}

                    {users.length >= usersLimit && (
                      <button
                        type="button"
                        onClick={() => setUsersLimit((prev) => prev + 500)}
                        className="w-full py-3.5 bg-white hover:bg-[#ECFDF5] border border-slate-200 hover:border-[#BBF7D0] text-[#16A34A] rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                      >
                        Load More Users (Showing {users.length})
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                    <ShieldAlert size={18} className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black uppercase text-red-800">Hardware Device Blacklist</h4>
                      <p className="text-[11px] text-red-700 font-medium leading-relaxed mt-0.5">
                        In devices par aapka app khulna, login hona aur naya account banana permanently band hai.
                      </p>
                    </div>
                  </div>

                  {blacklistedDevices.filter(d => d.isActive !== false).length === 0 ? (
                    <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center space-y-3 shadow-2xs">
                      <Smartphone size={32} className="mx-auto text-slate-300" />
                      <h4 className="text-xs font-black uppercase text-slate-700">No Blacklisted Devices</h4>
                      <p className="text-[11px] text-slate-500">
                        Kisi bhi player ko block karte waqt "Blacklist Device" check karein — unka device yahan aa jayega.
                      </p>
                      <button
                        type="button"
                        onClick={() => setUsersSubTab('all')}
                        className="px-4 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                      >
                        Go to All Users to Block
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {blacklistedDevices
                        .filter(d => d.isActive !== false)
                        .map((dev) => (
                        <div key={dev.id || dev.deviceId} className="p-4 bg-white border border-red-200 rounded-2xl space-y-3 shadow-2xs">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-slate-900 text-red-400 flex items-center justify-center shrink-0">
                                <Lock size={18} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-xs font-black text-slate-900 truncate">
                                  {dev.bannedUsername || 'Banned User'} ({dev.deviceInfo || 'Mobile Device'})
                                </h4>
                                <p className="text-[10px] font-medium text-slate-500 truncate">{dev.bannedUserEmail || 'No email'}</p>
                                <p className="text-[9px] font-mono text-slate-400 truncate mt-0.5">ID: {dev.deviceId}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUnblockDevice(dev.deviceId, dev.bannedUserId)}
                              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[#16A34A] rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 cursor-pointer transition-all"
                            >
                              <Unlock size={12} />
                              <span>Unblock</span>
                            </button>
                          </div>
                          <div className="p-2.5 bg-red-50 border border-red-100 rounded-xl text-[10px] font-bold text-red-700">
                            Reason: {dev.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === AdminTab.MATCHES && canAccessSection('matches') && (
            <motion.div
              key="matches"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-5"
            >
              <div className="space-y-4">
                <button 
                  onClick={() => onPageChange(Page.ADMIN_CREATE_MATCH)}
                  className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] rounded-2xl flex items-center justify-center gap-2.5 shadow-xs active:scale-[0.98] transition-all text-white cursor-pointer"
                >
                  <Plus size={18} />
                  <span className="text-xs font-black uppercase tracking-widest">Create New Match</span>
                </button>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text"
                    placeholder="Search by Match ID, Title or Section..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pl-11 pr-4 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all shadow-2xs"
                  />
                </div>

                {/* Match Status Filters */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { id: 'all', label: `All (${matches.length})` },
                    { 
                      id: 'need_room', 
                      label: `Need Room ID (${matches.filter(m => (!m.roomId || !m.roomPassword) && m.status !== 'completed').length})` 
                    },
                    { 
                      id: 'room_ready', 
                      label: `Room Ready (${matches.filter(m => m.roomId && m.roomPassword && m.status !== 'completed').length})` 
                    },
                    { 
                      id: 'live', 
                      label: `Live (${matches.filter(m => m.status === 'ongoing').length})` 
                    },
                    { 
                      id: 'completed', 
                      label: `Completed (${matches.filter(m => m.status === 'completed').length})` 
                    }
                  ].map((filterItem) => (
                    <button
                      key={filterItem.id}
                      onClick={() => setMatchStatusFilter(filterItem.id as any)}
                      className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
                        matchStatusFilter === filterItem.id
                          ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {filterItem.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {matches
                  .filter(m => {
                    const matchText = (m.displayId || '') + ' ' + (m.title || '') + ' ' + (m.section || '') + ' ' + (m.map || '');
                    const matchesSearch = matchText.toLowerCase().includes(searchTerm.toLowerCase());
                    if (!matchesSearch) return false;

                    if (matchStatusFilter === 'need_room') {
                      return (!m.roomId || !m.roomPassword) && m.status !== 'completed';
                    }
                    if (matchStatusFilter === 'room_ready') {
                      return m.roomId && m.roomPassword && m.status !== 'completed';
                    }
                    if (matchStatusFilter === 'live') {
                      return m.status === 'ongoing';
                    }
                    if (matchStatusFilter === 'completed') {
                      return m.status === 'completed';
                    }
                    return true;
                  })
                  .map((m) => {
                    const hasRoomCreds = Boolean(m.roomId && m.roomPassword);
                    return (
                      <div key={m.id} className="p-5 bg-white border border-slate-200 rounded-3xl relative overflow-hidden group shadow-xs">
                        <div className="flex items-center justify-between mb-3 gap-2">
                           <div className="flex items-center gap-2 flex-wrap">
                             <span className="text-[10px] font-black text-[#16A34A] bg-[#ECFDF5] px-2.5 py-0.5 rounded-lg border border-[#BBF7D0] tabular-nums">
                               {m.displayId || '#000'}
                             </span>
                             <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                               {m.section || m.mode || 'Battle Royale'}
                             </span>
                             {m.status === 'completed' ? (
                              <span className="bg-emerald-50 border border-emerald-200 text-[#16A34A] text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                                Completed
                              </span>
                            ) : m.status === 'ongoing' ? (
                              <span className="bg-red-50 border border-red-200 text-red-600 text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                                Live / Ongoing
                              </span>
                            ) : (
                              <span className="bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                                Upcoming
                              </span>
                            )}
                           </div>

                           <div className="flex gap-1.5 shrink-0">
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDuplicateMatch(m);
                              }}
                              className="p-2 bg-[#ECFDF5] text-[#16A34A] rounded-lg hover:bg-[#16A34A] transition-colors hover:text-white border border-[#BBF7D0]"
                              title="Duplicate Match"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleEditMatch(m);
                              }}
                              className="p-2 bg-emerald-50 text-[#16A34A] rounded-lg hover:bg-[#16A34A] transition-colors hover:text-white border border-emerald-200"
                              title="Edit Match"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsDeleteConfirmOpen({ isOpen: true, matchId: m.id });
                              }}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 transition-colors hover:text-white border border-red-200"
                              title="Delete Match"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <h4 className="text-sm font-extrabold mb-2 text-slate-900">{m.title}</h4>

                        <div className="flex gap-4 mb-4 flex-wrap">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock size={12} className="text-[#16A34A]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider tabular-nums">{formatMatchTime(m.time)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <MapIcon size={12} className="text-[#16A34A]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{m.map}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between py-3 border-y border-slate-100">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Players Joined</p>
                            <p className="text-xs font-black text-slate-900 tabular-nums">{m.playersCount}/{m.totalSlots || m.maxPlayers}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Entry Fee</p>
                            <p className="text-xs font-black text-[#16A34A] leading-none tabular-nums">{m.entryFee === 0 ? 'FREE' : `₹${m.entryFee}`}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Prize Pool</p>
                            <p className="text-xs font-black text-[#16A34A] leading-none tabular-nums">{m.prizeType === 'perKill' ? `₹${m.perKillAmount}/kill` : `₹${m.prizePool}`}</p>
                          </div>
                        </div>

                        {/* Room Credentials Banner */}
                        <div className="mt-4 p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key size={14} className={hasRoomCreds ? 'text-[#16A34A]' : 'text-amber-600'} />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-800">Room Credentials</span>
                            </div>
                            {hasRoomCreds ? (
                              <span className="text-[9px] font-black uppercase tracking-wider text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Declared & Ready
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Pending
                              </span>
                            )}
                          </div>

                          {hasRoomCreds ? (
                            <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                              <div className="flex items-center justify-between pr-1">
                                <div>
                                  <p className="text-[8px] font-bold text-slate-500 uppercase">Room ID</p>
                                  <p className="text-xs font-black text-[#16A34A] font-mono tabular-nums">{m.roomId}</p>
                                </div>
                                <button 
                                  onClick={() => handleCopyCredential(m.roomId!, `room_${m.id}`)}
                                  className="p-1 text-slate-400 hover:text-[#16A34A]"
                                  title="Copy Room ID"
                                >
                                  {copiedKey === `room_${m.id}` ? <Check size={12} className="text-[#16A34A]" /> : <Copy size={12} />}
                                </button>
                              </div>
                              <div className="flex items-center justify-between pr-1 border-l border-slate-200 pl-2">
                                <div>
                                  <p className="text-[8px] font-bold text-slate-500 uppercase">Password</p>
                                  <p className="text-xs font-black text-[#16A34A] font-mono tabular-nums">{m.roomPassword}</p>
                                </div>
                                <button 
                                  onClick={() => handleCopyCredential(m.roomPassword!, `pass_${m.id}`)}
                                  className="p-1 text-slate-400 hover:text-[#16A34A]"
                                  title="Copy Password"
                                >
                                  {copiedKey === `pass_${m.id}` ? <Check size={12} className="text-[#16A34A]" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] font-medium text-slate-500">
                              Room ID & Password not declared yet. Enter below or click Declare Room.
                            </p>
                          )}

                          {/* Quick Inline Inputs */}
                          <div className="flex items-center gap-2 pt-1">
                            <input 
                              type="text" 
                              placeholder="Room ID"
                              defaultValue={m.roomId || ''}
                              id={`quick_room_${m.id}`}
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-900 outline-none focus:border-[#16A34A] placeholder:text-slate-400"
                            />
                            <input 
                              type="text" 
                              placeholder="Pass"
                              defaultValue={m.roomPassword || ''}
                              id={`quick_pass_${m.id}`}
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-900 outline-none focus:border-[#16A34A] placeholder:text-slate-400"
                            />
                            <button
                              disabled={isProcessing}
                              onClick={async () => {
                                if (isProcessing) return;
                                const idInput = document.getElementById(`quick_room_${m.id}`) as HTMLInputElement;
                                const passInput = document.getElementById(`quick_pass_${m.id}`) as HTMLInputElement;
                                const rId = idInput ? idInput.value.trim() : '';
                                const rPass = passInput ? passInput.value.trim() : '';
                                if (rId === (m.roomId || '') && rPass === (m.roomPassword || '')) {
                                  return;
                                }
                                setIsProcessing(true);
                                try {
                                  const updates: any = { 
                                    roomId: rId, 
                                    roomPassword: rPass, 
                                    updatedAt: serverTimestamp() 
                                  };
                                  if (rId && m.status === 'upcoming') {
                                    updates.status = 'ongoing';
                                  }
                                  await updateDoc(doc(db, 'matches', m.id), updates);
                                  alert('Room credentials updated!');
                                } catch (err) {
                                  handleFirestoreError(err, OperationType.UPDATE, `matches/${m.id}`);
                                } finally {
                                  setIsProcessing(false);
                                }
                              }}
                              className="p-2.5 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white rounded-xl active:scale-95 transition-all shadow-2xs"
                              title="Save Credentials Quick"
                            >
                              <Save size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Action Buttons: Declare Room Modal & Declare Result */}
                        <div className="grid grid-cols-2 gap-2 mt-4">
                          <button 
                            onClick={() => handleOpenDeclareRoomModal(m)}
                            className="py-3 bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] text-[#16A34A] rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                          >
                            <Key size={13} />
                            {hasRoomCreds ? 'Edit Room Info' : 'Declare Room'}
                          </button>

                          {m.status !== 'completed' ? (
                            <button 
                              onClick={() => handleDeclareResult(m)}
                              className="py-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                            >
                              <Trophy size={13} />
                              Declare Result
                            </button>
                          ) : (
                            <div className="py-3 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 text-center flex items-center justify-center gap-1.5">
                              <CheckCheck size={13} className="text-[#16A34A]" />
                              Result Declared
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.TRANSACTIONS && canAccessSection('transactions') && (
            <motion.div
              key="transactions"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between mb-2">
                 <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">History Log</h4>
                 <RefreshCw size={14} className="text-[#16A34A]" />
              </div>
              {transactions.map((t) => (
                <div key={t.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                      t.type === 'deposit' || t.type === 'refund' || t.type === 'win'
                        ? 'text-[#16A34A] bg-emerald-50 border-emerald-200'
                        : 'text-red-600 bg-red-50 border-red-200'
                    }`}>
                      {t.type === 'deposit' || t.type === 'win' ? <Plus size={16} /> : t.type === 'refund' ? <CheckCircle2 size={16} /> : <Minus size={16} />}
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 leading-none mb-1">{t.type}</h4>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 font-mono">ID: {t.id.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-black tabular-nums ${
                      t.type === 'deposit' || t.type === 'refund' || t.type === 'win' ? 'text-[#16A34A]' : 'text-red-600'
                    }`}>
                      {t.type === 'deposit' || t.type === 'refund' || t.type === 'win' ? '+' : '-'}₹{t.amount}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      {t.createdAt?.toDate().toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === AdminTab.RULES && canAccessSection('gameRules') && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-5"
            >
              {/* Header & Add Section Action */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                    <ListChecks size={16} className="text-[#16A34A]" />
                    Game Mode Regulations
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
                    Customize rules for all game mode sections
                  </p>
                </div>
                <button
                  onClick={() => setIsAddSectionModalOpen(true)}
                  className="px-3.5 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-all shadow-2xs"
                >
                  <PlusCircle size={13} />
                  Add Section
                </button>
              </div>

              {/* Dynamic Horizontal Section Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {allAvailableRuleSections.map((sec) => {
                  const isActive = activeRuleTab === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => setActiveRuleTab(sec.id)}
                      className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2 ${
                        isActive
                          ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-[#BBF7D0]'
                      }`}
                    >
                      <span>{sec.title}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {sec.rulesCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Section Rule Configuration Card */}
              <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-3xl space-y-5 shadow-xs">
                {/* Section Meta Inputs */}
                <div className="grid grid-cols-2 gap-3 pb-4 border-b border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Section Title</label>
                    <input 
                      type="text"
                      value={activeSectionTitle}
                      onChange={(e) => setActiveSectionTitle(e.target.value)}
                      placeholder="e.g. Battle Royale"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Category Tag</label>
                    <input 
                      type="text"
                      value={activeSectionCategory}
                      onChange={(e) => setActiveSectionCategory(e.target.value)}
                      placeholder="e.g. BR Esports"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  </div>
                </div>

                {/* Editor Mode Switcher */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setRuleEditMode('interactive')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        ruleEditMode === 'interactive' ? 'bg-[#16A34A] text-white shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Interactive Builder ({ruleList.length})
                    </button>
                    <button
                      onClick={() => setRuleEditMode('raw')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        ruleEditMode === 'raw' ? 'bg-[#16A34A] text-white shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Multi-line Text
                    </button>
                  </div>

                  {/* Preset Template Loaders */}
                  <div className="relative group">
                    <button className="text-[9px] font-black uppercase tracking-wider text-[#16A34A] bg-[#ECFDF5] border border-[#BBF7D0] px-3 py-2 rounded-lg flex items-center gap-1.5">
                      <Sparkles size={12} />
                      Load Preset
                    </button>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-xl p-1.5 shadow-xl z-20 w-52 space-y-1">
                      {Object.keys(RULE_PRESETS).map(pKey => (
                        <button
                          key={pKey}
                          onClick={() => handleApplyPresetTemplate(pKey)}
                          className="text-left px-3 py-2 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-[#16A34A] hover:text-white transition-colors"
                        >
                          {RULE_PRESETS[pKey].title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Interactive Builder Mode */}
                {ruleEditMode === 'interactive' ? (
                  <div className="space-y-3">
                    {/* Add Single Rule Input */}
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Add a new rule item (e.g. Device Requirement, Headshot Limit)..."
                        value={newSingleRuleText}
                        onChange={(e) => setNewSingleRuleText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSingleRule();
                          }
                        }}
                        className="flex-1 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 outline-none focus:border-[#16A34A] placeholder:text-slate-400"
                      />
                      <button
                        onClick={handleAddSingleRule}
                        className="px-4 py-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all"
                      >
                        Add
                      </button>
                    </div>

                    {/* Rule List Items */}
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1 no-scrollbar">
                      {ruleList.length === 0 ? (
                        <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">No rules in this section yet</p>
                          <p className="text-[10px] text-slate-500 mt-1">Use the input above or load a starter preset</p>
                        </div>
                      ) : (
                        ruleList.map((r, idx) => (
                          <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3 group">
                            <span className="w-5 h-5 rounded-full bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <input 
                                type="text"
                                value={r}
                                onChange={(e) => {
                                  const updated = [...ruleList];
                                  updated[idx] = e.target.value;
                                  setRuleList(updated);
                                  setRuleText(updated.join('\n'));
                                }}
                                className="w-full bg-transparent text-xs text-slate-800 font-medium outline-none focus:text-slate-900"
                              />
                            </div>
                            <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
                              <button 
                                onClick={() => handleMoveRule(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1 text-slate-500 hover:text-[#16A34A] disabled:opacity-25"
                                title="Move Up"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button 
                                onClick={() => handleMoveRule(idx, 'down')}
                                disabled={idx === ruleList.length - 1}
                                className="p-1 text-slate-500 hover:text-[#16A34A] disabled:opacity-25"
                                title="Move Down"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteSingleRule(idx)}
                                className="p-1 hover:text-red-600 text-slate-400"
                                title="Delete Rule"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  /* Multi-line Raw Mode */
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Enter one rule per line ({ruleText.split('\n').filter(r => r.trim().length > 0).length} lines detected)
                    </p>
                    <textarea
                      value={ruleText}
                      onChange={(e) => {
                        setRuleText(e.target.value);
                        setRuleList(e.target.value.split('\n').filter(r => r.trim().length > 0));
                      }}
                      placeholder="Enter match rules here..."
                      className="w-full h-80 bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl p-4 text-xs font-medium text-slate-800 outline-none focus:border-[#16A34A] transition-all resize-none no-scrollbar leading-loose font-mono"
                    />
                  </div>
                )}

                {/* Save Regulations & Section Actions */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={handleSaveCurrentSectionRules}
                    disabled={isProcessing}
                    className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save "{activeSectionTitle}" Regulations
                  </button>

                  {!['battle_royale', 'clash_squad', 'lone_wolf'].includes(activeRuleTab) && (
                    <button
                      onClick={() => handleDeleteCustomSectionRules(activeRuleTab, activeSectionTitle)}
                      disabled={isProcessing}
                      className="w-full py-2.5 text-red-600 hover:text-red-700 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Delete This Custom Section Rules
                    </button>
                  )}
                </div>
              </div>

              {/* Guidelines Info Banner */}
              <div className="p-4 bg-[#ECFDF5] border border-[#BBF7D0] rounded-2xl">
                 <p className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider leading-relaxed flex items-center gap-2">
                   <Sparkles size={14} className="shrink-0" />
                   Live Sync: Rules configured here are dynamically matched to user screens by Section and Mode name.
                 </p>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.REFERRAL && canAccessSection('referralAndSupport') && (
            <motion.div
              key="referral"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-6"
            >
              {/* Referral Settings */}
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-5 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                   <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Referral Engine</h3>
                   <Copy size={16} className="text-[#16A34A]" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Base Referral URL (e.g. https://ap-tournaments-official.netlify.app)</label>
                    <input 
                      type="text"
                      placeholder="https://ap-tournaments-official.netlify.app"
                      value={
                        !appSettings?.referral?.baseUrl ||
                        appSettings.referral.baseUrl.includes('ais-dev-') ||
                        appSettings.referral.baseUrl.includes('ais-pre-') ||
                        appSettings.referral.baseUrl.includes('localhost')
                          ? 'https://ap-tournaments-official.netlify.app'
                          : appSettings.referral.baseUrl
                      }
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, baseUrl: e.target.value }
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Per Referral Reward (₹)</label>
                    <input 
                      type="number"
                      value={appSettings?.referral?.perReferralReward || 0}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, perReferralReward: Number(e.target.value) }
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A] tabular-nums"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Reward Type</label>
                    <select 
                      value={appSettings?.referral?.rewardType || 'bonus'}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, rewardType: e.target.value }
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A] appearance-none shadow-none ring-0"
                    >
                      <option value="bonus">Bonus Only</option>
                      <option value="deposit">Deposit Only</option>
                      <option value="both">Both (Split)</option>
                    </select>
                  </div>

                  {appSettings?.referral?.rewardType === 'both' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Deposit %</label>
                        <input 
                          type="number"
                          value={appSettings?.referral?.depositPercentage || 50}
                          onChange={(e) => setAppSettings({
                            ...appSettings,
                            referral: { ...appSettings?.referral, depositPercentage: Number(e.target.value) }
                          })}
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A] tabular-nums"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Bonus %</label>
                        <input 
                          type="number"
                          value={appSettings?.referral?.bonusPercentage || 50}
                          onChange={(e) => setAppSettings({
                            ...appSettings,
                            referral: { ...appSettings?.referral, bonusPercentage: Number(e.target.value) }
                          })}
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A] tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">New User Reward (₹)</label>
                    <input 
                      type="number"
                      value={appSettings?.referral?.newUserReward || 0}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        referral: { ...appSettings?.referral, newUserReward: Number(e.target.value) }
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A] tabular-nums"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Referral Configuration
                </button>
              </div>

              {/* Support Settings */}
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-5 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                   <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Customer Support</h3>
                   <UsersIcon size={16} className="text-[#16A34A]" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">WhatsApp Link</label>
                    <input 
                      type="text"
                      placeholder="https://wa.me/..."
                      value={appSettings?.support?.whatsapp || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, whatsapp: e.target.value }
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Telegram Link</label>
                    <input 
                      type="text"
                      placeholder="https://t.me/..."
                      value={appSettings?.support?.telegram || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, telegram: e.target.value }
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Support Email</label>
                    <input 
                      type="email"
                      placeholder="support@example.com"
                      value={appSettings?.support?.email || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        support: { ...appSettings?.support, email: e.target.value }
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Update Support Links
                </button>
              </div>

              {/* Legal Policies Settings */}
              <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-5 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                   <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">App Policies & Legal Documents</h3>
                   <FileText size={16} className="text-[#16A34A]" />
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A] ml-1">Privacy Policy Text</label>
                    <textarea 
                      rows={4}
                      placeholder="Enter custom Privacy Policy content..."
                      value={appSettings?.privacyPolicy || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        privacyPolicy: e.target.value
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl p-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#16A34A] leading-relaxed resize-y"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A] ml-1">Terms of Service Text</label>
                    <textarea 
                      rows={4}
                      placeholder="Enter custom Terms of Service content..."
                      value={appSettings?.termsOfService || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        termsOfService: e.target.value
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl p-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#16A34A] leading-relaxed resize-y"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A] ml-1">Refund & Cancellation Policy Text</label>
                    <textarea 
                      rows={4}
                      placeholder="Enter custom Refund & Cancellation Policy content..."
                      value={appSettings?.refundPolicy || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        refundPolicy: e.target.value
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl p-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#16A34A] leading-relaxed resize-y"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-red-600 ml-1">Fair Play & Anti-Cheat Policy Text</label>
                    <textarea 
                      rows={4}
                      placeholder="Enter custom Fair Play & Anti-Cheat Policy content..."
                      value={appSettings?.fairPlayPolicy || ''}
                      onChange={(e) => setAppSettings({
                        ...appSettings,
                        fairPlayPolicy: e.target.value
                      })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl p-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#16A34A] leading-relaxed resize-y"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => handleSaveSettings(appSettings)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save All Legal Policies
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.BANNERS && canAccessSection('banners') && (
            <motion.div
              key="banners"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-5"
            >
              <button 
                onClick={() => {
                  setEditingBanner(null);
                  setImageUrl('');
                  setRedirectUrl('');
                  setBannerType('main');
                  setBannerOrder(banners.length);
                  setIsBannerModalOpen(true);
                }}
                className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl flex items-center justify-center gap-2.5 shadow-xs active:scale-[0.98] transition-all cursor-pointer"
              >
                <Plus size={18} />
                <span className="text-xs font-black uppercase tracking-widest">Add Promotion Banner</span>
              </button>

              <div className="space-y-4">
                {banners.filter(b => b.isActive !== false).map((b) => (
                  <div key={b.id} className="p-4 bg-white border border-slate-200 rounded-3xl group shadow-xs">
                    <div className="relative aspect-video rounded-2xl overflow-hidden mb-4 border border-slate-200 bg-slate-100">
                      <SafeImage 
                        src={b.imageUrl} 
                        alt="" 
                        className="w-full h-full"
                      />
                      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200 flex items-center gap-2 z-20 shadow-2xs">
                        <div className={`w-1.5 h-1.5 rounded-full ${b.type === 'main' || b.type === 'offer' ? 'bg-[#16A34A]' : 'bg-[#16A34A]'}`} />
                        <span className="text-[9px] font-black uppercase text-slate-900 tracking-widest">{b.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 tabular-nums">Order: {b.order}</p>
                        {b.redirectUrl && <p className="text-[10px] font-bold text-[#16A34A] truncate max-w-[180px]">{b.redirectUrl}</p>}
                      </div>
                      <div className="flex gap-2">
                         <button 
                          onClick={() => {
                            setEditingBanner(b);
                            setImageUrl(b.imageUrl);
                            setRedirectUrl(b.redirectUrl || '');
                            setBannerType(b.type);
                            setBannerOrder(b.order);
                            setIsBannerModalOpen(true);
                          }}
                          className="p-2.5 bg-[#ECFDF5] text-[#16A34A] border border-[#BBF7D0] rounded-xl hover:bg-[#16A34A] hover:text-white transition-all"
                         >
                          <Edit2 size={16} />
                         </button>
                         <button 
                          onClick={() => handleDeleteBanner(b.id!)}
                          disabled={deletingBannerId === b.id}
                          className="p-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                         >
                          {deletingBannerId === b.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                         </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.PAYMENT && canAccessSection('paymentGateways') && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-5"
            >
              <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-3xl flex items-center justify-between shadow-xs">
                 <div>
                   <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 mb-1">Payment Gateways</h3>
                   <p className="text-[10px] font-bold uppercase tracking-widest text-[#16A34A]">Enable/Disable payment providers</p>
                 </div>
                 <button 
                  onClick={() => {
                    setEditingGateway(null);
                    setGatewayForm({
                      name: '',
                      apiKey: '',
                      secretKey: '',
                      merchantId: '',
                      webhookSecret: '',
                      upiId: ''
                    });
                    setIsGatewayModalOpen(true);
                  }}
                  className="p-3 bg-[#16A34A] hover:bg-[#15803D] rounded-xl text-white active:scale-90 transition-all shadow-xs"
                 >
                   <Plus size={20} />
                 </button>
              </div>

              <div className="space-y-4">
                {['razorpay', 'cashfree', 'transupi', 'zapupi', 'custom'].map(gId => {
                  const gateway = paymentGateways.find(g => g.id === gId);
                  const isConfigured = !!gateway;
                  const isActive = gateway?.isActive || false;

                  return (
                    <div key={gId} className={`p-5 bg-white border rounded-3xl transition-all shadow-xs ${isActive ? 'border-emerald-400 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                            isActive ? 'bg-[#16A34A] border-[#16A34A] text-white' : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}>
                            <DollarSign size={20} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-tight text-slate-900">{gateway?.name || gId.toUpperCase()}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[9px] font-black uppercase tracking-widest ${isConfigured ? 'text-[#16A34A]' : 'text-slate-400'}`}>
                                {isConfigured ? 'Configured' : 'Not Configured'}
                              </span>
                              {isActive && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Active</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {isConfigured && (
                            <button 
                              onClick={() => {
                                setEditingGateway(gateway);
                                setGatewayForm({
                                  name: gateway.name,
                                  apiKey: gateway.apiKey || '',
                                  secretKey: gateway.secretKey || '',
                                  merchantId: gateway.merchantId || '',
                                  webhookSecret: gateway.webhookSecret || '',
                                  upiId: gateway.upiId || ''
                                });
                                setIsGatewayModalOpen(true);
                              }}
                              className="p-2 text-slate-500 hover:text-[#16A34A] transition-colors"
                            >
                              <Settings size={16} />
                            </button>
                          )}
                          <button 
                            disabled={isProcessing || !isConfigured}
                            onClick={() => handleToggleGateway(gId, isActive)}
                            className={`w-12 h-6 rounded-full relative transition-all ${isActive ? 'bg-[#16A34A]' : 'bg-slate-300'} ${!isConfigured ? 'opacity-40' : ''}`}
                          >
                            <motion.div 
                              className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-xs"
                              animate={{ x: isActive ? 24 : 0 }}
                            />
                          </button>
                        </div>
                      </div>
                      
                      {isConfigured && (
                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Merchant ID</p>
                            <p className="text-[11px] font-bold text-slate-800 truncate font-mono">{gateway.merchantId || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">API Key</p>
                            <p className="text-[11px] font-bold text-slate-800 truncate">{gateway.apiKey ? '••••••••' : 'N/A'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === AdminTab.MODES && canAccessSection('gameModes') && (
            <motion.div
              key="modes"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="p-8 bg-white border border-slate-200 rounded-3xl text-center space-y-4 shadow-xs"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] flex items-center justify-center mx-auto">
                <Gamepad2 size={28} />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-slate-900">Game Modes Manager</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Create, reorder, and customize Free Fire & arena game mode categories.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onPageChange(Page.ADMIN_MODES)}
                className="px-6 py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xs cursor-pointer"
              >
                Open Game Modes
              </button>
            </motion.div>
          )}

          {activeTab === AdminTab.STAFF_MANAGEMENT && isAdminUser && (
            <motion.div
              key="staff_management"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <AdminStaffManagementTab users={users} currentUser={user} />
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>

      {/* User Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-end justify-center">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-2xl bg-white rounded-t-3xl p-7 pb-10 border-t border-slate-200 max-h-[85vh] overflow-y-auto shadow-2xl text-slate-900"
            >
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-lg font-extrabold text-slate-900">Manage User</h3>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current Balance</p>
                    <p className="text-xl font-black text-[#16A34A] tabular-nums mt-0.5">
                      ₹{(selectedUser.wallet?.deposit || 0) + (selectedUser.wallet?.winnings || 0) + (selectedUser.wallet?.bonus || 0)}
                    </p>
                  </div>
                  {isAdminUser ? (
                    <div className="flex gap-2">
                      <button 
                        disabled={isProcessing}
                        onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'deposit')}
                        className="p-3 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 rounded-xl text-white shadow-xs active:scale-95 transition-all"
                        title="Add ₹100"
                      >
                        <Plus size={18} />
                      </button>
                      <button 
                        disabled={isProcessing}
                        onClick={() => handleUpdateBalance(selectedUser.id!, 100, 'withdrawal')}
                        className="p-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl text-white shadow-xs active:scale-95 transition-all"
                        title="Deduct ₹100"
                      >
                        <Minus size={18} />
                      </button>
                    </div>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-200/70 text-slate-600 text-[9px] font-black uppercase tracking-wider">
                      View Only
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 mb-0.5">Account Safety</h4>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {selectedUser.isBanned ? 'User is Banned' : 'User is Active'}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleOpenBanModal(selectedUser)}
                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 border ${
                      selectedUser.isBanned 
                        ? 'bg-emerald-50 border-emerald-200 text-[#16A34A] hover:bg-emerald-100' 
                        : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                    } transition-all active:scale-95`}
                  >
                    {selectedUser.isBanned ? <Unlock size={14} /> : <Ban size={14} />}
                    {selectedUser.isBanned ? 'Unban' : 'Ban User'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 mb-0.5">Password Management</h4>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Send Reset Link</p>
                  </div>
                  <button 
                    onClick={() => handleResetPassword(selectedUser.email)}
                    className="px-5 py-2.5 bg-white border border-slate-200 hover:border-emerald-300 hover:text-[#16A34A] text-slate-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs active:scale-95"
                  >
                    Reset Password
                  </button>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Account Details</h4>
                   <div className="space-y-1">
                      <DetailRow label="Username" value={selectedUser.username} />
                      <DetailRow label="Email" value={selectedUser.email} />
                      <DetailRow label="Phone" value={selectedUser.phone || 'N/A'} />
                      <DetailRow label="Wallet" value={`₹${(selectedUser.wallet?.deposit || 0) + (selectedUser.wallet?.winnings || 0) + (selectedUser.wallet?.bonus || 0)}`} />
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen.isOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[60] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-xs bg-white rounded-3xl p-7 border border-slate-200 shadow-2xl text-center"
            >
              <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center text-red-600 mx-auto mb-5">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-2">Delete Match?</h3>
              <p className="text-xs font-medium text-slate-500 mb-7 leading-relaxed">
                This will delete the match and refund all joined players automatically.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsDeleteConfirmOpen({ isOpen: false, matchId: '' })}
                  className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold uppercase tracking-wider active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={processDeleteMatch}
                  disabled={isProcessing}
                  className="py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xs"
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Result Modal */}
      <AnimatePresence>
        {isResultModalOpen && selectedMatchResults && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[60] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col text-slate-900"
            >
              <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
                <div>
                   <h3 className="text-lg font-extrabold text-slate-900">Declare Result</h3>
                   <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">{selectedMatchResults.title}</p>
                </div>
                <button
                  onClick={() => setIsResultModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-widest text-[#16A34A]">Match Info</p>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Type</p>
                        <p className="text-xs font-extrabold text-slate-900">
                          {selectedMatchResults.section === 'Battle Royale' 
                            ? (selectedMatchResults.prizeType === 'perKill' ? 'Per Kill' : 'Survival')
                            : selectedMatchResults.section}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase font-bold">Prize Pool</p>
                        <p className="text-xs font-black text-[#16A34A] tabular-nums">
                          {selectedMatchResults.section === 'Battle Royale'
                            ? (selectedMatchResults.prizeType === 'perKill' ? `₹${selectedMatchResults.perKillAmount}/kill` : 'Split')
                            : `₹${selectedMatchResults.prizePool}`}
                        </p>
                      </div>
                   </div>
                </div>

                <div className="space-y-3">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Enter Results for Participants</p>
                   {selectedMatchResults.playersCount === 0 ? (
                     <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200">
                        <UsersIcon size={32} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">No players have joined this match</p>
                     </div>
                   ) : (
                     <div className="space-y-2.5">
                        {(selectedMatchResults.players || []).map(player => {
                            const playerKey = `${player.userId}_${player.slot}`;
                            const kills = playerResults[playerKey] || 0;
                            const rank = playerPositionResults[playerKey] || 0;
                            const killsReward = kills * (selectedMatchResults.perKillAmount || 0);
                            const posReward = selectedMatchResults.positionPrizeDistribution?.[rank] || 0;
                            const totalReward = killsReward + posReward;

                            return (
                              <div key={playerKey} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3.5">
                                <div className="flex items-center justify-between">
                                  <div 
                                    onClick={() => onPageChange(Page.ADMIN_USER_PROFILE, player.userId)}
                                    className="flex items-center gap-3 cursor-pointer group"
                                  >
                                   <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-600 border border-slate-200 group-hover:bg-[#ECFDF5] group-hover:text-[#16A34A] transition-colors">
                                      <UsersIcon size={16} />
                                   </div>
                                   <div>
                                     <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-[#16A34A] transition-colors leading-none mb-1">{player.ign}</h4>
                                     <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{player.username}</p>
                                   </div>
                                </div>
                                {totalReward > 0 && (
                                  <div className="text-right">
                                    <p className="text-xs font-black text-[#16A34A] tabular-nums">₹{totalReward}</p>
                                    <p className="text-[8px] text-slate-500 font-bold uppercase">Total Winnings</p>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 ml-1">
                                    {selectedMatchResults.section === 'Battle Royale' 
                                      ? (selectedMatchResults.prizeType === 'perKill' ? 'Kills' : 'Rank')
                                      : 'Rank (1=Win)'}
                                  </label>
                                  <div className="relative">
                                    <input 
                                      type="number"
                                      placeholder="0"
                                      value={playerResults[`${player.userId}_${player.slot}`] || ''}
                                      onChange={(e) => setPlayerResults({ ...playerResults, [`${player.userId}_${player.slot}`]: Number(e.target.value) })}
                                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#16A34A] outline-none tabular-nums"
                                    />
                                    {selectedMatchResults.prizeType === 'perKill' && killsReward > 0 && (
                                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-[#16A34A] tabular-nums">₹{killsReward}</span>
                                    )}
                                  </div>
                                </div>

                                {selectedMatchResults.prizeType === 'perKill' && (
                                  <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 ml-1">Rank (Optional)</label>
                                    <div className="relative">
                                      <select 
                                        value={rank}
                                        onChange={(e) => setPlayerPositionResults({ ...playerPositionResults, [`${player.userId}_${player.slot}`]: Number(e.target.value) })}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#16A34A] outline-none appearance-none"
                                      >
                                        <option value={0}>No Rank</option>
                                        {Array.from({ length: selectedMatchResults.positionWinnersCount || 0 }).map((_, idx) => (
                                          <option key={idx + 1} value={idx + 1}>Rank {idx + 1}</option>
                                        ))}
                                      </select>
                                      {posReward > 0 && (
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-[#16A34A] tabular-nums">₹{posReward}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {selectedMatchResults.prizeType === 'perKill' && totalReward > 0 && (
                                <div className="pt-2.5 border-t border-slate-200 flex justify-between items-center px-1">
                                  <div className="flex gap-3">
                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight tabular-nums">Kills: <span className="text-slate-900">₹{killsReward}</span></p>
                                    {posReward > 0 && (
                                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight tabular-nums">Rank: <span className="text-slate-900">₹{posReward}</span></p>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-black text-[#16A34A] tabular-nums">Total: ₹{totalReward}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                     </div>
                   )}
                </div>
              </div>

              <button 
                onClick={handleSubmitResult}
                disabled={isProcessing || selectedMatchResults.playersCount === 0}
                className="w-full mt-6 py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Finalize & Declare Results'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Banner Management Modal */}
      <AnimatePresence>
        {isBannerModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[70] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh] text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-lg font-extrabold text-slate-900">{editingBanner ? 'Edit Banner' : 'New Banner'}</h3>
                <button
                  onClick={() => setIsBannerModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Banner Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['main', 'offer', 'freefire'].map(t => (
                      <button
                        key={t}
                        onClick={() => {
                          setBannerType(t as any);
                        }}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                          bannerType === t 
                            ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-xs' 
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Banner Image</label>
                  
                  {imageUrl ? (
                    <div className="relative group aspect-video rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
                      <SafeImage 
                        src={imageUrl} 
                        alt="Preview" 
                        className="w-full h-full"
                      />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all z-20">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-white text-slate-900 text-[10px] font-black uppercase rounded-lg shadow-xl active:scale-95 transition-all"
                        >
                          Change Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-3 hover:border-[#16A34A] hover:bg-[#ECFDF5]/40 transition-all group"
                    >
                      {isUploading ? (
                        <Loader2 size={32} className="text-[#16A34A] animate-spin" />
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-[#16A34A] transition-colors shadow-2xs">
                            <Upload size={22} />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-[#16A34A]">Upload Banner Image</p>
                        </>
                      )}
                    </button>
                  )}
                  
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[9px] font-black text-[#16A34A]">UPLOADING...</span>
                        <span className="text-[9px] font-black text-[#16A34A] tabular-nums">{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <motion.div 
                          className="h-full bg-[#16A34A]"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {(bannerType === 'main' || bannerType === 'offer') && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Redirect Link (Optional)</label>
                    <input 
                      type="text"
                      value={redirectUrl}
                      onChange={(e) => setRedirectUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Display Order</label>
                  <input 
                    type="number"
                    value={bannerOrder}
                    onChange={(e) => setBannerOrder(Number(e.target.value))}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A] tabular-nums"
                  />
                </div>

                <button 
                  onClick={handleSaveBanner}
                  disabled={isProcessing || isUploading || !imageUrl}
                  className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-3 active:scale-95 transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : isUploading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isUploading ? 'Uploading Image...' : editingBanner ? 'Update Promotion' : 'Publish Banner'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Gateway Modal */}
      <AnimatePresence>
        {isGatewayModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[70] flex items-center justify-center p-5">
            <motion.div 
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh] text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                <h3 className="text-lg font-extrabold text-slate-900">{editingGateway ? 'Gateway Settings' : 'Add Gateway'}</h3>
                <button
                  onClick={() => setIsGatewayModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Gateway Name</label>
                  <input 
                    type="text"
                    value={gatewayForm.name}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, name: e.target.value })}
                    placeholder="Razorpay, Cashfree, etc."
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Merchant ID</label>
                    <input 
                      type="text"
                      value={gatewayForm.merchantId}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, merchantId: e.target.value })}
                      placeholder="MID_123..."
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">UPI ID (Optional)</label>
                    <input 
                      type="text"
                      value={gatewayForm.upiId}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, upiId: e.target.value })}
                      placeholder="merchant@upi"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">API Key</label>
                  <input 
                    type="password"
                    value={gatewayForm.apiKey}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, apiKey: e.target.value })}
                    placeholder="Enter Public API Key"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Secret Key / Token</label>
                  <input 
                    type="password"
                    value={gatewayForm.secretKey}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, secretKey: e.target.value })}
                    placeholder="Enter Secret Key"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Webhook Secret (Optional)</label>
                  <input 
                    type="password"
                    value={gatewayForm.webhookSecret}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, webhookSecret: e.target.value })}
                    placeholder="Enter Webhook Secret"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                  />
                </div>

                <div className="pt-3">
                  <button 
                    onClick={handleSaveGateway}
                    disabled={isProcessing}
                    className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {editingGateway ? 'Save Configuration' : 'Create Gateway'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Room Credentials Modal */}
      <AnimatePresence>
        {isDeclareRoomModalOpen && selectedDeclareRoomMatch && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[75] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl overflow-hidden relative text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900 tracking-wide">
                      Declare Room Credentials
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Match: {selectedDeclareRoomMatch.displayId || selectedDeclareRoomMatch.id.slice(0, 6)} • {selectedDeclareRoomMatch.title}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsDeclareRoomModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 py-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Custom Room ID *
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={declareRoomForm.roomId}
                      onChange={(e) => setDeclareRoomForm({ ...declareRoomForm, roomId: e.target.value })}
                      placeholder="e.g. 19284752"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold font-mono text-slate-900 outline-none focus:border-[#16A34A] transition-all placeholder:text-slate-400"
                    />
                    {declareRoomForm.roomId && (
                      <button
                        onClick={() => handleCopyCredential(declareRoomForm.roomId, 'modal_room')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[#16A34A]"
                      >
                        {copiedKey === 'modal_room' ? <Check size={14} className="text-[#16A34A]" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Room Password *
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={declareRoomForm.roomPassword}
                      onChange={(e) => setDeclareRoomForm({ ...declareRoomForm, roomPassword: e.target.value })}
                      placeholder="e.g. 1234 or freefire"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold font-mono text-slate-900 outline-none focus:border-[#16A34A] transition-all placeholder:text-slate-400"
                    />
                    {declareRoomForm.roomPassword && (
                      <button
                        onClick={() => handleCopyCredential(declareRoomForm.roomPassword, 'modal_pass')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[#16A34A]"
                      >
                        {copiedKey === 'modal_pass' ? <Check size={14} className="text-[#16A34A]" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Match Status Transition
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeclareRoomForm({ ...declareRoomForm, setStatusLive: true })}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        declareRoomForm.setStatusLive
                          ? 'bg-emerald-50 border-emerald-300 text-[#16A34A]'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      Mark Live / Ongoing
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeclareRoomForm({ ...declareRoomForm, setStatusLive: false })}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        !declareRoomForm.setStatusLive
                          ? 'bg-[#ECFDF5] border-emerald-300 text-[#16A34A]'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      Keep Existing Status
                    </button>
                  </div>
                </div>

                {/* Auto Push Notification Toggle */}
                <div 
                  onClick={() => setDeclareRoomForm({ 
                    ...declareRoomForm, 
                    sendNotificationOnRoomDeclare: !declareRoomForm.sendNotificationOnRoomDeclare 
                  })}
                  className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                    declareRoomForm.sendNotificationOnRoomDeclare 
                      ? 'bg-[#ECFDF5] border-[#BBF7D0]' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      declareRoomForm.sendNotificationOnRoomDeclare 
                        ? 'bg-[#16A34A] text-white' 
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      <Bell size={14} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-900">
                        Auto Push Notification
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium">
                        Instantly alert joined players with Room ID & Pass
                      </p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    declareRoomForm.sendNotificationOnRoomDeclare 
                      ? 'bg-[#16A34A] border-[#16A34A] text-white' 
                      : 'border-slate-300 bg-white'
                  }`}>
                    {declareRoomForm.sendNotificationOnRoomDeclare && <Check size={12} />}
                  </div>
                </div>

                <div className="p-3 bg-[#ECFDF5] border border-[#BBF7D0] rounded-2xl">
                  <p className="text-[10px] font-semibold text-[#16A34A] leading-relaxed">
                    Once declared, players who joined this match will immediately see Room ID & Password on their Match Details screen and in their My Matches lobby.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleSaveDeclareRoom}
                  disabled={isProcessing}
                  className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Publish Room Credentials
                </button>

                {(selectedDeclareRoomMatch.roomId || selectedDeclareRoomMatch.roomPassword) && (
                  <button
                    onClick={() => handleClearRoomCredentials(selectedDeclareRoomMatch.id)}
                    disabled={isProcessing}
                    className="w-full py-2.5 text-slate-500 hover:text-red-600 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} />
                    Clear Credentials
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add New Game Mode Section Rules Modal */}
      <AnimatePresence>
        {isAddSectionModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[75] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl overflow-hidden relative text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900 tracking-wide">
                      Create Mode Section Rules
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Add a new game section with tailored rules
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAddSectionModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 py-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Section Name / Game Mode *
                  </label>
                  <input 
                    type="text"
                    value={newSectionForm.title}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, title: e.target.value })}
                    placeholder="e.g. Clash Squad 2v2, Lone Wolf Pro, Daily Scrims"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Category Tag
                  </label>
                  <input 
                    type="text"
                    value={newSectionForm.category}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, category: e.target.value })}
                    placeholder="e.g. Custom Tournament, Duo Scrims"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                    Initial Rules Preset
                  </label>
                  <select
                    value={newSectionForm.template}
                    onChange={(e) => setNewSectionForm({ ...newSectionForm, template: e.target.value })}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A] transition-all"
                  >
                    {Object.keys(RULE_PRESETS).map((pKey) => (
                      <option key={pKey} value={pKey}>
                        {RULE_PRESETS[pKey].title} ({RULE_PRESETS[pKey].rules.length} rules)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleAddNewSectionSubmit}
                  disabled={isProcessing}
                  className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                  Create Section & Rules
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* WITHDRAWAL APPROVAL MODAL */}
        {approvalModalTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl relative text-slate-900"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-[#16A34A] flex items-center justify-center">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900">Approve Withdrawal</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Confirm transfer to user</p>
                  </div>
                </div>
                <button
                  onClick={() => setApprovalModalTx(null)}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Summary Details */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">User:</span>
                  <span className="font-black text-slate-900 uppercase">{approvalModalTx.username || 'Gamer'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Amount to Send:</span>
                  <span className="font-black text-[#16A34A] text-base tabular-nums">₹{approvalModalTx.amount}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-2">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Payout Method:</span>
                  <span className="font-bold text-[#16A34A] uppercase text-[10px]">
                    {approvalModalTx.payoutMethod === 'upi' ? 'UPI Transfer' : 'Bank Transfer'}
                  </span>
                </div>
                {approvalModalTx.payoutDetails?.upiId && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase text-[10px]">UPI ID:</span>
                    <span className="font-mono font-bold text-slate-900 select-all text-xs">
                      {approvalModalTx.payoutDetails.upiId}
                    </span>
                  </div>
                )}
                {approvalModalTx.payoutDetails?.accountNumber && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase text-[10px]">Bank A/C:</span>
                    <span className="font-mono font-bold text-slate-900 select-all text-xs">
                      {approvalModalTx.payoutDetails.accountNumber} ({approvalModalTx.payoutDetails.ifsc})
                    </span>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <p className="text-[11px] text-[#16A34A] bg-[#ECFDF5] border border-[#BBF7D0] rounded-xl p-3 leading-relaxed">
                <strong>Important:</strong> Ensure you have transferred <strong>₹{approvalModalTx.amount}</strong> to the user's UPI/Bank account before confirming approval.
              </p>

              {/* UTR Reference Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                  Bank UTR / Transaction Reference (Optional)
                </label>
                <input 
                  type="text"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  placeholder="e.g. 412345678901 (from payment app)"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setApprovalModalTx(null)}
                  disabled={isProcessing}
                  className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleApproveWithdrawal(approvalModalTx, utrInput)}
                  disabled={isProcessing}
                  className="py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Confirm Approved
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* WITHDRAWAL REJECTION MODAL */}
        {rejectionModalTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl relative text-slate-900"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900">Reject & Refund</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Refund amount back to user winnings</p>
                  </div>
                </div>
                <button
                  onClick={() => setRejectionModalTx(null)}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Summary */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">User:</span>
                  <span className="font-black text-slate-900 uppercase">{rejectionModalTx.username || 'Gamer'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Amount to Refund:</span>
                  <span className="font-black text-red-600 text-base tabular-nums">₹{rejectionModalTx.amount}</span>
                </div>
                <p className="text-[10px] text-[#16A34A] font-bold pt-1.5 border-t border-slate-200">
                  Full ₹{rejectionModalTx.amount} will be automatically added back to user's Winnings wallet.
                </p>
              </div>

              {/* Rejection Reason */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                  Reason for Rejection <span className="text-red-600">*</span>
                </label>
                <input 
                  type="text"
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="e.g. Invalid UPI ID / Name mismatch"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-red-500 transition-colors"
                />

                {/* Quick Reason Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    'Invalid UPI ID',
                    'Bank A/C Details Incorrect',
                    'Name Mismatch',
                    'KYC Required',
                    'Suspicious Activity'
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setRejectionReasonInput(chip)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-bold text-slate-700 transition-colors cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectionModalTx(null)}
                  disabled={isProcessing}
                  className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleRejectWithdrawal(rejectionModalTx, rejectionReasonInput)}
                  disabled={isProcessing || !rejectionReasonInput.trim()}
                  className={`py-3.5 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                    isProcessing || !rejectionReasonInput.trim()
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white shadow-xs cursor-pointer active:scale-95'
                  }`}
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <AlertCircle size={14} />}
                  Reject & Refund
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* BAN & DEVICE BLACKLIST MODAL */}
        {banModalUser && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="bg-white border border-slate-200 rounded-[2rem] p-6 max-w-md w-full space-y-4 shadow-2xl relative text-slate-900"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                    banModalUser.isBanned
                      ? 'bg-emerald-50 border-emerald-200 text-[#16A34A]'
                      : 'bg-red-50 border-red-200 text-red-600'
                  }`}>
                    {banModalUser.isBanned ? <Unlock size={20} /> : <ShieldAlert size={20} />}
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900">
                      {banModalUser.isBanned ? 'Unban User & Device' : 'Block Hacker / Ban User'}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {banModalUser.username} • {banModalUser.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isProcessing && setBanModalUser(null)}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="font-black uppercase text-slate-500">Device:</span>
                  <span className="font-bold text-slate-900">{banModalUser.deviceInfo || 'Unknown Device'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-black uppercase text-slate-500">Hardware ID:</span>
                  <span className="font-mono font-bold text-slate-700 truncate max-w-[190px]">
                    {banModalUser.deviceId || 'Not recorded yet'}
                  </span>
                </div>
              </div>

              {!banModalUser.isBanned ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                      Violation / Hack Reason
                    </label>
                    <input
                      type="text"
                      value={banReasonInput}
                      onChange={(e) => setBanReasonInput(e.target.value)}
                      placeholder="e.g. Free Fire Hack / Config File"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:border-red-500"
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
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                            banReasonInput === preset
                              ? 'bg-red-50 border-red-300 text-red-700'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
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
                      !banModalUser.deviceId
                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                        : blacklistDeviceChecked
                        ? 'bg-red-50 border-red-500'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={blacklistDeviceChecked && Boolean(banModalUser.deviceId)}
                      disabled={!banModalUser.deviceId}
                      onChange={(e) => setBlacklistDeviceChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-red-600 cursor-pointer shrink-0"
                    />
                    <div>
                      <p className="text-xs font-black uppercase text-red-700 flex items-center gap-1.5">
                        <Smartphone size={14} /> Blacklist Device (Hardware Ban)
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600 leading-relaxed mt-0.5">
                        {banModalUser.deviceId
                          ? 'Check karne par is phone/device me app nahi khulega, login nahi hoga aur na hi naya account banega.'
                          : 'Is user ka Device ID record nahi hua hai (sirf account ban hoga).'}
                      </p>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-800 flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>Reason: {banModalUser.banReason || 'FairPlay Violation'}</span>
                  </div>
                  {banModalUser.deviceId && (
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
                        className="mt-0.5 w-4 h-4 accent-[#16A34A] cursor-pointer shrink-0"
                      />
                      <div>
                        <p className="text-xs font-black uppercase text-[#16A34A]">
                          Remove Device From Blacklist
                        </p>
                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                          Is phone ko hardware blacklist se bhi hata dein.
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setBanModalUser(null)}
                  className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleConfirmBanModal}
                  className={`py-3.5 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${
                    banModalUser.isBanned ? 'bg-[#16A34A] hover:bg-[#15803D]' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : banModalUser.isBanned ? <Unlock size={14} /> : <Ban size={14} />}
                  {banModalUser.isBanned ? 'Confirm Unban' : 'Confirm Block'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between h-32 relative overflow-hidden group shadow-xs">
      <Icon size={48} className={`absolute -right-2 -bottom-2 opacity-15 ${color} group-hover:scale-110 transition-transform`} />
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 relative z-10">{label}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tight truncate relative z-10 tabular-nums">{value}</p>
    </div>
  );
}

function HealthBar({ label, status }: any) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#16A34A]">{status}</span>
        <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: any) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-slate-200 last:border-b-0">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <span className="text-xs font-bold text-slate-900">{value}</span>
    </div>
  );
}
