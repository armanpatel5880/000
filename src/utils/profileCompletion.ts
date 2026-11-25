import { User as FirebaseUser } from 'firebase/auth';
import { User } from '../types';
import { extractUserGameUid, extractUserIgn } from './deviceHelper';

export interface ProfileCompletionStatus {
  isGoogleUser: boolean;
  needsCompletion: boolean;
  needsUsername: boolean;
  needsPhone: boolean;
  needsIgn: boolean;
  needsGameUid: boolean;
  needsConsent: boolean;
  canAddReferral: boolean;
  hasValidUsername: boolean;
  hasValidPhone: boolean;
  hasIgn: boolean;
  hasGameUid: boolean;
}

export function isGoogleAuthAccount(user?: User | null, firebaseUser?: FirebaseUser | null): boolean {
  if (user?.authProvider === 'google') return true;
  if (firebaseUser?.providerData?.some((p) => p.providerId === 'google.com')) return true;
  return false;
}

export function getMissingProfileDetails(
  user?: User | null,
  firebaseUser?: FirebaseUser | null
): ProfileCompletionStatus {
  const isGoogleUser = isGoogleAuthAccount(user, firebaseUser);
  const rawUsername = String(user?.username || '').trim();
  const isPlaceholderUsername = !rawUsername || /^Gamer_[a-zA-Z0-9]+$/i.test(rawUsername);
  const hasValidUsername = rawUsername.length >= 2 && !isPlaceholderUsername;

  const rawPhone = String(user?.phone || '').replace(/\D/g, '');
  const hasValidPhone = rawPhone.length >= 10;

  const hasIgn = Boolean(extractUserIgn(user));
  const hasGameUid = Boolean(extractUserGameUid(user));

  // Google users who have not yet completed onboarding confirm/set their gamer username, phone, IGN & UID.
  const isUnfinishedGoogleOnboarding = isGoogleUser && user?.profileCompleted !== true;

  const needsUsername = isUnfinishedGoogleOnboarding ? true : !hasValidUsername;
  const needsPhone = !hasValidPhone;
  const needsIgn = !hasIgn;
  const needsGameUid = !hasGameUid;
  const needsConsent = isUnfinishedGoogleOnboarding;
  const canAddReferral = isUnfinishedGoogleOnboarding && !user?.referredBy && !user?.referralClaimed;

  const needsCompletion = needsUsername || needsPhone || needsIgn || needsGameUid;

  return {
    isGoogleUser,
    needsCompletion,
    needsUsername,
    needsPhone,
    needsIgn,
    needsGameUid,
    needsConsent,
    canAddReferral,
    hasValidUsername,
    hasValidPhone,
    hasIgn,
    hasGameUid,
  };
}
