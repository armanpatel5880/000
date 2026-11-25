import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const DEVICE_ID_KEY = 'ap_device_id';
const LEGACY_DEVICE_ID_KEY = 'khel_galli_device_id';

// Generate or retrieve persistent Device ID
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown_device';

  try {
    let id = localStorage.getItem(DEVICE_ID_KEY) || localStorage.getItem(LEGACY_DEVICE_ID_KEY);
    if (!id) {
      id = 'ap_dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    // Sync both keys so legacy code also stays aligned
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'temp_device_' + Date.now();
  }
}

// Generate deterministic hardware & browser fingerprint hash
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'unknown_fp';

  try {
    const screenPart = `${window.screen.width}x${window.screen.height}_${window.screen.colorDepth}`;
    const cleanUA = (navigator.userAgent || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 36);
    const lang = navigator.language || 'en';
    const cores = navigator.hardwareConcurrency || 4;
    return `${screenPart}_${cleanUA}_${lang}_${cores}`;
  } catch {
    return 'fallback_fp';
  }
}

// User-friendly device model & browser info
export function getDeviceInfo(): string {
  if (typeof window === 'undefined') return 'Unknown Device';

  const ua = navigator.userAgent || '';
  let os = 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/windows/i.test(ua)) os = 'Windows PC';
  else if (/mac/i.test(ua)) os = 'Mac';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  return `${os} (${browser})`;
}

export function extractUserIgn(uData: any): string {
  if (!uData) return '';
  if (typeof uData.ign === 'string' && uData.ign.trim()) return uData.ign.trim();
  if (uData.gameIGNs && typeof uData.gameIGNs === 'object') {
    if (typeof uData.gameIGNs.freefire === 'string' && uData.gameIGNs.freefire.trim()) {
      return uData.gameIGNs.freefire.trim();
    }
    const firstIgn = Object.values(uData.gameIGNs).find(
      (v) => typeof v === 'string' && v.trim().length > 0
    ) as string | undefined;
    if (firstIgn) return firstIgn.trim();
  }
  const alt = uData.freefireIGN || uData.bgmiIGN || uData.codmIGN || '';
  return typeof alt === 'string' ? alt.trim() : '';
}

export function extractUserGameUid(uData: any): string {
  if (!uData) return '';
  if (typeof uData.gameUid === 'string' && uData.gameUid.trim()) return uData.gameUid.trim();
  if (uData.gameUIDs && typeof uData.gameUIDs === 'object') {
    if (typeof uData.gameUIDs.freefire === 'string' && uData.gameUIDs.freefire.trim()) {
      return uData.gameUIDs.freefire.trim();
    }
    const firstUid = Object.values(uData.gameUIDs).find(
      (v) => typeof v === 'string' && v.trim().length > 0
    ) as string | undefined;
    if (firstUid) return firstUid.trim();
  }
  const alt = uData.freefireUID || uData.bgmiUID || uData.codmUID || '';
  return typeof alt === 'string' ? alt.trim() : '';
}

export async function fetchRegistrationIgnFallback(userId: string): Promise<string> {
  if (!userId || !auth.currentUser) return '';
  try {
    const regSnap = await getDocs(
      query(collection(db, 'registrations'), where('userId', '==', userId), limit(5))
    );
    for (const d of regSnap.docs) {
      const regIgn = d.data()?.ign;
      if (typeof regIgn === 'string' && regIgn.trim()) {
        return regIgn.trim();
      }
    }
  } catch {
    // ignore permission/network errors on fallback
  }
  return '';
}

export interface DeviceBanStatus {
  isBlacklisted: boolean;
  reason?: string;
  bannedAt?: any;
  bannedUserId?: string;
  bannedUserEmail?: string;
  bannedUsername?: string;
  bannedUserIgn?: string;
}

export async function resolveBanDetails(data: any): Promise<DeviceBanStatus> {
  let bannedUsername = data.bannedUsername || '';
  let bannedUserIgn = data.bannedUserIgn || '';
  let bannedUserEmail = data.bannedUserEmail || '';

  if (data.bannedUserId && (!bannedUsername || !bannedUserIgn || !bannedUserEmail)) {
    try {
      const userSnap = await getDoc(doc(db, 'users', data.bannedUserId));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        bannedUsername = bannedUsername || uData.username || '';
        bannedUserEmail = bannedUserEmail || uData.email || '';
        bannedUserIgn = bannedUserIgn || extractUserIgn(uData);
      }
    } catch {
      // ignore fallback fetch error
    }

    if (!bannedUserIgn) {
      bannedUserIgn = await fetchRegistrationIgnFallback(data.bannedUserId);
    }
  }

  return {
    isBlacklisted: true,
    reason: data.reason || 'This device has been permanently blacklisted for Free Fire hack / FairPlay violation.',
    bannedAt: data.bannedAt,
    bannedUserId: data.bannedUserId,
    bannedUserEmail,
    bannedUsername,
    bannedUserIgn
  };
}

// Check if current device is present in Firestore blacklistedDevices
export async function checkDeviceBan(): Promise<DeviceBanStatus> {
  const deviceId = getDeviceId();
  const fingerprint = getDeviceFingerprint();

  try {
    // 1. Check direct doc lookup by deviceId
    if (deviceId && deviceId !== 'unknown_device') {
      const docRef = doc(db, 'blacklistedDevices', deviceId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.isActive !== false) {
          return await resolveBanDetails(data);
        }
      }
    }

    // 2. Secondary check by device fingerprint (prevents evading by clearing local storage)
    if (fingerprint && fingerprint !== 'unknown_fp' && fingerprint !== 'fallback_fp') {
      const qFp = query(
        collection(db, 'blacklistedDevices'),
        where('deviceFingerprint', '==', fingerprint),
        where('isActive', '!=', false)
      );
      const fpSnap = await getDocs(qFp);
      if (!fpSnap.empty) {
        const data = fpSnap.docs[0].data();
        // Re-lock the deviceId back into localStorage so it cannot be cleared
        if (data.deviceId) {
          localStorage.setItem(DEVICE_ID_KEY, data.deviceId);
        }
        return await resolveBanDetails(data);
      }
    }
  } catch (err) {
    console.warn('Device blacklist verification notice:', err);
  }

  return { isBlacklisted: false };
}
