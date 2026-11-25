import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Gamepad, X, Trophy, Star, Copy, Flame } from 'lucide-react';
import { Page, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import RulesModal from '../components/RulesModal';
import SafeImage from '../components/SafeImage';
import { getMatchRemainingTime } from '../utils/matchAlertHelper';

interface TournamentListProps {
  onPageChange: (page: Page, id?: string) => void;
  selectedGameId?: string | null;
  joinedMatchIds: string[];
}

function GoldenCoinIcon({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-[#16A34A] flex items-center justify-center shrink-0 shadow-2xs"
    >
      <span className="text-white font-black text-[9px] leading-none select-none">
        ₹
      </span>
    </div>
  );
}

function formatTournamentSchedule(timeStr?: string) {
  if (!timeStr) return 'Time : 21/08/2026 at 08:00 AM';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) {
      return `Time : ${timeStr}`;
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
    return `Time : ${day}/${month}/${year} at ${strHours}:${minutes} ${ampm}`;
  } catch {
    return `Time : ${timeStr}`;
  }
}

function getDefaultEsportsImage(section?: string, mode?: string) {
  const s = (section || '').toLowerCase();
  const m = (mode || '').toLowerCase();

  if (s.includes('clash') || m.includes('cs')) {
    return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop';
  }
  if (s.includes('lone') || m.includes('wolf')) {
    return 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop';
  }
  if (m.includes('survival') || m.includes('solo')) {
    return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop';
  }
  return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop';
}

export default function Tournaments({ onPageChange, joinedMatchIds }: TournamentListProps) {
  const { gameId } = useParams();
  const [searchParams] = useSearchParams();
  const selectedGameId = gameId;
  const selectedModeId = searchParams.get('mode');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [gameModes, setGameModes] = useState<{ id: string; title: string; category?: string; subtitle?: string; gameId?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrizeMatch, setSelectedPrizeMatch] = useState<Tournament | null>(null);
  const [selectedResultsMatch, setSelectedResultsMatch] = useState<Tournament | null>(null);
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);
  const [matchResults, setMatchResults] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const statusParam = searchParams.get('status') as 'upcoming' | 'ongoing' | 'completed' | null;
  const [activeTab, setActiveTab] = useState<'upcoming' | 'ongoing' | 'completed'>(statusParam || 'upcoming');
  const [showIdPass, setShowIdPass] = useState<{ isOpen: boolean; roomId?: string; roomPass?: string }>({ isOpen: false });

  useEffect(() => {
    if (statusParam && (statusParam === 'upcoming' || statusParam === 'ongoing' || statusParam === 'completed')) {
      setActiveTab(statusParam);
    }
  }, [statusParam]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
  };

  const getPageTitle = () => {
    if (statusParam) {
      if (activeTab === 'ongoing') return 'ONGOING MATCHES';
      if (activeTab === 'upcoming') return 'UPCOMING MATCHES';
      if (activeTab === 'completed') return 'COMPLETED MATCHES';
      return 'MY MATCHES';
    }

    if (selectedModeId) {
      const modeIdLower = selectedModeId.toLowerCase().trim();
      const modeIdClean = modeIdLower.replace(/[_-]/g, ' ').trim();

      const directMode = gameModes.find(
        m => m.id === selectedModeId || m.id.toLowerCase() === modeIdLower
      );
      if (directMode && directMode.title) {
        const titleUpper = directMode.title.trim().toUpperCase();
        return titleUpper.endsWith('CONTESTS') || titleUpper.endsWith('CONTEST') || titleUpper.endsWith('MATCHES')
          ? titleUpper
          : `${titleUpper} CONTESTS`;
      }

      const fuzzyMode = gameModes.find(m => {
        const titleL = (m.title || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        const subL = (m.subtitle || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        const catL = (m.category || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        return (
          titleL === modeIdClean ||
          subL === modeIdClean ||
          catL === modeIdClean ||
          (titleL && modeIdClean.includes(titleL)) ||
          (subL && modeIdClean.includes(subL)) ||
          (catL && modeIdClean.includes(catL))
        );
      });
      if (fuzzyMode && fuzzyMode.title) {
        const titleUpper = fuzzyMode.title.trim().toUpperCase();
        return titleUpper.endsWith('CONTESTS') || titleUpper.endsWith('CONTEST') || titleUpper.endsWith('MATCHES')
          ? titleUpper
          : `${titleUpper} CONTESTS`;
      }

      const matchedTournament = tournaments.find(m => {
        const mModeId = (m.modeId || '').toLowerCase();
        const mSection = (m.section || '').toLowerCase();
        const mMode = (m.mode || '').toLowerCase();
        const mTitle = (m.title || '').toLowerCase();
        return (
          mModeId === modeIdLower ||
          mSection === modeIdClean ||
          mMode === modeIdClean ||
          mTitle.includes(modeIdClean)
        );
      });

      if (matchedTournament) {
        const s = (matchedTournament.section || '').trim().toUpperCase();
        const mod = (matchedTournament.mode || '').trim().toUpperCase();
        if (s && s !== 'BATTLE ROYALE' && !modeIdLower.startsWith('br_')) {
          return s.endsWith('CONTESTS') || s.endsWith('CONTEST') || s.endsWith('MATCHES') ? s : `${s} CONTESTS`;
        }
        if (mod && mod !== 'SOLO' && mod !== 'DUO' && mod !== 'SQUAD' && mod !== '48') {
          return mod.endsWith('CONTESTS') || mod.endsWith('CONTEST') || mod.endsWith('MATCHES') ? mod : `${mod} CONTESTS`;
        }
      }

      const cleanSlug = selectedModeId.replace(/[_-]/g, ' ').trim().toUpperCase();
      return cleanSlug.endsWith('CONTESTS') || cleanSlug.endsWith('CONTEST') || cleanSlug.endsWith('MATCHES')
        ? cleanSlug
        : `${cleanSlug} CONTESTS`;
    }

    if (activeTab === 'ongoing') return 'ONGOING MATCHES';
    if (activeTab === 'upcoming') return 'UPCOMING MATCHES';
    if (activeTab === 'completed') return 'COMPLETED MATCHES';

    return 'ESPORTS MATCHES';
  };

  const filteredMatches = tournaments.filter(m => {
    const status = m.status || 'upcoming';

    if (statusParam && !joinedMatchIds.includes(m.id)) {
      return false;
    }

    if (status === 'active' && activeTab === 'upcoming') return true;
    if (status === 'cancelled' && activeTab === 'completed') return true;

    if (status !== activeTab) return false;

    if (selectedModeId) {
      const modeId = selectedModeId.toLowerCase().trim();
      const modeClean = modeId.replace(/[_-]/g, ' ').trim();

      if (m.modeId && m.modeId.toLowerCase() === modeId) {
        return true;
      }

      const matchedGameMode = gameModes.find(gm => gm.id.toLowerCase() === modeId || gm.id === selectedModeId);
      if (matchedGameMode) {
        const gmTitleL = (matchedGameMode.title || '').toLowerCase();
        const gmSubL = (matchedGameMode.subtitle || '').toLowerCase();
        const gmCatL = (matchedGameMode.category || '').toLowerCase();

        if (
          (m.modeId && m.modeId === matchedGameMode.id) ||
          (m.mode && m.mode.toLowerCase() === gmTitleL) ||
          (m.section && (
            m.section.toLowerCase() === gmTitleL ||
            m.section.toLowerCase() === gmCatL ||
            m.section.toLowerCase() === gmSubL
          )) ||
          (m.title && m.title.toLowerCase().includes(gmTitleL))
        ) {
          return true;
        }
      }

      if (modeId.startsWith('br_')) {
        if (m.section === 'Battle Royale' || !m.section) {
          const targetMode = modeId.replace('br_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      } else if (modeId.startsWith('cs_')) {
        if (m.section === 'Clash Squad' || m.section === 'CS 1v1' || m.section === 'CS 2v2') {
          const targetMode = modeId.replace('cs_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      } else if (modeId.startsWith('lone_wolf_')) {
        if (m.section === 'Lone Wolf') {
          const targetMode = modeId.replace('lone_wolf_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      }

      const modeLower = (m.mode || '').toLowerCase();
      const sectionLower = (m.section || '').toLowerCase();
      const titleLower = (m.title || '').toLowerCase();
      const mModeId = (m.modeId || '').toLowerCase();

      if (
        mModeId === modeId ||
        modeLower === modeId ||
        modeLower === modeClean ||
        sectionLower === modeId ||
        sectionLower === modeClean ||
        modeLower.includes(modeClean) ||
        sectionLower.includes(modeClean) ||
        titleLower.includes(modeClean) ||
        titleLower.includes(modeId)
      ) {
        return true;
      }

      return false;
    }

    return true;
  });

  const finalFilteredMatches = filteredMatches;

  useEffect(() => {
    if (selectedResultsMatch) {
      setLoadingResults(true);
      const fetchResults = async () => {
        try {
          const resSnap = await getDocs(query(collection(db, 'matchResults'), where('matchId', '==', selectedResultsMatch.id), limit(1)));
          if (!resSnap.empty) {
            setMatchResults(resSnap.docs[0].data());
          } else {
            alert('Results not found for this match.');
            setSelectedResultsMatch(null);
          }
        } catch (error) {
          console.error('Error fetching results:', error);
        } finally {
          setLoadingResults(false);
        }
      };
      fetchResults();
    } else {
      setMatchResults(null);
    }
  }, [selectedResultsMatch]);

  useEffect(() => {
    let isMounted = true;
    const fetchGameModes = async () => {
      try {
        const qModes = query(collection(db, 'gameModes'), orderBy('order', 'asc'), limit(50));
        const snapshot = await getDocs(qModes);
        if (!isMounted) return;
        const modesData = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as { id: string; title: string; category?: string; subtitle?: string; gameId?: string }[];
        setGameModes(modesData);
      } catch (error) {
        console.warn('Error fetching game modes for Tournaments page:', error);
      }
    };

    fetchGameModes();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchTournaments = async () => {
      setLoading(true);
      try {
        const q = selectedGameId
          ? query(collection(db, 'matches'), where('gameId', '==', selectedGameId), orderBy('createdAt', 'desc'), limit(50))
          : query(collection(db, 'matches'), orderBy('createdAt', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        if (!isMounted) return;
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Tournament[];
        setTournaments(data);
      } catch (error: any) {
        if (error?.message?.includes('index')) {
          try {
            const fallbackQ = selectedGameId
              ? query(collection(db, 'matches'), where('gameId', '==', selectedGameId), limit(50))
              : query(collection(db, 'matches'), limit(50));
            const snap = await getDocs(fallbackQ);
            if (!isMounted) return;
            setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Tournament));
          } catch (err) {
            if (isMounted) handleFirestoreError(err, OperationType.LIST, 'matches');
          }
        } else {
          if (isMounted) handleFirestoreError(error, OperationType.LIST, 'matches');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTournaments();
    return () => {
      isMounted = false;
    };
  }, [selectedGameId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-16 bg-[#F2FBF6] max-w-lg mx-auto border-x border-emerald-200/60">
        <Loader2 size={32} className="text-[#16A34A] animate-spin mb-4" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-800/80">Loading contests...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2FBF6] text-slate-900 pb-24 max-w-lg mx-auto select-none relative overflow-hidden border-x border-emerald-200/60">
      <div className="relative z-10">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-emerald-200/90 shadow-[0_2px_15px_rgba(22,163,74,0.06)]">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => onPageChange(Page.HOME)}
              className="p-2 -ml-1 text-slate-700 hover:text-[#16A34A] hover:bg-emerald-50 rounded-xl active:scale-95 transition-all"
              aria-label="Back to home"
            >
              <ChevronLeft size={24} className="stroke-[2.5]" />
            </button>

            <h1 className="text-base sm:text-lg font-extrabold uppercase tracking-tight text-[#16A34A] text-center flex-1 pr-6 truncate">
              {getPageTitle()}
            </h1>
          </div>

          {/* Tabs: Ongoing | Upcoming | Resulted */}
          <div className="flex items-center justify-between border-t border-emerald-100 bg-white px-2">
            <button
              onClick={() => setActiveTab('ongoing')}
              className={`flex-1 py-3 text-center text-xs sm:text-[13px] font-bold tracking-wide transition-all relative whitespace-nowrap ${
                activeTab === 'ongoing'
                  ? 'text-[#16A34A]'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>Ongoing</span>
              {activeTab === 'ongoing' && (
                <motion.div
                  layoutId="tournamentActiveTabUnderline"
                  className="absolute bottom-0 inset-x-4 h-[2.5px] bg-[#16A34A] rounded-t-full"
                />
              )}
            </button>

            <button
              onClick={() => setActiveTab('upcoming')}
              className={`flex-1 py-3 text-center text-xs sm:text-[13px] font-bold tracking-wide transition-all relative whitespace-nowrap ${
                activeTab === 'upcoming'
                  ? 'text-[#16A34A]'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>Upcoming</span>
              {activeTab === 'upcoming' && (
                <motion.div
                  layoutId="tournamentActiveTabUnderline"
                  className="absolute bottom-0 inset-x-4 h-[2.5px] bg-[#16A34A] rounded-t-full"
                />
              )}
            </button>

            <button
              onClick={() => setActiveTab('completed')}
              className={`flex-1 py-3 text-center text-xs sm:text-[13px] font-bold tracking-wide transition-all relative whitespace-nowrap ${
                activeTab === 'completed'
                  ? 'text-[#16A34A]'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>Resulted</span>
              {activeTab === 'completed' && (
                <motion.div
                  layoutId="tournamentActiveTabUnderline"
                  className="absolute bottom-0 inset-x-4 h-[2.5px] bg-[#16A34A] rounded-t-full"
                />
              )}
            </button>
          </div>
        </header>

        {/* Tournament Cards Container */}
        <div className="px-4 py-4 sm:px-5 sm:py-5 space-y-4">
          {finalFilteredMatches.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 px-6 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#ECFDF5] border border-emerald-100 flex items-center justify-center text-[#16A34A] mb-3">
                <Gamepad size={28} />
              </div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                {statusParam ? `No Joined ${activeTab} Matches` : `No ${activeTab === 'completed' ? 'resulted' : activeTab} tournaments match your filter`}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium max-w-xs">
                {statusParam ? `You haven't registered for any ${activeTab} matches yet.` : 'Try switching tabs or resetting your filter options to view more contests.'}
              </p>
            </div>
          ) : (
            finalFilteredMatches.map((t, idx) => {
              const isJoined = joinedMatchIds.includes(t.id);
              const isOngoing = t.status === 'ongoing';
              const isCompleted = t.status === 'completed';
              const isCancelled = t.status === 'cancelled';

              const getCalculatedPrizePool = () => {
                if (t.prizePool && Number(t.prizePool) > 0) return Number(t.prizePool);
                if (t.prizeDistribution && Object.keys(t.prizeDistribution).length > 0) {
                  const total = (Object.values(t.prizeDistribution) as any[]).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
                  if (total > 0) return total;
                }
                if (t.prize) {
                  const parsed = parseInt(String(t.prize).replace(/[^0-9]/g, ''));
                  if (!isNaN(parsed) && parsed > 0) return parsed;
                }
                return 300;
              };

              const prizePoolNum = getCalculatedPrizePool();

              const getWinningSystemInfo = () => {
                if (t.prizeType === 'survival') {
                  return { label: 'PER KILL', value: 0 };
                }
                if (t.prizeType === 'perKill') {
                  return { label: 'PER KILL', value: Number(t.perKillAmount) || 0 };
                }
                if (t.perKillAmount && Number(t.perKillAmount) > 0) {
                  return { label: 'PER KILL', value: Number(t.perKillAmount) };
                }
                return { label: 'PER KILL', value: 0 };
              };

              const winningInfo = getWinningSystemInfo();

              const totalSlots = t.totalSlots || t.maxPlayers || 48;
              const playersCount = t.playersCount || (t.players ? t.players.length : 0);
              const spotsLeft = Math.max(0, totalSlots - playersCount);
              const progressPercentage = Math.min(100, Math.max(0, (playersCount / totalSlots) * 100));

              const displayTitle = () => {
                const title = t.title || 'BR SOLO BATTLE';
                const idTag = t.displayId ? `${t.displayId}` : (t as any).matchNumber ? `#${(t as any).matchNumber}` : '';
                if (idTag && !title.includes(idTag)) {
                  return `${title} ${idTag}`;
                }
                return title;
              };

              const mapName = (t.map || 'BERMUDA').toUpperCase();
              const typeName = (t.section || 'BATTLE ROYALE').toUpperCase();
              const entryFeeValue = t.entryFee !== undefined && t.entryFee !== null ? t.entryFee : 5;
              const entryPerPlayer = entryFeeValue;

              const cardImage = t.image || getDefaultEsportsImage(t.section, t.mode);

              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => onPageChange(Page.MATCH_DETAILS, t.id)}
                  className="w-full rounded-2xl overflow-hidden shadow-xs hover:shadow-md bg-white flex flex-col border border-slate-200 hover:border-emerald-300 cursor-pointer transition-all duration-200"
                >
                  {/* Image Header */}
                  <div className="relative w-full aspect-[16/7.5] sm:aspect-[16/7] bg-slate-100 overflow-hidden cursor-pointer">
                    <SafeImage
                      src={cardImage}
                      alt={t.title || 'Tournament'}
                      className="w-full h-full object-cover"
                      imgClassName="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />

                    {isJoined && (
                      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
                        {(() => {
                          const status = getMatchRemainingTime(t.time);
                          if (status.is15MinWindow) {
                            return (
                              <span className="bg-red-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md flex items-center gap-1 tabular-nums">
                                <Flame size={10} className="fill-white" />
                                {status.formattedCountdown}
                              </span>
                            );
                          }
                          return null;
                        })()}
                        <div className="bg-[#16A34A] text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                          Joined
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-4 sm:p-5 bg-white text-slate-900 flex flex-col justify-between border-t border-slate-100">
                    <h3 className="text-[14px] sm:text-base font-extrabold uppercase tracking-tight text-slate-900 leading-snug cursor-pointer hover:text-[#16A34A] transition-colors">
                      {displayTitle()}
                    </h3>

                    <p className="text-[11.5px] sm:text-xs font-semibold text-slate-500 mt-1 mb-3.5 tabular-nums">
                      {formatTournamentSchedule(t.time)}
                    </p>

                    {/* 3-Column Top Information Row */}
                    <div className="grid grid-cols-3 gap-2 py-2.5 border border-slate-200 bg-slate-50 rounded-xl px-2">
                      <div
                        className="flex flex-col items-center justify-center text-center cursor-pointer group/prize py-0.5 px-1 rounded-lg hover:bg-white transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPrizeMatch(t);
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-500 uppercase tracking-wide group-hover/prize:text-[#16A34A] transition-colors">
                            PRIZE POOL
                          </span>
                          <Trophy size={11} className="text-[#16A34A]" />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <GoldenCoinIcon size={16} />
                          <span className="text-sm sm:text-base font-black text-[#16A34A] leading-none tabular-nums">
                            {prizePoolNum}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center text-center">
                        <span className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                          {winningInfo.label}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <GoldenCoinIcon size={16} />
                          <span className="text-sm sm:text-base font-black text-slate-900 leading-none tabular-nums">
                            {winningInfo.value}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center text-center">
                        <span className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                          ENTRY FEE
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <GoldenCoinIcon size={16} />
                          <span className="text-sm sm:text-base font-black text-[#16A34A] leading-none tabular-nums">
                            {entryFeeValue === 0 ? 'FREE' : entryFeeValue}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3-Column Bottom Information Row */}
                    <div className="grid grid-cols-3 gap-2 py-2.5 mt-2 border border-slate-200 bg-slate-50 rounded-xl px-2">
                      <div className="flex flex-col items-center justify-center text-center">
                        <span className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                          TYPE
                        </span>
                        <span className="text-[11px] sm:text-xs font-extrabold uppercase text-slate-900 mt-0.5 leading-tight">
                          {typeName}
                        </span>
                      </div>

                      <div className="flex flex-col items-center justify-center text-center">
                        <span className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                          ENTRY PER PLAYER
                        </span>
                        <span className="text-[11px] sm:text-xs font-extrabold uppercase text-slate-900 mt-0.5 leading-tight tabular-nums">
                          {entryPerPlayer === 0 ? 'FREE' : entryPerPlayer}
                        </span>
                      </div>

                      <div className="flex flex-col items-center justify-center text-center">
                        <span className="text-[9.5px] sm:text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                          MAP
                        </span>
                        <span className="text-[11px] sm:text-xs font-extrabold uppercase text-slate-900 mt-0.5 leading-tight">
                          {mapName}
                        </span>
                      </div>
                    </div>

                    {/* Progress & Action Button */}
                    <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 sm:gap-4">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => onPageChange(Page.MATCH_DETAILS, t.id)}
                      >
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5 border border-slate-200">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercentage}%` }}
                            className="h-full bg-[#16A34A] rounded-full"
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] sm:text-[11.5px] font-bold text-[#16A34A] leading-none tabular-nums">
                            {spotsLeft === 0
                              ? 'Match Full'
                              : spotsLeft === 1
                              ? 'Only 1 Spot Left'
                              : `Only ${spotsLeft} Spots Left`}
                          </span>
                          <span className="text-[10.5px] sm:text-[11.5px] font-bold text-slate-500 leading-none tabular-nums">
                            {playersCount}/{totalSlots}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCancelled) {
                            onPageChange(Page.MATCH_DETAILS, t.id);
                            return;
                          }
                          if (isCompleted) {
                            if (isJoined) {
                              setSelectedResultsMatch(t);
                              return;
                            }
                          } else if (isOngoing) {
                            if (isJoined) {
                              setShowIdPass({ isOpen: true, roomId: t.roomId, roomPass: t.roomPassword });
                              return;
                            }
                          }
                          onPageChange(Page.MATCH_DETAILS, t.id);
                        }}
                        className={`px-6 sm:px-7 py-2.5 rounded-xl text-xs sm:text-sm font-bold tracking-wide transition-all shrink-0 active:scale-95 whitespace-nowrap ${
                          isCancelled
                            ? 'bg-amber-50 border border-amber-200 text-amber-700'
                            : isCompleted
                            ? isJoined
                              ? 'bg-[#ECFDF5] hover:bg-emerald-100 border border-[#BBF7D0] text-[#16A34A]'
                              : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-default'
                            : isOngoing
                            ? isJoined
                              ? 'bg-[#16A34A] hover:bg-[#15803D] text-white font-black shadow-xs'
                              : 'bg-red-50 border border-red-200 text-red-600 cursor-not-allowed'
                            : isJoined
                            ? 'bg-[#ECFDF5] border border-emerald-300 text-[#16A34A] font-extrabold'
                            : 'bg-[#16A34A] hover:bg-[#15803D] text-white font-black shadow-xs'
                        }`}
                      >
                        {isCancelled
                          ? 'Cancelled'
                          : isCompleted
                          ? isJoined
                            ? 'Results'
                            : 'Finished'
                          : isOngoing
                          ? isJoined
                            ? 'ID Pass'
                            : 'Live'
                          : isJoined
                          ? 'Joined'
                          : 'Join'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Prize Pool Breakdown Modal */}
        <AnimatePresence>
          {selectedPrizeMatch && (() => {
            const isSurvival = selectedPrizeMatch.prizeType === 'survival';
            const distribution = isSurvival
              ? selectedPrizeMatch.prizeDistribution || {}
              : selectedPrizeMatch.positionPrizeDistribution || {};

            const validEntries = Object.entries(distribution)
              .sort(([a], [b]) => Number(a) - Number(b))
              .filter(([_, amount]) => (Number(amount) || 0) > 0);

            const calculatedTotal = validEntries.length > 0
              ? validEntries.reduce((sum, [_, amt]) => sum + (Number(amt) || 0), 0)
              : (selectedPrizeMatch.prizePool || 0);

            const displayTotalPool = calculatedTotal > 0 ? calculatedTotal : (selectedPrizeMatch.prizePool || 0);
            const winnersCount = validEntries.length > 0
              ? validEntries.length
              : (selectedPrizeMatch.winnersCount || (isSurvival ? 1 : 0));

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-xs"
                onClick={() => setSelectedPrizeMatch(null)}
              >
                <motion.div
                  initial={{ scale: 0.94, y: 16 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.94, y: 16 }}
                  className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-5 shadow-xl relative overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute top-4 right-4">
                    <button
                      onClick={() => setSelectedPrizeMatch(null)}
                      className="p-1.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A] shrink-0">
                      <Trophy size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Prize Breakdown</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-[200px]">
                        {selectedPrizeMatch.title}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 grid grid-cols-2 gap-2 text-center">
                    <div className="border-r border-slate-200 pr-2">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 block">
                        Total Prize Pool
                      </span>
                      <div className="flex items-center justify-center gap-1.5 mt-1">
                        <GoldenCoinIcon size={16} />
                        <span className="text-base font-black text-[#16A34A] tabular-nums">
                          {displayTotalPool}
                        </span>
                      </div>
                    </div>
                    <div className="pl-2 flex flex-col justify-center">
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 block">
                        {isSurvival ? 'Per Kill Reward' : 'Per Kill'}
                      </span>
                      <span className="text-base font-black text-[#16A34A] mt-1 tabular-nums">
                        {isSurvival ? '₹0' : `₹${selectedPrizeMatch.perKillAmount || 0}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#16A34A]">
                      {winnersCount > 1 ? `Top ${winnersCount} Players Rewarded` : 'Top 1 Winner'}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase">
                      Rank System
                    </span>
                  </div>

                  <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-0.5">
                    {validEntries.length > 0 ? (
                      validEntries.map(([pos, amount]) => {
                        const posNum = Number(pos);
                        const isFirst = posNum === 1;
                        const isSecond = posNum === 2;
                        const isThird = posNum === 3;

                        const rankTitle = isFirst
                          ? '1st Place (Winner)'
                          : isSecond
                          ? '2nd Place'
                          : isThird
                          ? '3rd Place'
                          : `Rank #${posNum}`;

                        return (
                          <div
                            key={pos}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                              isFirst
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-[11px] font-black w-7 tabular-nums ${isFirst ? 'text-[#16A34A]' : 'text-slate-500'}`}>
                                #{pos}
                              </span>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">
                                {rankTitle}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 font-black text-sm text-[#16A34A] tabular-nums">
                              <GoldenCoinIcon size={14} />
                              <span>{amount}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-black text-[#16A34A] w-7">#1</span>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">
                            1st Place (Winner)
                          </span>
                        </div>
                        <div className="flex items-center gap-1 font-black text-sm text-[#16A34A] tabular-nums">
                          <GoldenCoinIcon size={14} />
                          <span>{displayTotalPool}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedPrizeMatch(null)}
                    className="w-full h-11 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all mt-4 shadow-xs"
                  >
                    Close
                  </button>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Match Results Modal */}
        <AnimatePresence>
          {selectedResultsMatch && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setSelectedResultsMatch(null)}
            >
              <motion.div
                initial={{ scale: 0.94, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.94, y: 16 }}
                className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-5 relative">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                      <Trophy size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 line-clamp-1">{selectedResultsMatch.title}</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Match Results View</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedResultsMatch(null)}
                    className="p-1.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {loadingResults ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16">
                    <Loader2 size={28} className="text-[#16A34A] animate-spin mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fetching standings...</p>
                  </div>
                ) : matchResults ? (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Participants</p>
                        <p className="text-sm font-black text-slate-900 tabular-nums">{matchResults.results?.length || 0}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">Total Distributed</p>
                        <p className="text-sm font-black text-[#16A34A] tabular-nums">
                          ₹{((matchResults.results || []).reduce((sum: number, r: any) => sum + (r.winningAmount || 0), 0) || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                      {matchResults.results
                        ?.sort((a: any, b: any) => {
                          const isSurvival = matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale';
                          if (isSurvival) return a.rankOrKills - b.rankOrKills;
                          return b.rankOrKills - a.rankOrKills;
                        })
                        .map((res: any, idx: number) => {
                          const isWinner = res.rankOrKills === 1 && (matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale');

                          return (
                            <div
                              key={`${res.userId}_${res.slot || idx}`}
                              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                                isWinner
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black border tabular-nums ${
                                  isWinner
                                    ? 'bg-[#16A34A] text-white border-[#16A34A]'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}>
                                  {matchResults.prizeType === 'perKill' ? 'K' : `#${res.rankOrKills}`}
                                </div>
                                <div>
                                  <h4 className={`text-xs font-bold ${isWinner ? 'text-[#16A34A]' : 'text-slate-900'}`}>
                                    {res.ign || res.username}
                                  </h4>
                                  {matchResults.prizeType === 'perKill' && (
                                    <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider tabular-nums">
                                      {res.rankOrKills} Kills
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-xs sm:text-sm font-black tabular-nums ${res.winningAmount > 0 ? 'text-[#16A34A]' : 'text-slate-400'}`}>
                                  {res.winningAmount > 0 ? `+₹${res.winningAmount}` : '₹0'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-16">
                    <p className="text-xs text-slate-500 font-medium">Results pending declaration</p>
                  </div>
                )}

                <button
                  onClick={() => setSelectedResultsMatch(null)}
                  className="mt-5 w-full py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                >
                  Close Results
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ID Pass Modal */}
        <AnimatePresence>
          {showIdPass.isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setShowIdPass({ isOpen: false })}
            >
              <motion.div
                initial={{ scale: 0.94, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.94, y: 16 }}
                className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-xl relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6 relative">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                      <Star size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 line-clamp-1">Room Credentials</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Authorized Access</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowIdPass({ isOpen: false })}
                    className="p-1.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3 mb-5 relative z-10">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-1">Room ID</p>
                    <div className="flex items-center justify-between">
                      <p className="text-base font-black text-[#16A34A] tracking-widest font-mono tabular-nums">{showIdPass.roomId || 'PENDING'}</p>
                      <button
                        onClick={() => handleCopy(showIdPass.roomId || '')}
                        className="p-2 bg-white border border-[#BBF7D0] text-[#16A34A] rounded-lg hover:bg-[#ECFDF5] transition-colors"
                        title="Copy Room ID"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-1">Password</p>
                    <div className="flex items-center justify-between">
                      <p className="text-base font-black text-[#16A34A] tracking-widest font-mono tabular-nums">{showIdPass.roomPass || 'PENDING'}</p>
                      <button
                        onClick={() => handleCopy(showIdPass.roomPass || '')}
                        className="p-2 bg-white border border-[#BBF7D0] text-[#16A34A] rounded-lg hover:bg-[#ECFDF5] transition-colors"
                        title="Copy Password"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-[#16A34A] font-semibold bg-[#ECFDF5] p-3 rounded-xl border border-[#BBF7D0] mb-5 leading-relaxed">
                  Authorized access. Do not share room credentials. Multiple logins on the same credentials will trigger an anti-cheat flag.
                </p>

                <button
                  onClick={() => setShowIdPass({ isOpen: false })}
                  className="w-full py-3 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-xs"
                >
                  Enter Battle
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rules Modal */}
        <RulesModal
          isOpen={!!selectedRulesMatch}
          onClose={() => setSelectedRulesMatch(null)}
          section={selectedRulesMatch?.section || 'Battle Royale'}
          isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
          onJoin={() => onPageChange(Page.JOIN_MATCH, selectedRulesMatch?.id || '')}
        />
      </div>
    </div>
  );
}
