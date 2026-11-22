import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  UserPlus,
  UserMinus,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Save,
  Users,
  Lock,
  Check,
  X
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AdminSectionKey, StaffPermissions, User } from '../types';
import {
  ADMIN_SECTIONS_CONFIG,
  ADMIN_SECTION_KEYS,
  DEFAULT_STAFF_PERMISSIONS,
  countEnabledStaffPermissions,
  isFullAdmin,
  normalizeStaffPermissions,
  resolveUserRole
} from '../utils/adminPermissions';

interface AdminStaffManagementTabProps {
  users: User[];
  currentUser?: User | null;
}

export default function AdminStaffManagementTab({ users, currentUser }: AdminStaffManagementTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<User | null>(null);
  const [lookupResults, setLookupResults] = useState<User[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Record<string, StaffPermissions>>({});
  const draftPermissionsRef = React.useRef<Record<string, StaffPermissions>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [demoteConfirmUser, setDemoteConfirmUser] = useState<User | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const adminVerified = isFullAdmin(currentUser, auth.currentUser?.email, auth.currentUser?.uid);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  // Merge loaded users with any targeted email/UID lookup results (deduped by id)
  const allKnownUsers = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) {
      if (u.id) map.set(u.id, u);
    }
    for (const u of lookupResults) {
      if (u.id && !map.has(u.id)) map.set(u.id, u);
    }
    return Array.from(map.values());
  }, [users, lookupResults]);

  const staffMembers = useMemo(() => {
    return allKnownUsers
      .filter((u) => resolveUserRole(u) === 'staff')
      .sort((a, b) => (a.username || a.email || '').localeCompare(b.username || b.email || ''));
  }, [allKnownUsers]);

  const adminMembers = useMemo(() => {
    return allKnownUsers.filter((u) => resolveUserRole(u) === 'admin');
  }, [allKnownUsers]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allKnownUsers
      .filter((u) => {
        const name = (u.username || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const phone = (u.phone || '').toLowerCase();
        const uid = (u.id || '').toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q) || uid.includes(q);
      })
      .slice(0, 12);
  }, [allKnownUsers, searchQuery]);

  // Cost-safe targeted lookup for exact email or UID if not already in loaded list
  const handleTargetedLookup = async () => {
    const raw = searchQuery.trim();
    if (!raw || isLookingUp || !adminVerified) return;
    setIsLookingUp(true);
    try {
      const found: User[] = [];
      if (raw.includes('@')) {
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', raw), limit(5)));
        snap.docs.forEach((d) => found.push({ id: d.id, ...d.data() } as User));
      } else {
        const directSnap = await getDoc(doc(db, 'users', raw));
        if (directSnap.exists()) {
          found.push({ id: directSnap.id, ...directSnap.data() } as User);
        } else {
          const nameSnap = await getDocs(query(collection(db, 'users'), where('username', '==', raw), limit(5)));
          nameSnap.docs.forEach((d) => found.push({ id: d.id, ...d.data() } as User));
        }
      }

      if (found.length === 0) {
        showToast('error', 'No matching user found for that exact email, username, or UID.');
      } else {
        setLookupResults((prev) => {
          const map = new Map(prev.map((u) => [u.id, u]));
          found.forEach((u) => {
            if (u.id) map.set(u.id, u);
          });
          return Array.from(map.values());
        });
        setSelectedCandidate(found[0]);
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'users');
      showToast('error', err?.message || 'Could not look up user.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const getDraftForStaff = (staff: User): StaffPermissions => {
    if (staff.id && draftPermissions[staff.id]) {
      return draftPermissions[staff.id];
    }
    return normalizeStaffPermissions(staff.staffPermissions);
  };

  const hasUnsavedChanges = (staff: User): boolean => {
    if (!staff.id || !draftPermissions[staff.id]) return false;
    const saved = normalizeStaffPermissions(staff.staffPermissions);
    const draft = draftPermissions[staff.id];
    return ADMIN_SECTION_KEYS.some((key) => saved[key] !== draft[key]);
  };

  const persistPermissionsToFirestore = async (staff: User, permsToSave: StaffPermissions, label?: string) => {
    if (!adminVerified || !staff.id || resolveUserRole(staff) === 'admin') return;
    setSavingUserId(staff.id);
    try {
      await updateDoc(doc(db, 'users', staff.id), {
        role: 'staff',
        isStaff: true,
        staffPermissions: permsToSave,
        staffUpdatedAt: serverTimestamp(),
        staffUpdatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'admin'
      });
      const count = countEnabledStaffPermissions(permsToSave);
      showToast(
        'success',
        label || `Saved permissions for ${staff.username || staff.email} (${count}/11 sections enabled).`
      );
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${staff.id}`);
      showToast('error', err?.message || 'Failed to update staff permissions.');
    } finally {
      setSavingUserId((prev) => (prev === staff.id ? null : prev));
    }
  };

  const handleToggleExpand = (staff: User) => {
    if (!staff.id) return;
    if (expandedStaffId === staff.id) {
      setExpandedStaffId(null);
      return;
    }
    const normalized = normalizeStaffPermissions(staff.staffPermissions);
    draftPermissionsRef.current[staff.id] = normalized;
    setDraftPermissions((prev) => ({
      ...prev,
      [staff.id!]: normalized
    }));
    setExpandedStaffId(staff.id);
  };

  const handleTogglePermissionKey = (staffId: string, key: AdminSectionKey) => {
    const staff = staffMembers.find((s) => s.id === staffId);
    if (!staff) return;
    const current =
      draftPermissionsRef.current[staffId] ||
      draftPermissions[staffId] ||
      normalizeStaffPermissions(staff.staffPermissions);
    const nextPerms: StaffPermissions = {
      ...current,
      [key]: !current[key]
    };
    draftPermissionsRef.current[staffId] = nextPerms;
    setDraftPermissions((prev) => ({
      ...prev,
      [staffId]: nextPerms
    }));
    persistPermissionsToFirestore(staff, nextPerms);
  };

  const handleBulkDraftSet = (staffId: string, value: boolean) => {
    const staff = staffMembers.find((s) => s.id === staffId);
    if (!staff) return;
    const next: StaffPermissions = { ...DEFAULT_STAFF_PERMISSIONS };
    for (const key of ADMIN_SECTION_KEYS) {
      next[key] = value;
    }
    draftPermissionsRef.current[staffId] = next;
    setDraftPermissions((prev) => ({ ...prev, [staffId]: next }));
    persistPermissionsToFirestore(
      staff,
      next,
      value
        ? `Enabled all 11 sections for ${staff.username || staff.email}.`
        : `Cleared all sections for ${staff.username || staff.email}.`
    );
  };

  const handlePromoteToStaff = async (target: User) => {
    if (!adminVerified || !target.id || savingUserId) return;
    if (resolveUserRole(target) === 'admin') {
      showToast('error', 'Admin accounts already have full access and cannot be changed to staff.');
      return;
    }
    if (resolveUserRole(target) === 'staff') {
      setExpandedStaffId(target.id);
      setSelectedCandidate(null);
      return;
    }

    setSavingUserId(target.id);
    try {
      const initialPerms = { ...DEFAULT_STAFF_PERMISSIONS };
      await updateDoc(doc(db, 'users', target.id), {
        role: 'staff',
        isStaff: true,
        isAdmin: false,
        staffPermissions: initialPerms,
        staffUpdatedAt: serverTimestamp(),
        staffUpdatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'admin'
      });

      draftPermissionsRef.current[target.id] = { ...initialPerms };
      setDraftPermissions((prev) => ({
        ...prev,
        [target.id!]: { ...initialPerms }
      }));
      setExpandedStaffId(target.id);
      setSelectedCandidate(null);
      setSearchQuery('');
      showToast(
        'success',
        `${target.username || target.email} promoted to Staff. Toggle sections ON below — changes save automatically.`
      );
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.id}`);
      showToast('error', err?.message || 'Failed to promote user to staff.');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSaveStaffPermissions = async (staff: User) => {
    if (!adminVerified || !staff.id || savingUserId) return;
    const permsToSave = normalizeStaffPermissions(
      draftPermissionsRef.current[staff.id] || getDraftForStaff(staff)
    );
    await persistPermissionsToFirestore(staff, permsToSave);
  };

  const handleDemoteStaff = async (staff: User) => {
    if (!adminVerified || !staff.id || savingUserId) return;
    if (resolveUserRole(staff) === 'admin') return;

    setSavingUserId(staff.id);
    try {
      await updateDoc(doc(db, 'users', staff.id), {
        role: 'user',
        isStaff: false,
        staffPermissions: { ...DEFAULT_STAFF_PERMISSIONS },
        staffUpdatedAt: serverTimestamp(),
        staffUpdatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'admin'
      });
      setDraftPermissions((prev) => {
        const next = { ...prev };
        delete next[staff.id!];
        return next;
      });
      if (expandedStaffId === staff.id) {
        setExpandedStaffId(null);
      }
      setDemoteConfirmUser(null);
      showToast('success', `${staff.username || staff.email} has been demoted back to regular User.`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${staff.id}`);
      showToast('error', err?.message || 'Failed to demote staff user.');
    } finally {
      setSavingUserId(null);
    }
  };

  if (!adminVerified) {
    return (
      <div className="p-8 bg-white border border-red-200 rounded-3xl text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
          <Lock size={22} />
        </div>
        <h3 className="text-sm font-black uppercase text-slate-900">Admin-Only Section</h3>
        <p className="text-xs font-medium text-slate-500">
          Only full administrators can view or manage staff roles and section permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Feedback Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 shadow-xs ${
              toast.type === 'success'
                ? 'bg-[#ECFDF5] border-[#BBF7D0] text-[#15803D]'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {toast.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0 text-[#16A34A]" />
              ) : (
                <AlertCircle size={16} className="shrink-0 text-red-600" />
              )}
              <span className="leading-snug">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Overview Card */}
      <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold uppercase tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldCheck className="text-[#16A34A]" size={20} />
              Staff Management
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
              Promote users & control exact per-section admin permissions
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] text-[9px] font-black uppercase tracking-wider shrink-0">
            Admin Only
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 bg-[#ECFDF5]/60 border border-[#BBF7D0] rounded-2xl text-center">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Active Staff</p>
            <p className="text-lg font-black text-[#16A34A] mt-0.5 tabular-nums">{staffMembers.length}</p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Full Admins</p>
            <p className="text-lg font-black text-slate-900 mt-0.5 tabular-nums">{adminMembers.length}</p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Sections</p>
            <p className="text-lg font-black text-slate-900 mt-0.5 tabular-nums">11</p>
          </div>
        </div>
      </div>

      {/* Add / Promote User to Staff Card */}
      <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-xs">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <UserPlus size={15} className="text-[#16A34A]" />
            Add New Staff Member
          </h4>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            Search any user below to promote them to Staff. All 11 permissions default to OFF until you enable them.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSelectedCandidate(null);
              }}
              placeholder="Search by username, email, phone or UID..."
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A] transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={handleTargetedLookup}
            disabled={!searchQuery.trim() || isLookingUp}
            className="px-3.5 py-3 bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] text-[#16A34A] rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap disabled:opacity-50 transition-colors cursor-pointer"
            title="Targeted query by exact email, username, or UID"
          >
            {isLookingUp ? <Loader2 size={14} className="animate-spin" /> : 'Find Exact'}
          </button>
        </div>

        {/* Search Results Dropdown List */}
        {searchQuery.trim() && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {searchMatches.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <p className="text-xs font-bold text-slate-600">No loaded users match "{searchQuery}"</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Try clicking "Find Exact" with the user's exact email address or UID.
                </p>
              </div>
            ) : (
              searchMatches.map((candidate) => {
                const role = resolveUserRole(candidate);
                const isSelected = selectedCandidate?.id === candidate.id;
                const isBusy = savingUserId === candidate.id;
                return (
                  <div
                    key={candidate.id}
                    onClick={() => setSelectedCandidate(candidate)}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#ECFDF5]/60 border-[#16A34A]'
                        : 'bg-slate-50/70 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-[#16A34A] font-black text-xs flex items-center justify-center uppercase shrink-0">
                        {(candidate.username || candidate.email || 'U')[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-extrabold text-slate-900 truncate">
                            {candidate.username || 'Unnamed User'}
                          </p>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                              role === 'admin'
                                ? 'bg-slate-900 text-white'
                                : role === 'staff'
                                ? 'bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A]'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {role}
                          </span>
                        </div>
                        <p className="text-[10px] font-medium text-slate-500 truncate">
                          {candidate.email} {candidate.phone ? `• ${candidate.phone}` : ''}
                        </p>
                      </div>
                    </div>

                    {role === 'user' ? (
                      <button
                        type="button"
                        disabled={Boolean(savingUserId)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePromoteToStaff(candidate);
                        }}
                        className="px-3 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 shadow-2xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                        <span>Make Staff</span>
                      </button>
                    ) : role === 'staff' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleExpand(candidate);
                          setSearchQuery('');
                        }}
                        className="px-3 py-2 bg-white border border-[#BBF7D0] text-[#16A34A] hover:bg-[#ECFDF5] rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 cursor-pointer"
                      >
                        Edit Access
                      </button>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 px-2 shrink-0">
                        Full Admin
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Existing Staff Members List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <Users size={13} className="text-[#16A34A]" />
            Existing Staff Members ({staffMembers.length})
          </h4>
        </div>

        {staffMembers.length === 0 ? (
          <div className="p-10 bg-white border border-slate-200 rounded-3xl text-center space-y-2 shadow-xs">
            <ShieldCheck size={32} className="mx-auto text-slate-300" />
            <h4 className="text-xs font-black uppercase text-slate-700">No Staff Members Yet</h4>
            <p className="text-[11px] text-slate-500 font-medium max-w-xs mx-auto">
              Use the search box above to find a user and promote them to Staff with custom section access.
            </p>
          </div>
        ) : (
          staffMembers.map((staff) => {
            if (!staff.id) return null;
            const isExpanded = expandedStaffId === staff.id;
            const currentDraft = getDraftForStaff(staff);
            const savedEnabledCount = countEnabledStaffPermissions(staff.staffPermissions);
            const draftEnabledCount = countEnabledStaffPermissions(currentDraft);
            const dirty = hasUnsavedChanges(staff);
            const isBusy = savingUserId === staff.id;

            return (
              <div
                key={staff.id}
                className={`bg-white border rounded-3xl overflow-hidden transition-all shadow-xs ${
                  isExpanded ? 'border-[#16A34A] ring-1 ring-[#16A34A]/20' : 'border-slate-200'
                }`}
              >
                {/* Staff Card Header */}
                <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] font-black text-sm flex items-center justify-center uppercase shrink-0">
                      {(staff.username || staff.email || 'S')[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-black text-slate-900 truncate">
                          {staff.username || 'Staff Member'}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tabular-nums ${
                            savedEnabledCount > 0
                              ? 'bg-[#ECFDF5] border-[#BBF7D0] text-[#16A34A]'
                              : 'bg-amber-50 border-amber-200 text-amber-700'
                          }`}
                        >
                          {savedEnabledCount} / 11 Sections
                        </span>
                        {staff.isBanned && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[8px] font-black uppercase">
                            Banned
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                        {staff.email}
                      </p>
                      <p className="text-[9px] font-mono text-slate-400 truncate">
                        UID: {staff.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(staff)}
                      className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                        isExpanded
                          ? 'bg-[#16A34A] border-[#16A34A] text-white'
                          : 'bg-[#ECFDF5] border-[#BBF7D0] text-[#16A34A] hover:bg-emerald-100'
                      }`}
                    >
                      <span>Access</span>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(savingUserId)}
                      onClick={() => setDemoteConfirmUser(staff)}
                      title="Demote back to regular User"
                      className="p-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <UserMinus size={15} />
                    </button>
                  </div>
                </div>

                {/* Expanded 11-Section Permission Toggles */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-slate-100 bg-slate-50/60"
                    >
                      <div className="p-4 sm:p-5 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                              Section Permissions ({draftEnabledCount} / 11 Selected)
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium">
                              Only toggled-ON sections appear in this staff member's Admin Menu.
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleBulkDraftSet(staff.id!, true)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#16A34A] text-[9px] font-black uppercase text-[#16A34A] cursor-pointer"
                            >
                              Enable All
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBulkDraftSet(staff.id!, false)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-red-300 text-[9px] font-black uppercase text-slate-600 hover:text-red-600 cursor-pointer"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {ADMIN_SECTIONS_CONFIG.map((sec) => {
                            const isEnabled = currentDraft[sec.key] === true;
                            return (
                              <div
                                key={sec.key}
                                onClick={() => handleTogglePermissionKey(staff.id!, sec.key)}
                                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                                  isEnabled
                                    ? 'bg-white border-[#16A34A]/50 shadow-2xs'
                                    : 'bg-white/70 border-slate-200 opacity-85 hover:opacity-100'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-900 truncate">
                                    {sec.label}
                                  </p>
                                  <p className="text-[10px] font-medium text-slate-500 truncate">
                                    {sec.subtitle}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={isEnabled}
                                  aria-label={`Toggle ${sec.label}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePermissionKey(staff.id!, sec.key);
                                  }}
                                  className={`w-11 h-6 rounded-full p-1 transition-colors shrink-0 flex items-center cursor-pointer ${
                                    isEnabled ? 'bg-[#16A34A]' : 'bg-slate-300'
                                  }`}
                                >
                                  <span
                                    className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform ${
                                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Live Sync Status Footer */}
                        <div className="pt-2 flex items-center justify-between gap-3 flex-wrap border-t border-slate-200/80">
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider ${
                              isBusy
                                ? 'text-slate-500'
                                : dirty
                                ? 'text-amber-600'
                                : 'text-[#16A34A]'
                            }`}
                          >
                            {isBusy
                              ? '• Saving to Staff Account...'
                              : dirty
                              ? '• Unsaved Changes'
                              : '✓ Live Synced to Staff Account'}
                          </span>
                          <div className="flex items-center gap-2 ml-auto">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSaveStaffPermissions(staff)}
                              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                                dirty
                                  ? 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-xs active:scale-95'
                                  : 'bg-emerald-50 border border-[#BBF7D0] text-[#16A34A] hover:bg-emerald-100'
                              } disabled:opacity-50`}
                            >
                              {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                              <span>{dirty ? 'Save Permissions' : 'Sync Now'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Demote Staff Confirmation Modal */}
      <AnimatePresence>
        {demoteConfirmUser && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto mb-4">
                <UserMinus size={24} />
              </div>
              <h3 className="text-base font-black uppercase text-slate-900 mb-1">
                Demote Staff to User?
              </h3>
              <p className="text-xs text-slate-600 font-medium mb-6 leading-relaxed">
                <strong className="text-slate-900">{demoteConfirmUser.username || demoteConfirmUser.email}</strong>{' '}
                will immediately lose all Admin Panel access and all 11 permissions will be reset to OFF.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={Boolean(savingUserId)}
                  onClick={() => setDemoteConfirmUser(null)}
                  className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={Boolean(savingUserId)}
                  onClick={() => handleDemoteStaff(demoteConfirmUser)}
                  className="py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingUserId === demoteConfirmUser.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Yes, Demote</span>
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
