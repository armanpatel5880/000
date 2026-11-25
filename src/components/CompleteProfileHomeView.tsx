import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  User as UserIcon,
  Phone,
  Gamepad2,
  Hash,
  Mail,
  Ticket,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { User } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ProfileCompletionStatus } from '../utils/profileCompletion';
import { extractUserGameUid, extractUserIgn } from '../utils/deviceHelper';
import { isFullAdmin } from '../utils/adminPermissions';
import SafeImage, { APP_LOGO_SQUARE } from './SafeImage';

interface CompleteProfileHomeViewProps {
  user: User;
  status: ProfileCompletionStatus;
  onAdminSkip?: () => void;
  onLogout?: () => void;
}

type GameKey = 'freefire' | 'bgmi' | 'codm';

const GAME_OPTIONS: { key: GameKey; label: string; ignHint: string; uidHint: string }[] = [
  { key: 'freefire', label: 'Free Fire', ignHint: 'e.g. AP_DRAGON_FF', uidHint: 'e.g. 2481920341' },
  { key: 'bgmi', label: 'BGMI', ignHint: 'e.g. AP_SNIPER', uidHint: 'e.g. 5123456789' },
  { key: 'codm', label: 'COD Mobile', ignHint: 'e.g. AP_GHOST', uidHint: 'e.g. 6849201938' }
];

export default function CompleteProfileHomeView({
  user,
  status,
  onAdminSkip,
  onLogout
}: CompleteProfileHomeViewProps) {
  const initialGame: GameKey =
    user.primaryGame === 'bgmi' || user.primaryGame === 'codm' ? user.primaryGame : 'freefire';

  const existingIsPlaceholder = /^Gamer_[a-zA-Z0-9]+$/i.test(String(user.username || '').trim());

  const [selectedGame, setSelectedGame] = useState<GameKey>(initialGame);
  const [username, setUsername] = useState(existingIsPlaceholder ? '' : (user.username || ''));
  const [phone, setPhone] = useState(String(user.phone || '').replace(/\D/g, '').slice(0, 10));

  const initialPrimaryIgn =
    user.gameIGNs?.[initialGame] || extractUserIgn(user) || '';
  const initialPrimaryUid =
    user.gameUIDs?.[initialGame] || extractUserGameUid(user) || '';

  const [primaryIgn, setPrimaryIgn] = useState(initialPrimaryIgn);
  const [primaryUid, setPrimaryUid] = useState(initialPrimaryUid);

  const [extraIGNs, setExtraIGNs] = useState<Record<GameKey, string>>({
    freefire: user.gameIGNs?.freefire || user.ign || '',
    bgmi: user.gameIGNs?.bgmi || '',
    codm: user.gameIGNs?.codm || ''
  });
  const [extraUIDs, setExtraUIDs] = useState<Record<GameKey, string>>({
    freefire: user.gameUIDs?.freefire || user.gameUid || '',
    bgmi: user.gameUIDs?.bgmi || '',
    codm: user.gameUIDs?.codm || ''
  });

  const [showOtherGames, setShowOtherGames] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(!status.needsConsent);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const activeGameMeta = GAME_OPTIONS.find((g) => g.key === selectedGame) || GAME_OPTIONS[0];
  const otherGames = GAME_OPTIONS.filter((g) => g.key !== selectedGame);
  const isAdminUser = isFullAdmin(user, auth.currentUser?.email, auth.currentUser?.uid);

  const missingCount = [
    status.needsUsername,
    status.needsPhone,
    status.needsIgn,
    status.needsGameUid
  ].filter(Boolean).length;

  const handleGameSelect = (nextGame: GameKey) => {
    setSelectedGame(nextGame);
    if (!primaryIgn.trim() && extraIGNs[nextGame]) {
      setPrimaryIgn(extraIGNs[nextGame]);
    }
    if (!primaryUid.trim() && extraUIDs[nextGame]) {
      setPrimaryUid(extraUIDs[nextGame]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const uid = auth.currentUser?.uid || user.id;
    if (!uid) return;

    const nextErrors: Record<string, string> = {};
    const cleanUsername = username.trim().slice(0, 50);
    const cleanPhone = phone.replace(/\D/g, '').slice(0, 10);
    const cleanPrimaryIgn = primaryIgn.trim().slice(0, 50);
    const cleanPrimaryUid = primaryUid.trim().slice(0, 50);
    const cleanReferral = referralInput.trim().toUpperCase().slice(0, 32);

    if (status.needsUsername) {
      if (cleanUsername.length < 3) {
        nextErrors.username = 'Username must be at least 3 characters';
      } else if (/^Gamer_[a-zA-Z0-9]+$/i.test(cleanUsername)) {
        nextErrors.username = 'Please choose your own custom username';
      }
    }

    if (status.needsPhone) {
      if (cleanPhone.length !== 10) {
        nextErrors.phone = 'Enter a valid 10-digit mobile number';
      }
    }

    if (status.needsIgn && cleanPrimaryIgn.length < 2) {
      nextErrors.ign = `Enter your ${activeGameMeta.label} in-game name`;
    }

    if (status.needsGameUid && cleanPrimaryUid.length < 3) {
      nextErrors.gameUid = `Enter your ${activeGameMeta.label} UID`;
    }

    if (status.canAddReferral && cleanReferral) {
      const ownCode = (user.referralCode || '').trim().toUpperCase();
      if (ownCode && cleanReferral === ownCode) {
        nextErrors.referral = 'You cannot use your own referral code';
      } else if (cleanReferral.toLowerCase() === cleanUsername.toLowerCase()) {
        nextErrors.referral = 'You cannot refer yourself';
      }
    }

    if (status.needsConsent && !consentAgreed) {
      nextErrors.consent = 'Please confirm age (18+) and agree to Privacy & Fair Play rules';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const mergedIGNs: Record<string, string> = {
        ...(user.gameIGNs || {}),
        freefire: extraIGNs.freefire.trim().slice(0, 50),
        bgmi: extraIGNs.bgmi.trim().slice(0, 50),
        codm: extraIGNs.codm.trim().slice(0, 50)
      };
      const mergedUIDs: Record<string, string> = {
        ...(user.gameUIDs || {}),
        freefire: extraUIDs.freefire.trim().slice(0, 50),
        bgmi: extraUIDs.bgmi.trim().slice(0, 50),
        codm: extraUIDs.codm.trim().slice(0, 50)
      };

      if (cleanPrimaryIgn) {
        mergedIGNs[selectedGame] = cleanPrimaryIgn;
      }
      if (cleanPrimaryUid) {
        mergedUIDs[selectedGame] = cleanPrimaryUid;
      }

      const resolvedMainIgn =
        mergedIGNs[selectedGame] ||
        mergedIGNs.freefire ||
        extractUserIgn(user) ||
        cleanPrimaryIgn;
      const resolvedMainUid =
        mergedUIDs[selectedGame] ||
        mergedUIDs.freefire ||
        extractUserGameUid(user) ||
        cleanPrimaryUid;

      const updatePayload: Record<string, any> = {
        primaryGame: selectedGame,
        authProvider: status.isGoogleUser ? 'google' : (user.authProvider || 'password'),
        profileCompleted: true,
        ign: resolvedMainIgn.slice(0, 50),
        gameUid: resolvedMainUid.slice(0, 50),
        gameIGNs: mergedIGNs,
        gameUIDs: mergedUIDs,
        lastActive: serverTimestamp()
      };

      if (status.needsUsername) {
        updatePayload.username = cleanUsername;
      }
      if (status.needsPhone) {
        updatePayload.phone = cleanPhone;
      }
      if (status.canAddReferral && cleanReferral && !user.referredBy && !user.referralClaimed) {
        updatePayload.referredBy = cleanReferral;
      }

      await updateDoc(doc(db, 'users', uid), updatePayload);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      setErrors({
        general: err?.message || 'Unable to save details right now. Please try again.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2FBF6] pb-28 px-4 pt-5 text-slate-900">
      <div className="max-w-lg mx-auto">
        {/* Top Brand + Account Action Row */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white border border-emerald-200 p-1 shadow-xs shrink-0 flex items-center justify-center">
              <SafeImage src={APP_LOGO_SQUARE} alt="AP Tournament" className="w-full h-full rounded-xl" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">
                {status.isGoogleUser ? 'Complete Player Profile' : 'Finish Remaining Details'}
              </h1>
              <p className="text-xs text-slate-600 truncate">
                {status.isGoogleUser
                  ? 'Google Sign-In · Add your gaming details to continue'
                  : `${missingCount} detail${missingCount === 1 ? '' : 's'} remaining to unlock matches`}
              </p>
            </div>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[44px] px-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              title="Switch Account"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          )}
        </div>

        {/* Main Single-Elevation Form Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs"
        >
          {/* Verified Account Summary (Unboxed clean metadata strip) */}
          <div className="pb-4 mb-5 border-b border-slate-100 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700 min-w-0">
              <Mail size={14} className="text-[#16A34A] shrink-0" />
              <span className="truncate">{user.email || auth.currentUser?.email || 'Signed in player'}</span>
            </div>

            {(!status.needsUsername || !status.needsPhone || !status.needsIgn) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className="text-[#16A34A] font-semibold">Saved</span>
                {!status.needsUsername && user.username && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Username: {user.username}</span>
                  </>
                )}
                {!status.needsPhone && user.phone && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Phone: {user.phone}</span>
                  </>
                )}
                {!status.needsIgn && extractUserIgn(user) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>IGN: {extractUserIgn(user)}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {errors.general && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errors.general}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username (Google users or incomplete accounts) */}
            {status.needsUsername && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <UserIcon size={14} className="text-[#16A34A]" />
                  <span>Username</span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose your tournament username"
                  className={`w-full min-h-[44px] bg-slate-50 focus:bg-white rounded-xl px-4 text-sm font-medium text-slate-900 border transition-colors focus:outline-hidden ${
                    errors.username ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                  }`}
                />
                {errors.username && (
                  <p className="text-xs text-red-600 font-medium">{errors.username}</p>
                )}
              </div>
            )}

            {/* Mobile Number (Google users or incomplete accounts) */}
            {status.needsPhone && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Phone size={14} className="text-[#16A34A]" />
                  <span>Mobile Number</span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-semibold text-slate-500 select-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Enter 10-digit mobile number"
                    className={`w-full min-h-[44px] bg-slate-50 focus:bg-white rounded-xl pl-12 pr-4 text-sm font-medium tabular-nums text-slate-900 border transition-colors focus:outline-hidden ${
                      errors.phone ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-xs text-red-600 font-medium">{errors.phone}</p>
                )}
              </div>
            )}

            {/* Game Selector + In-Game Name (IGN) + In-Game UID */}
            {(status.needsIgn || status.needsGameUid) && (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Gamepad2 size={14} className="text-[#16A34A]" />
                    <span>Primary Game</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    {GAME_OPTIONS.map((game) => (
                      <button
                        key={game.key}
                        type="button"
                        onClick={() => handleGameSelect(game.key)}
                        className={`min-h-[40px] px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          selectedGame === game.key
                            ? 'bg-[#16A34A] text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {game.label}
                      </button>
                    ))}
                  </div>
                </div>

                {status.needsIgn && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Gamepad2 size={14} className="text-[#16A34A]" />
                      <span>{activeGameMeta.label} In-Game Name (IGN)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={50}
                      value={primaryIgn}
                      onChange={(e) => setPrimaryIgn(e.target.value)}
                      placeholder={activeGameMeta.ignHint}
                      className={`w-full min-h-[44px] bg-slate-50 focus:bg-white rounded-xl px-4 text-sm font-medium text-slate-900 border transition-colors focus:outline-hidden ${
                        errors.ign ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                      }`}
                    />
                    {errors.ign && (
                      <p className="text-xs text-red-600 font-medium">{errors.ign}</p>
                    )}
                  </div>
                )}

                {status.needsGameUid && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Hash size={14} className="text-[#16A34A]" />
                      <span>{activeGameMeta.label} In-Game UID</span>
                    </label>
                    <input
                      type="text"
                      maxLength={50}
                      value={primaryUid}
                      onChange={(e) => setPrimaryUid(e.target.value)}
                      placeholder={activeGameMeta.uidHint}
                      className={`w-full min-h-[44px] bg-slate-50 focus:bg-white rounded-xl px-4 text-sm font-mono font-medium tabular-nums text-slate-900 border transition-colors focus:outline-hidden ${
                        errors.gameUid ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                      }`}
                    />
                    {errors.gameUid && (
                      <p className="text-xs text-red-600 font-medium">{errors.gameUid}</p>
                    )}
                  </div>
                )}

                {/* Optional Extra Games Drawer */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowOtherGames((prev) => !prev)}
                    className="min-h-[40px] text-xs font-semibold text-[#16A34A] hover:text-[#15803D] flex items-center gap-1.5 cursor-pointer"
                  >
                    {showOtherGames ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    <span>Add other games IGN & UID (Optional)</span>
                  </button>

                  {showOtherGames && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                      {otherGames.map((game) => (
                        <div key={game.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                              {game.label} IGN
                            </label>
                            <input
                              type="text"
                              maxLength={50}
                              value={extraIGNs[game.key]}
                              onChange={(e) =>
                                setExtraIGNs((prev) => ({ ...prev, [game.key]: e.target.value }))
                              }
                              placeholder={game.ignHint}
                              className="w-full min-h-[44px] bg-slate-50 focus:bg-white rounded-xl px-3.5 text-xs font-medium text-slate-900 border border-slate-200 focus:border-[#16A34A] focus:outline-hidden"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1 block">
                              {game.label} UID
                            </label>
                            <input
                              type="text"
                              maxLength={50}
                              value={extraUIDs[game.key]}
                              onChange={(e) =>
                                setExtraUIDs((prev) => ({ ...prev, [game.key]: e.target.value }))
                              }
                              placeholder={game.uidHint}
                              className="w-full min-h-[44px] bg-slate-50 focus:bg-white rounded-xl px-3.5 text-xs font-mono font-medium text-slate-900 border border-slate-200 focus:border-[#16A34A] focus:outline-hidden"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Optional Referral Code for Google Users */}
            {status.canAddReferral && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Ticket size={14} className="text-[#16A34A]" />
                    <span>Referral Code (Optional)</span>
                  </label>
                  <span className="text-[11px] font-medium text-[#16A34A]">Bonus Reward</span>
                </div>
                <input
                  type="text"
                  maxLength={32}
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  placeholder="e.g. AP8428"
                  className={`w-full min-h-[44px] bg-slate-50 focus:bg-white rounded-xl px-4 text-sm font-mono font-semibold uppercase tracking-wider text-slate-900 border transition-colors focus:outline-hidden ${
                    errors.referral ? 'border-red-400' : 'border-slate-200 focus:border-[#16A34A]'
                  }`}
                />
                {errors.referral && (
                  <p className="text-xs text-red-600 font-medium">{errors.referral}</p>
                )}
              </div>
            )}

            {/* Consent Checkbox for Google Sign-In Users */}
            {status.needsConsent && (
              <div className="pt-2 space-y-1">
                <label className="flex items-start gap-2.5 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={consentAgreed}
                    onChange={(e) => setConsentAgreed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#16A34A] focus:ring-[#16A34A] cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    I am 18+ (or have parental consent) and agree to Fair Play rules, Terms of Service, and DPDP Privacy Policy.
                  </span>
                </label>
                {errors.consent && (
                  <p className="text-xs text-red-600 font-medium">{errors.consent}</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[48px] bg-[#16A34A] hover:bg-[#15803D] text-white font-bold text-sm rounded-xl shadow-xs flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer mt-2"
            >
              {saving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Saving Details...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Save & Continue</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {isAdminUser && onAdminSkip && (
            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onAdminSkip}
                className="min-h-[40px] px-3 text-xs font-semibold text-slate-500 hover:text-[#16A34A] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck size={14} />
                <span>Skip for now (Admin)</span>
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
