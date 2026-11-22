import { AdminSectionKey, StaffPermissions, User, UserRole } from '../types';

export const PRIMARY_ADMIN_EMAIL = 'armanpatel8428@gmail.com';

export const ADMIN_EMAILS = [
  PRIMARY_ADMIN_EMAIL
];

export const ADMIN_SECTION_KEYS: AdminSectionKey[] = [
  'dashboard',
  'withdrawals',
  'notifications',
  'usersAndBlacklist',
  'matches',
  'transactions',
  'gameRules',
  'gameModes',
  'banners',
  'referralAndSupport',
  'paymentGateways'
];

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  dashboard: false,
  withdrawals: false,
  notifications: false,
  usersAndBlacklist: false,
  matches: false,
  transactions: false,
  gameRules: false,
  gameModes: false,
  banners: false,
  referralAndSupport: false,
  paymentGateways: false
};

export interface AdminSectionMeta {
  key: AdminSectionKey;
  label: string;
  subtitle: string;
}

export const ADMIN_SECTIONS_CONFIG: AdminSectionMeta[] = [
  { key: 'dashboard', label: 'Dashboard', subtitle: 'Stats & Overview' },
  { key: 'withdrawals', label: 'Withdrawals', subtitle: 'Payout Requests' },
  { key: 'notifications', label: 'Notifications', subtitle: 'Push & Broadcast Alerts' },
  { key: 'usersAndBlacklist', label: 'Users & Blacklist', subtitle: 'Players & Blocked Devices' },
  { key: 'matches', label: 'Matches', subtitle: 'Tournaments' },
  { key: 'transactions', label: 'Transactions', subtitle: 'Deposits, Wins & History' },
  { key: 'gameRules', label: 'Game Rules', subtitle: 'Match Rules Config' },
  { key: 'gameModes', label: 'Game Modes', subtitle: 'Modes & Categories' },
  { key: 'banners', label: 'Banners', subtitle: 'Home & Offer Banners' },
  { key: 'referralAndSupport', label: 'Referral & Support', subtitle: 'Rewards, Links & Policies' },
  { key: 'paymentGateways', label: 'Payment Gateways', subtitle: 'UPI, Cashfree & Razorpay' }
];

export function normalizeStaffPermissions(raw?: Partial<StaffPermissions> | null): StaffPermissions {
  const normalized: StaffPermissions = { ...DEFAULT_STAFF_PERMISSIONS };
  if (!raw || typeof raw !== 'object') return normalized;
  for (const key of ADMIN_SECTION_KEYS) {
    normalized[key] = raw[key] === true;
  }
  return normalized;
}

export function isFullAdmin(
  user?: Partial<User> | null,
  authEmail?: string | null,
  _authUid?: string | null
): boolean {
  const email = (authEmail || user?.email || '').trim().toLowerCase();
  if (!email) return false;
  return email === PRIMARY_ADMIN_EMAIL;
}

export function resolveUserRole(
  user?: Partial<User> | null,
  authEmail?: string | null,
  authUid?: string | null
): UserRole {
  if (isFullAdmin(user, authEmail, authUid)) return 'admin';
  if (user?.role === 'staff' || user?.isStaff === true) return 'staff';
  return 'user';
}

export function isStaffUser(
  user?: Partial<User> | null,
  authEmail?: string | null,
  authUid?: string | null
): boolean {
  if (isFullAdmin(user, authEmail, authUid)) return false;
  if (user?.isBanned === true) return false;
  return user?.role === 'staff' || user?.isStaff === true;
}

export function hasSectionPermission(
  user: Partial<User> | null | undefined,
  section: AdminSectionKey,
  authEmail?: string | null,
  authUid?: string | null
): boolean {
  if (isFullAdmin(user, authEmail, authUid)) return true;
  if (!isStaffUser(user, authEmail, authUid)) return false;
  return user?.staffPermissions?.[section] === true;
}

export function getAllowedAdminSections(
  user?: Partial<User> | null,
  authEmail?: string | null,
  authUid?: string | null
): AdminSectionKey[] {
  if (isFullAdmin(user, authEmail, authUid)) {
    return [...ADMIN_SECTION_KEYS];
  }
  if (!isStaffUser(user, authEmail, authUid)) {
    return [];
  }
  return ADMIN_SECTION_KEYS.filter((key) => user?.staffPermissions?.[key] === true);
}

export function hasAdminPanelAccess(
  user?: Partial<User> | null,
  authEmail?: string | null,
  authUid?: string | null
): boolean {
  if (isFullAdmin(user, authEmail, authUid)) return true;
  return isStaffUser(user, authEmail, authUid) && getAllowedAdminSections(user, authEmail, authUid).length > 0;
}

export function countEnabledStaffPermissions(perms?: Partial<StaffPermissions> | null): number {
  if (!perms) return 0;
  return ADMIN_SECTION_KEYS.filter((key) => perms[key] === true).length;
}
