import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Plus, X, Loader2 } from 'lucide-react';
import { Page, User, Tournament, Banner } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

import HomeHeader from '../components/HomeHeader';
import AnnouncementBar from '../components/AnnouncementBar';
import HeroBannerCarousel from '../components/HeroBannerCarousel';
import MyMatches from '../components/MyMatches';
import EsportsGamesGrid from '../components/EsportsGamesGrid';
import RulesModal from '../components/RulesModal';
import NotificationsModal from '../components/NotificationsModal';
import CompleteProfileHomeView from '../components/CompleteProfileHomeView';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { auth } from '../lib/firebase';
import { getMissingProfileDetails } from '../utils/profileCompletion';

interface HomeProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
  onLogout?: () => void;
}

export default function Home({ user, onPageChange, joinedMatchIds, onLogout }: HomeProps) {
  const [adminSkippedProfile, setAdminSkippedProfile] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('ap_install_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [selectedPrizeMatch, setSelectedPrizeMatch] = useState<Tournament | null>(null);
  const [selectedResultsMatch, setSelectedResultsMatch] = useState<Tournament | null>(null);
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);
  
  const [isGeneralRulesOpen, setIsGeneralRulesOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  useModalBackHandler(!!selectedPrizeMatch, () => setSelectedPrizeMatch(null));
  useModalBackHandler(!!selectedResultsMatch, () => setSelectedResultsMatch(null));
  useModalBackHandler(!!selectedRulesMatch || isGeneralRulesOpen, () => {
    setSelectedRulesMatch(null);
    setIsGeneralRulesOpen(false);
  });
  useModalBackHandler(isNotificationsOpen, () => setIsNotificationsOpen(false));
  
  const [matchResults, setMatchResults] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [showIdPass, setShowIdPass] = useState<{ isOpen: boolean; roomId?: string; roomPass?: string }>({ isOpen: false });

  useModalBackHandler(showIdPass.isOpen, () => setShowIdPass({ isOpen: false }));

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
  };

  useEffect(() => {
    const q = query(collection(db, 'matches'), orderBy('matchNumber', 'desc'));
    const unsubMatches = onSnapshot(
      q,
      (snapshot) => {
        setMatches(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Tournament)));
        setLoadingMatches(false);
      },
      (err) => {
        console.error('Error fetching matches for home:', err);
        handleFirestoreError(err, OperationType.LIST, 'matches');
        setLoadingMatches(false);
      }
    );

    const unsubBanners = onSnapshot(
      query(collection(db, 'banners'), where('isActive', '!=', false), orderBy('order', 'asc')),
      (snapshot) => {
        const fetchedBanners = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Banner));
        setBanners(fetchedBanners);
        setHeroBanners(fetchedBanners.filter((b) => b.type === 'main' || b.type === 'offer'));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    return () => {
      unsubMatches();
      unsubBanners();
    };
  }, []);

  useEffect(() => {
    if (selectedResultsMatch) {
      setLoadingResults(true);
      const fetchResults = async () => {
        try {
          const { getDocs, query, collection, where } = await import('firebase/firestore');
          const resSnap = await getDocs(
            query(collection(db, 'matchResults'), where('matchId', '==', selectedResultsMatch.id))
          );
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

  const profileStatus = getMissingProfileDetails(user, auth.currentUser);
  if (profileStatus.needsCompletion && !adminSkippedProfile) {
    return (
      <CompleteProfileHomeView
        user={user}
        status={profileStatus}
        onAdminSkip={() => setAdminSkippedProfile(true)}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#F2FBF6] min-h-screen text-slate-900 select-none relative overflow-hidden">
      <div className="relative z-10">
        <HomeHeader 
          user={user} 
          onPageChange={onPageChange} 
          onOpenNotifications={() => setIsNotificationsOpen(true)}
        />

        <AnnouncementBar
          text="AP TOURNAMENT — MAIN RULES & TELEGRAM CHANNEL"
          onClick={() => {
            if (matches.length > 0) {
              setSelectedRulesMatch(matches[0]);
            } else {
              setIsGeneralRulesOpen(true);
            }
          }}
        />

        <HeroBannerCarousel banners={heroBanners} onPageChange={onPageChange} />

        {!installBannerDismissed && (
          <div className="px-4 sm:px-5 pt-3">
            <PWAInstallButton
              variant="card"
              onDismiss={() => {
                setInstallBannerDismissed(true);
                try {
                  sessionStorage.setItem('ap_install_banner_dismissed', '1');
                } catch {}
              }}
            />
          </div>
        )}

        <MyMatches
          matches={matches}
          joinedMatchIds={joinedMatchIds}
          onPageChange={onPageChange}
        />

        <EsportsGamesGrid
          matches={matches}
          onPageChange={onPageChange}
        />
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
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setSelectedPrizeMatch(null)}
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl relative overflow-hidden text-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-5 right-5">
                  <button
                    onClick={() => setSelectedPrizeMatch(null)}
                    className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] flex items-center justify-center text-[#16A34A] border border-[#BBF7D0] shrink-0">
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
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                      Total Prize Pool
                    </span>
                    <span className="text-base font-black text-[#16A34A] mt-0.5 block tabular-nums">
                      ₹{displayTotalPool}
                    </span>
                  </div>
                  <div className="pl-2 flex flex-col justify-center">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                      {isSurvival ? 'Per Kill Reward' : 'Per Kill'}
                    </span>
                    <span className="text-base font-black text-[#16A34A] mt-0.5 block tabular-nums">
                      {isSurvival ? '₹0' : `₹${selectedPrizeMatch.perKillAmount || 0}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#16A34A]">
                    {winnersCount > 1 ? `Top ${winnersCount} Players Rewarded` : `Top 1 Winner`}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">
                    Rank System
                  </span>
                </div>

                <div className="max-h-[40vh] overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
                  {validEntries.length > 0 ? (
                    validEntries.map(([pos, amount]) => {
                      const posNum = Number(pos);
                      const isFirst = posNum === 1;
                      
                      const rankTitle = isFirst 
                        ? '1st Place (Winner)' 
                        : posNum === 2
                        ? '2nd Place' 
                        : posNum === 3 
                        ? '3rd Place' 
                        : `Rank #${posNum}`;

                      return (
                        <div
                          key={pos}
                          className={`flex items-center justify-between p-3 rounded-2xl border ${
                            isFirst
                              ? 'bg-emerald-50 border-emerald-200 text-slate-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-black w-8 ${isFirst ? 'text-[#16A34A]' : 'text-slate-400'}`}>
                              #{pos}
                            </span>
                            <span className="text-[11px] font-black uppercase tracking-wider">
                              {rankTitle}
                            </span>
                          </div>
                          <span className="text-sm font-black text-[#16A34A] tabular-nums">₹{amount}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-[#16A34A] w-8">#1</span>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                          1st Place (Winner)
                        </span>
                      </div>
                      <span className="text-sm font-black text-[#16A34A] tabular-nums">₹{displayTotalPool}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedPrizeMatch(null)}
                  className="w-full h-11 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all mt-5 cursor-pointer shadow-xs"
                >
                  Close Details
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
            className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setSelectedResultsMatch(null)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh] text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5 relative">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] flex items-center justify-center text-[#16A34A] border border-[#BBF7D0]">
                    <Trophy size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 line-clamp-1">
                      {selectedResultsMatch.title}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Match Results View
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedResultsMatch(null)}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {loadingResults ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16">
                  <Loader2 size={32} className="text-[#16A34A] animate-spin mb-3" />
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    Fetching standings...
                  </p>
                </div>
              ) : matchResults ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-0.5">
                        Participants
                      </p>
                      <p className="text-sm font-black text-slate-900 tabular-nums">{matchResults.results?.length || 0}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-0.5">
                        Total Distributed
                      </p>
                      <p className="text-sm font-black text-[#16A34A] tabular-nums">
                        ₹{((matchResults.results || []).reduce((sum: number, r: any) => sum + (r.winningAmount || 0), 0) || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-1">
                    {matchResults.results
                      ?.sort((a: any, b: any) => {
                        const isSurvival =
                          matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale';
                        if (isSurvival) return a.rankOrKills - b.rankOrKills;
                        return b.rankOrKills - a.rankOrKills;
                      })
                      .map((res: any, idx: number) => {
                        const isWinner =
                          res.rankOrKills === 1 &&
                          (matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale');

                        return (
                          <div
                            key={`${res.userId}_${res.slot || idx}`}
                            className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                              isWinner
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black border ${
                                  isWinner
                                    ? 'bg-[#16A34A] text-white border-[#16A34A]'
                                    : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                              >
                                {matchResults.prizeType === 'perKill' ? 'K' : `#${res.rankOrKills}`}
                              </div>
                              <div>
                                <h4 className={`text-xs font-bold ${isWinner ? 'text-[#16A34A]' : 'text-slate-900'}`}>
                                  {res.ign || res.username}
                                </h4>
                                {matchResults.prizeType === 'perKill' && (
                                  <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">
                                    {res.rankOrKills} Kills
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className={`text-sm font-black tabular-nums ${
                                  res.winningAmount > 0 ? 'text-[#16A34A]' : 'text-slate-400'
                                }`}
                              >
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
                  <p className="text-xs text-slate-500">Results pending declaration</p>
                </div>
              )}

              <button
                onClick={() => setSelectedResultsMatch(null)}
                className="mt-5 w-full py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-xs"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowIdPass({ isOpen: false })}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl relative overflow-hidden text-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5 relative">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] flex items-center justify-center text-[#16A34A] border border-[#BBF7D0]">
                    <Star size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 line-clamp-1">
                      Room Credentials
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Entry strictly for joined players
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIdPass({ isOpen: false })}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 mb-5">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-[9px] font-black uppercase text-[#16A34A] tracking-wider mb-1">Room ID</p>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-black font-mono text-slate-900 tracking-wider">{showIdPass.roomId || 'PENDING'}</p>
                    <button
                      onClick={() => handleCopy(showIdPass.roomId || '')}
                      className="p-2 bg-white text-[#16A34A] border border-slate-200 rounded-xl hover:bg-[#ECFDF5] transition-colors cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-[9px] font-black uppercase text-[#16A34A] tracking-wider mb-1">Password</p>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-black font-mono text-slate-900 tracking-wider">{showIdPass.roomPass || 'PENDING'}</p>
                    <button
                      onClick={() => handleCopy(showIdPass.roomPass || '')}
                      className="p-2 bg-white text-[#16A34A] border border-slate-200 rounded-xl hover:bg-[#ECFDF5] transition-colors cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-amber-800 font-semibold bg-amber-50 p-3 rounded-xl border border-amber-200 mb-5 leading-relaxed">
                Notice: Sharing these credentials with non-joined players will result in an immediate match disqualification.
              </p>

              <button
                onClick={() => setShowIdPass({ isOpen: false })}
                className="w-full py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-xs"
              >
                Close Portal
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RulesModal
        isOpen={!!selectedRulesMatch || isGeneralRulesOpen}
        onClose={() => {
          setSelectedRulesMatch(null);
          setIsGeneralRulesOpen(false);
        }}
        section={selectedRulesMatch?.section || 'Battle Royale'}
        isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
        onJoin={() => onPageChange(Page.JOIN_MATCH, selectedRulesMatch?.id || '')}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onPageChange={onPageChange}
        user={user}
        joinedMatchIds={joinedMatchIds}
      />
    </div>
  );
}

