import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { 
  ChevronLeft, 
  Loader2, 
  Trophy, 
  Users, 
  X, 
  ShieldCheck, 
  Calendar, 
  AlertCircle, 
  Search, 
  CheckCircle2, 
  Info,
  Sparkles,
  Swords,
  Lock,
  Key,
  Flame,
  Clock,
  Edit2,
  Check
} from 'lucide-react';
import { Page, Tournament, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, getDoc, runTransaction, updateDoc } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';
import { getMatchRemainingTime } from '../utils/matchAlertHelper';

interface MatchDetailsProps {
  user: User | null;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
}

// Reusable Emerald Coin Component for ₹ Token / Coins
function GoldenCoinIcon({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-[#16A34A] flex items-center justify-center shrink-0 inline-flex shadow-2xs"
    >
      <span className="text-white font-black text-[9px] leading-none select-none">
        ₹
      </span>
    </div>
  );
}

// Format tournament date/time string to "DD/MM/YYYY at hh:mm A"
function formatMatchSchedule(timeStr?: string) {
  if (!timeStr) return '21/08/2026 at 08:40 AM';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) {
      return timeStr;
    }
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = hours.toString().padStart(2, '0');
    return `${day}/${month}/${year} at ${strHours}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

// Default Fallback Esports artwork based on Section/Mode
function getDefaultEsportsImage(section?: string, mode?: string) {
  const s = (section || '').toLowerCase();
  const m = (mode || '').toLowerCase();

  if (s.includes('clash') || m.includes('cs')) {
    return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop';
  }
  if (s.includes('lone') || m.includes('wolf')) {
    return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop';
  }
  return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop';
}

export default function MatchDetails({ user, onPageChange, joinedMatchIds }: MatchDetailsProps) {
  const { id } = useParams<{ id: string }>();
  const matchId = id || '';

  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllJoiningsModal, setShowAllJoiningsModal] = useState(false);
  const [joiningsSearch, setJoiningsSearch] = useState('');
  const [showRoomDetailsModal, setShowRoomDetailsModal] = useState(false);
  const [sectionRules, setSectionRules] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
  const [editingIgnValue, setEditingIgnValue] = useState('');
  const [savingIgn, setSavingIgn] = useState(false);
  const [ignEditError, setIgnEditError] = useState<string | null>(null);
  const [ignEditSuccess, setIgnEditSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!showAllJoiningsModal) {
      setEditingSlotKey(null);
      setEditingIgnValue('');
      setIgnEditError(null);
      setIgnEditSuccess(null);
      return;
    }
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, [showAllJoiningsModal]);

  useEffect(() => {
    if (!matchData) return;
    if (matchData.rules && Array.isArray(matchData.rules) && matchData.rules.length > 0) {
      setSectionRules(matchData.rules);
      return;
    }
    if (matchData.rules && typeof matchData.rules === 'string' && matchData.rules.trim().length > 0) {
      setSectionRules(matchData.rules.split('\n').filter(r => r.trim().length > 0));
      return;
    }

    const fetchRules = async () => {
      try {
        const sec = (matchData.section || matchData.mode || 'Battle Royale').toLowerCase().trim();
        const normKey = sec.replace(/[^a-z0-9]+/g, '_');
        let snap = await getDoc(doc(db, 'gameRules', normKey));
        if (!snap.exists() && matchData.modeId) {
          snap = await getDoc(doc(db, 'gameRules', matchData.modeId));
        }
        if (!snap.exists()) {
          if (sec.includes('clash') || sec.includes('4v4')) snap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
          else if (sec.includes('lone') || sec.includes('wolf') || sec.includes('1v1')) snap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
          else if (sec.includes('sniper')) snap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
          else if (sec.includes('custom')) snap = await getDoc(doc(db, 'gameRules', 'custom_room'));
          else snap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
        }

        if (snap.exists() && snap.data().rules && snap.data().rules.length > 0) {
          setSectionRules(snap.data().rules);
        }
      } catch (err) {
        console.warn('Failed to load dynamic rules:', err);
      }
    };
    fetchRules();
  }, [matchData?.id, matchData?.section, matchData?.mode, matchData?.modeId, matchData?.rules]);

  useEffect(() => {
    if (!matchId) {
      setError('Match ID not found');
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'matches', matchId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Tournament;
          setMatchData(data);
          setError(null);
        } else {
          setError('Match does not exist or has been removed');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching match details:', err);
        handleFirestoreError(err, OperationType.GET, `matches/${matchId}`);
        setError('Failed to load match details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-slate-900">
        <Loader2 className="w-10 h-10 text-[#16A34A] animate-spin mb-4" />
        <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Loading Contest Details...</p>
      </div>
    );
  }

  if (error || !matchData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-slate-900 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600 mb-4">
          <AlertCircle size={28} />
        </div>
        <h2 className="text-lg font-black uppercase tracking-tight text-slate-900 mb-2">Contest Not Found</h2>
        <p className="text-xs text-slate-500 mb-6 max-w-xs">{error || 'This tournament is not available.'}</p>
        <button
          onClick={() => onPageChange(Page.TOURNAMENTS)}
          className="px-6 py-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-xs transition-all cursor-pointer"
        >
          Back to Tournaments
        </button>
      </div>
    );
  }

  // Calculate Match Info Values
  const currentUid = user?.id || auth.currentUser?.uid || '';
  const isJoined = joinedMatchIds.includes(matchId) || (matchData.players && currentUid && matchData.players.some(p => p.userId === currentUid));
  const isOngoing = matchData.status === 'ongoing';
  const isCompleted = matchData.status === 'completed';

  const matchStartTimestamp = matchData.time ? new Date(matchData.time).getTime() : NaN;
  const hasValidMatchTime = !isNaN(matchStartTimestamp);
  const remainingToStartMs = hasValidMatchTime ? matchStartTimestamp - nowMs : Infinity;
  const isBefore10MinCutoff = !hasValidMatchTime || remainingToStartMs > 10 * 60 * 1000;
  const isMatchEditableStatus = !isCompleted && !isOngoing && (matchData.status as string) !== 'cancelled';
  const canEditIgn = isMatchEditableStatus && isBefore10MinCutoff;

  const getGameKey = (gameId?: string, section?: string) => {
    const g = (gameId || '').toLowerCase();
    const s = (section || '').toLowerCase();
    if (g.includes('freefire') || s.includes('battle royale') || s.includes('clash squad') || s.includes('lone wolf')) {
      return 'freefire';
    }
    if (g.includes('cod') || g.includes('call of duty')) return 'codm';
    if (g.includes('bgmi') || g.includes('pubg')) return 'bgmi';
    return g || 'freefire';
  };

  const handleStartEditIgn = (player: { ign?: string; slot?: number }, slotKey: string) => {
    setIgnEditError(null);
    setIgnEditSuccess(null);
    if (!canEditIgn) {
      setIgnEditError('In-Game Name can only be changed up to 10 minutes before match start.');
      return;
    }
    setEditingSlotKey(slotKey);
    setEditingIgnValue(player.ign || '');
  };

  const handleSaveIgn = async (targetPlayer: { userId?: string; ign?: string; slot?: number }) => {
    if (savingIgn || !currentUid || !matchId) return;
    const trimmed = editingIgnValue.trim();
    if (!trimmed) {
      setIgnEditError('Please enter a valid In-Game Name.');
      return;
    }
    if (trimmed.length > 50) {
      setIgnEditError('In-Game Name must be 50 characters or less.');
      return;
    }

    const freshStartMs = matchData.time ? new Date(matchData.time).getTime() : NaN;
    if (!isNaN(freshStartMs) && freshStartMs - Date.now() <= 10 * 60 * 1000) {
      setIgnEditError('Time limit passed: IGN can only be changed up to 10 minutes before match start.');
      setEditingSlotKey(null);
      setNowMs(Date.now());
      return;
    }

    setSavingIgn(true);
    setIgnEditError(null);
    setIgnEditSuccess(null);

    try {
      let editedPrimarySlot = false;
      const matchRef = doc(db, 'matches', matchId);
      const regRef = doc(db, 'registrations', `${matchId}_${currentUid}`);

      await runTransaction(db, async (transaction) => {
        const [matchSnap, regSnap] = await Promise.all([
          transaction.get(matchRef),
          transaction.get(regRef)
        ]);

        if (!matchSnap.exists()) {
          throw new Error('Match not found.');
        }

        const liveMatch = matchSnap.data() as Tournament;
        const liveStatus = (liveMatch.status || 'upcoming') as string;
        if (liveStatus === 'completed' || liveStatus === 'ongoing' || liveStatus === 'cancelled') {
          throw new Error('IGN cannot be changed after match has started or completed.');
        }

        const liveStartMs = liveMatch.time ? new Date(liveMatch.time).getTime() : NaN;
        if (!isNaN(liveStartMs) && liveStartMs - Date.now() <= 10 * 60 * 1000) {
          throw new Error('Time limit passed: IGN can only be changed up to 10 minutes before match start.');
        }

        const livePlayers = Array.isArray(liveMatch.players) ? [...liveMatch.players] : [];
        const ownIndices = livePlayers
          .map((p, i) => (p.userId === currentUid ? i : -1))
          .filter((i) => i !== -1);

        const targetIndex = livePlayers.findIndex((p) => {
          if (p.userId !== currentUid) return false;
          if (targetPlayer.slot !== undefined) return p.slot === targetPlayer.slot;
          return (p.ign || '') === (targetPlayer.ign || '');
        });

        if (targetIndex === -1) {
          throw new Error('Your slot entry was not found in this match.');
        }

        const slotOrderIndex = ownIndices.indexOf(targetIndex);
        editedPrimarySlot = slotOrderIndex <= 0;

        const updatedPlayers = livePlayers.map((p, i) =>
          i === targetIndex ? { ...p, ign: trimmed } : p
        );

        transaction.update(matchRef, {
          players: updatedPlayers
        });

        if (regSnap.exists()) {
          const regData = regSnap.data() as any;
          const memberIdx =
            Array.isArray(regData.slots) && targetPlayer.slot !== undefined
              ? regData.slots.indexOf(targetPlayer.slot)
              : slotOrderIndex;
          const resolvedMemberIdx = memberIdx >= 0 ? memberIdx : Math.max(0, slotOrderIndex);

          const regUpdates: Record<string, any> = {};
          if (resolvedMemberIdx === 0) {
            regUpdates.ign = trimmed;
          }
          if (Array.isArray(regData.teamMembers) && regData.teamMembers[resolvedMemberIdx]) {
            regUpdates.teamMembers = regData.teamMembers.map((m: any, idx: number) =>
              idx === resolvedMemberIdx ? { ...m, name: trimmed } : m
            );
          }

          if (Object.keys(regUpdates).length > 0) {
            transaction.update(regRef, regUpdates);
          }
        }
      });

      if (editedPrimarySlot) {
        const gameKey = getGameKey(matchData.gameId, matchData.section);
        updateDoc(doc(db, 'users', currentUid), {
          [`gameIGNs.${gameKey}`]: trimmed,
          ign: trimmed
        }).catch(() => {});
      }

      setEditingSlotKey(null);
      setEditingIgnValue('');
      setIgnEditSuccess('In-Game Name updated successfully!');
      setTimeout(() => setIgnEditSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to update IGN:', err);
      setIgnEditError(err?.message || 'Could not update In-Game Name. Please try again.');
    } finally {
      setSavingIgn(false);
    }
  };

  const totalSlots = matchData.totalSlots || matchData.maxPlayers || 48;
  const players = matchData.players || [];
  const playersCount = matchData.playersCount || players.length;
  const spotsLeft = Math.max(0, totalSlots - playersCount);
  const isFull = spotsLeft <= 0;

  // Match Display ID
  const displayMatchNumber = matchData.displayId 
    ? matchData.displayId.replace(/[^0-9]/g, '') || matchData.displayId
    : (matchData as any).matchNumber 
      ? String((matchData as any).matchNumber)
      : matchId.slice(-6).toUpperCase();

  // Banner image
  const bannerImage = matchData.image || getDefaultEsportsImage(matchData.section, matchData.mode);

  // Title formatting
  const matchTitle = matchData.title || `${(matchData.section || 'BR').toUpperCase()} ${(matchData.mode || 'SOLO').toUpperCase()} BATTLE`;

  // Basic Info Values
  const teamType = matchData.mode ? matchData.mode.charAt(0).toUpperCase() + matchData.mode.slice(1).toLowerCase() : 'Solo';
  const modeName = (matchData.section || 'Battle Royale').toUpperCase();
  const mapName = (matchData.map || 'BERMUDA').toUpperCase();
  const isPaid = (matchData.entryFee || 0) > 0;
  const matchTypeStr = isPaid ? 'Paid' : 'Free';
  const entryFeeStr = isPaid ? matchData.entryFee : 'FREE';
  const scheduleFormatted = formatMatchSchedule(matchData.time);

  // Prize Pool calculations
  const calculateTotalPrizePool = (): number => {
    if (matchData.prizePool && Number(matchData.prizePool) > 0) return Number(matchData.prizePool);
    if (matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0) {
      const total = Object.values(matchData.prizeDistribution).reduce<number>((sum, val) => sum + (Number(val) || 0), 0);
      if (total > 0) return total;
    }
    if (matchData.prize) {
      const parsed = parseInt(String(matchData.prize).replace(/[^0-9]/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 300;
  };

  const totalPrizePool = calculateTotalPrizePool();

  // Prize breakdown items
  const getPrizeList = () => {
    const items: { label: string; amount: number | string }[] = [];
    const isSurvival = matchData.prizeType === 'survival';

    // 1. PER KILL row
    if (isSurvival) {
      items.push({ label: 'PER KILL', amount: '₹0' });
    } else {
      items.push({ label: 'PER KILL', amount: `₹${matchData.perKillAmount || 0}` });
    }

    // 2. Rank Distribution
    if (matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0) {
      const sortedRanks = Object.keys(matchData.prizeDistribution)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedRanks.forEach((rank) => {
        let label = `${rank}TH`;
        if (rank === 1) label = '1ST (BOOYAH)';
        else if (rank === 2) label = '2ND (RUNNER UP)';
        else if (rank === 3) label = '3RD PLACE';
        items.push({
          label,
          amount: `₹${matchData.prizeDistribution![rank]}`
        });
      });
    } else if (matchData.positionPrizeDistribution && Object.keys(matchData.positionPrizeDistribution).length > 0) {
      const sortedRanks = Object.keys(matchData.positionPrizeDistribution)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedRanks.forEach((rank) => {
        let label = `${rank}TH`;
        if (rank === 1) label = '1ST (BOOYAH)';
        else if (rank === 2) label = '2ND (RUNNER UP)';
        else if (rank === 3) label = '3RD PLACE';
        items.push({
          label,
          amount: `₹${matchData.positionPrizeDistribution![rank]}`
        });
      });
    } else if (isSurvival) {
      items.push({ label: '1ST (BOOYAH)', amount: `₹${totalPrizePool}` });
    }

    return items;
  };

  const prizeItems = getPrizeList();

  // About description
  const aboutDescription = matchData.description || 
    `This is a ${teamType} ${matchData.section || 'Battle Royale'} match on ${mapName} where only skilled players can survive till the end. Show your skills and be the last one standing!`;

  // Custom or Default Rules
  const getRulesList = () => {
    if (sectionRules && sectionRules.length > 0) {
      return sectionRules;
    }
    if (matchData.rules) {
      if (Array.isArray(matchData.rules)) return matchData.rules;
      if (typeof matchData.rules === 'string') {
        return matchData.rules.split('\n').filter(r => r.trim().length > 0);
      }
    }
    return [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: The match must be played exclusively on a smartphone or tablet. Emulators are strictly prohibited.',
      'Registration: Enter exact in-game IGN without unsupported special characters.',
      'Fairplay: No teaming, aimbots, or game modifying software.',
      'Match Result Policy: Scores will be verified by the admin team post-match before prize distribution.',
      'Cancellation & Refund Policy: If a match is cancelled by the admin, 100% of the entry fee will be refunded back to your wallet instantly.'
    ];
  };

  const rulesList = getRulesList();

  // Filtered joinings for the modal
  const filteredPlayers = players.filter((p) => {
    if (!joiningsSearch) return true;
    const term = joiningsSearch.toLowerCase();
    return (
      (p.username && p.username.toLowerCase().includes(term)) ||
      (p.ign && p.ign.toLowerCase().includes(term)) ||
      (p.slot && String(p.slot).includes(term))
    );
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-28 max-w-lg mx-auto select-none relative overflow-hidden">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md text-slate-900 shadow-2xs border-b border-slate-200 px-4 py-3.5 flex items-center justify-between">
        <button
          onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
          className="p-2 -ml-1 text-slate-600 hover:text-[#16A34A] transition-colors active:scale-95 cursor-pointer"
          aria-label="Back to Tournaments"
        >
          <ChevronLeft size={22} className="stroke-[2.5]" />
        </button>

        <div className="flex-1 text-center pr-6">
          <h1 className="text-sm sm:text-base font-black tracking-wide uppercase text-slate-900">
            Contest Details <span className="text-[#16A34A]">#{displayMatchNumber}</span>
          </h1>
        </div>

        {isJoined && (matchData.roomId || matchData.roomPassword) && (
          <button
            onClick={() => setShowRoomDetailsModal(true)}
            className="p-2 bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Key size={14} />
          </button>
        )}
      </header>

      {/* Main Scrollable Content */}
      <div className="p-4 space-y-4">
        {/* 15-Minute Imminent Match Alert Banner */}
        {isJoined && (() => {
          const status = getMatchRemainingTime(matchData?.time);
          if (status.is15MinWindow) {
            return (
              <div className="bg-[#ECFDF5] border-2 border-[#16A34A] rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#16A34A] flex items-center justify-center text-white shrink-0">
                    <Flame size={20} className="animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-black text-[#16A34A] uppercase tracking-tight flex items-center gap-1.5">
                      <span>Match Starts in {status.formattedCountdown}</span>
                      <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-ping shrink-0" />
                    </h4>
                    <p className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                      {matchData.roomId ? 'Room ID & Password available below. Enter room now!' : 'Admin is preparing Room credentials.'}
                    </p>
                  </div>
                </div>
                {Boolean(matchData.roomId || matchData.roomPassword) && (
                  <button
                    onClick={() => setShowRoomDetailsModal(true)}
                    className="px-3 py-2 bg-[#16A34A] hover:bg-[#15803D] active:scale-95 text-white font-black text-[11px] uppercase tracking-wider rounded-xl shadow-xs shrink-0 flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Key size={13} className="stroke-[2.5]" />
                    <span>View Room</span>
                  </button>
                )}
              </div>
            );
          }
          return null;
        })()}

        {/* TOURNAMENT BANNER */}
        <div className="w-full aspect-[16/9] sm:aspect-[16/8.5] bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 relative">
          <SafeImage
            src={bannerImage}
            alt={matchTitle}
            className="w-full h-full object-cover"
            imgClassName="w-full h-full object-cover"
          />

          {isJoined && (
            <div className="absolute top-3 right-3 z-10 bg-[#16A34A] text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
              <CheckCircle2 size={12} />
              <span>Joined</span>
            </div>
          )}

          <div className="absolute bottom-3 left-3 z-10">
            {isCompleted ? (
              <span className="bg-slate-900/85 backdrop-blur-xs text-slate-200 text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                Completed
              </span>
            ) : isOngoing ? (
              <span className="bg-red-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider animate-pulse">
                LIVE NOW
              </span>
            ) : isFull ? (
              <span className="bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                Full ({playersCount}/{totalSlots})
              </span>
            ) : (
              <span className="bg-[#16A34A] text-white text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider shadow-xs tabular-nums">
                {spotsLeft} Spots Left
              </span>
            )}
          </div>
        </div>

        {/* MATCH TITLE / BASIC INFORMATION */}
        <div className="space-y-3">
          <h2 className="text-base sm:text-lg font-black uppercase text-slate-900 text-center leading-snug tracking-tight px-1">
            {matchTitle}
          </h2>

          <div className="space-y-2">
            {/* Row 1: Team | Mode | Map */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Team
                </span>
                <span className="text-xs sm:text-[13px] font-black text-slate-900 uppercase mt-0.5">
                  {teamType}
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Mode
                </span>
                <span className="text-xs sm:text-[13px] font-black text-slate-900 uppercase mt-0.5 truncate px-1">
                  {modeName}
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Map
                </span>
                <span className="text-xs sm:text-[13px] font-black text-slate-900 uppercase mt-0.5 truncate px-1">
                  {mapName}
                </span>
              </div>
            </div>

            {/* Row 2: Match Type | Entry Fee */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs flex items-center justify-center gap-1.5">
                <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                  Match Type:
                </span>
                <span className="text-xs sm:text-[13px] font-black text-slate-900">
                  {matchTypeStr}
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs flex items-center justify-center gap-1.5">
                <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                  Entry Fee:
                </span>
                <div className="inline-flex items-center gap-1 font-black text-xs sm:text-[13px] text-slate-900 tabular-nums">
                  {isPaid ? (
                    <>
                      <GoldenCoinIcon size={15} />
                      <span className="text-[#16A34A] font-black">{entryFeeStr}</span>
                    </>
                  ) : (
                    <span className="text-[#16A34A] font-black">FREE</span>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Match Schedule */}
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 text-center shadow-2xs flex items-center justify-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Match Schedule:
              </span>
              <span className="text-xs sm:text-[13px] font-black text-[#16A34A] tracking-tight tabular-nums">
                {scheduleFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* PRIZE DETAILS */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#16A34A] tracking-wide uppercase">
              Prize Details
            </h3>
            <span className="text-[11px] font-black text-[#16A34A] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full tabular-nums">
              Total Pool: ₹{totalPrizePool}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2.5 text-xs sm:text-[13px]">
            {prizeItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between font-bold text-slate-900 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <span className="uppercase text-slate-600 tracking-wide">{item.label}</span>
                <span className="text-[#16A34A] font-black tabular-nums">{item.amount}</span>
              </div>
            ))}
            
            <div className="pt-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider text-left">
              ONLY ON FULL SLOT
            </div>
          </div>
        </div>

        {/* ABOUT THIS MATCH */}
        <div className="space-y-1.5 pt-1">
          <h3 className="text-sm font-black text-[#16A34A] tracking-wide uppercase">
            About this Match
          </h3>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs text-xs sm:text-[13px] font-medium text-slate-700 leading-relaxed whitespace-pre-line">
            {aboutDescription}
          </div>
        </div>

        {/* RULES AND REGULATIONS */}
        <div className="space-y-1.5 pt-1">
          <h3 className="text-sm font-black text-[#16A34A] tracking-wide uppercase">
            Rules and Regulations
          </h3>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 text-xs sm:text-[13px] text-slate-700 leading-relaxed font-medium">
            {rulesList.map((rule, idx) => {
              const isSubHeading = rule.endsWith(':-') || rule.startsWith('To ensure fair');
              if (isSubHeading) {
                return (
                  <p key={idx} className="font-bold text-slate-900 pt-1">
                    {rule}
                  </p>
                );
              }
              return (
                <div key={idx} className="flex items-start gap-2.5">
                  <span className="text-[#16A34A] font-black text-sm leading-tight shrink-0">•</span>
                  <p className="flex-1 leading-snug">
                    {rule}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* VIEW ALL JOININGS BUTTON */}
        <div className="pt-2">
          <button
            onClick={() => setShowAllJoiningsModal(true)}
            className="w-full py-3.5 sm:py-4 bg-white hover:bg-[#ECFDF5] border border-[#BBF7D0] active:scale-[0.98] text-[#16A34A] rounded-xl font-black text-xs sm:text-[13px] uppercase tracking-wider shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Users size={16} />
            <span>VIEW ALL JOININGS ({playersCount}/{totalSlots})</span>
          </button>
        </div>
      </div>

      {/* STICKY BOTTOM JOIN MATCH ACTION AREA */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] z-40">
        {isCompleted ? (
          <button
            disabled
            className="w-full py-3.5 bg-slate-100 text-slate-400 rounded-xl font-black text-sm uppercase tracking-wider cursor-not-allowed border border-slate-200"
          >
            COMPLETED
          </button>
        ) : isOngoing ? (
          <div className="flex gap-2">
            {isJoined && (matchData.roomId || matchData.roomPassword) ? (
              <button
                onClick={() => setShowRoomDetailsModal(true)}
                className="flex-1 py-3.5 bg-[#16A34A] hover:bg-[#15803D] active:scale-98 text-white rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Key size={16} />
                <span>VIEW ROOM ID & PASSWORD</span>
              </button>
            ) : (
              <button
                disabled
                className="w-full py-3.5 bg-red-600 text-white rounded-xl font-black text-sm uppercase tracking-wider cursor-not-allowed animate-pulse"
              >
                MATCH STARTED
              </button>
            )}
          </div>
        ) : isJoined ? (
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
              className="flex-1 py-3.5 bg-emerald-50 border-2 border-[#16A34A] text-[#16A34A] active:scale-98 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>JOINED (VIEW SLOTS)</span>
            </button>
            {(matchData.roomId || matchData.roomPassword) && (
              <button
                onClick={() => setShowRoomDetailsModal(true)}
                className="px-4 py-3.5 bg-[#ECFDF5] hover:bg-emerald-100 text-[#16A34A] rounded-xl font-black text-xs uppercase tracking-wider border border-[#BBF7D0] transition-all cursor-pointer"
              >
                <Key size={16} />
              </button>
            )}
          </div>
        ) : isFull ? (
          <button
            disabled
            className="w-full py-3.5 bg-slate-100 text-slate-400 rounded-xl font-black text-sm uppercase tracking-wider cursor-not-allowed border border-slate-200"
          >
            MATCH FULL
          </button>
        ) : (
          <button
            onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
            className="w-full py-3.5 sm:py-4 bg-[#16A34A] hover:bg-[#15803D] active:scale-98 text-white rounded-xl font-black text-sm sm:text-base uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Swords size={18} />
            <span>JOIN MATCH</span>
          </button>
        )}
      </div>

      {/* MODAL: VIEW ALL JOININGS */}
      <AnimatePresence>
        {showAllJoiningsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowAllJoiningsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-white rounded-3xl p-5 text-slate-900 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh] border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] rounded-xl">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900 tracking-wide">
                      All Registered Players
                    </h3>
                    <p className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider tabular-nums">
                      {playersCount} of {totalSlots} Slots Filled
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowAllJoiningsModal(false)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded-full transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="my-3 relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search player name, IGN, or slot #..."
                  value={joiningsSearch}
                  onChange={(e) => setJoiningsSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-[#16A34A] focus:bg-white"
                />
              </div>

              {isJoined && (
                <div className={`mb-2.5 px-3 py-2 rounded-xl border text-[10px] font-bold flex items-center gap-2 ${
                  canEditIgn
                    ? 'bg-[#ECFDF5] border-[#BBF7D0] text-[#16A34A]'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  {canEditIgn ? <Clock size={13} className="shrink-0" /> : <Lock size={13} className="shrink-0" />}
                  <span>
                    {canEditIgn
                      ? 'You can change your In-Game Name up to 10 minutes before match start.'
                      : 'In-Game Name editing is locked (within 10 mins of match start or match started).'}
                  </span>
                </div>
              )}

              {ignEditError && (
                <div className="mb-2.5 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{ignEditError}</span>
                </div>
              )}

              {ignEditSuccess && (
                <div className="mb-2.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[#16A34A] text-[11px] font-bold flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{ignEditSuccess}</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                {players.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Users size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-600">No players joined yet</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Be the first player to join this match!</p>
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">
                    <p className="text-xs font-bold">No players matching "{joiningsSearch}"</p>
                  </div>
                ) : (
                  filteredPlayers.map((player, idx) => {
                    const isOwnPlayer = Boolean(currentUid && player.userId === currentUid);
                    const slotKey = `${player.userId || 'player'}_${player.slot ?? idx}`;
                    const isEditingThisRow = editingSlotKey === slotKey;

                    return (
                      <div key={slotKey} className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center font-black text-[11px] text-[#16A34A] tabular-nums shrink-0">
                              #{player.slot || idx + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-slate-900 leading-tight truncate">
                                {player.ign || player.username || 'Gamer'}
                              </p>
                              <p className="text-[10px] font-semibold text-slate-500 truncate">
                                {player.username ? `@${player.username}` : `Player ${idx + 1}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isOwnPlayer && !isEditingThisRow && (
                              canEditIgn ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditIgn(player, slotKey)}
                                  className="px-2 py-1 rounded-md bg-white hover:bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Edit In-Game Name"
                                >
                                  <Edit2 size={10} />
                                  <span>Edit</span>
                                </button>
                              ) : (
                                <span
                                  className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-bold uppercase flex items-center gap-1"
                                  title="IGN editing closes 10 minutes before match start"
                                >
                                  <Lock size={9} />
                                  <span>Locked</span>
                                </span>
                              )
                            )}
                            <span className="text-[9px] font-black uppercase text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              CONFIRMED
                            </span>
                          </div>
                        </div>

                        {isOwnPlayer && isEditingThisRow && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleSaveIgn(player);
                            }}
                            className="flex items-center gap-1.5 pt-2 border-t border-slate-200"
                          >
                            <input
                              type="text"
                              value={editingIgnValue}
                              onChange={(e) => setEditingIgnValue(e.target.value)}
                              placeholder="Enter new In-Game Name"
                              maxLength={50}
                              autoFocus
                              disabled={savingIgn}
                              className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-300 focus:border-[#16A34A] rounded-lg text-xs font-bold text-slate-900 outline-none"
                            />
                            <button
                              type="submit"
                              disabled={savingIgn || !editingIgnValue.trim()}
                              className="px-2.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                            >
                              {savingIgn ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              disabled={savingIgn}
                              onClick={() => {
                                setEditingSlotKey(null);
                                setIgnEditError(null);
                              }}
                              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                              aria-label="Cancel edit"
                            >
                              <X size={13} />
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500">Total Joined: <span className="text-[#16A34A] font-black tabular-nums">{playersCount}</span></span>
                <button
                  onClick={() => setShowAllJoiningsModal(false)}
                  className="px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-xs transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: ROOM ID & PASSWORD */}
      <AnimatePresence>
        {showRoomDetailsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowRoomDetailsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 text-slate-900 shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowRoomDetailsModal(false)}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-900 bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="w-14 h-14 rounded-full bg-[#ECFDF5] border-2 border-[#16A34A] text-[#16A34A] flex items-center justify-center mx-auto mb-4">
                <Key size={26} />
              </div>

              <h3 className="text-base font-black uppercase text-slate-900 mb-1 tracking-wide">
                Room Details
              </h3>
              <p className="text-xs text-slate-500 mb-5">
                Join the custom room in Free Fire before match time
              </p>

              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-xs mb-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold uppercase text-[11px]">Room ID:</span>
                  <span className="font-mono font-black text-[#16A34A] text-sm tracking-wider select-all">
                    {matchData.roomId || 'Available 15 min before'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[11px]">Room Password:</span>
                  <span className="font-mono font-black text-[#16A34A] text-sm tracking-wider select-all">
                    {matchData.roomPassword || 'Available 15 min before'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowRoomDetailsModal(false)}
                className="w-full py-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-xs transition-all cursor-pointer"
              >
                GOT IT
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
