import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Trophy, Zap, Star } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { User } from '../types';
import SafeImage, { APP_LOGO_CIRCLE } from '../components/SafeImage';

type LeaderboardTab = 'weekly' | 'monthly';

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('weekly');
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<Record<string, User>>({});
  const [periodTransactions, setPeriodTransactions] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchTopUsers = async () => {
      try {
        let snap;
        try {
          snap = await getDocs(
            query(
              collection(db, 'users'),
              orderBy('stats.totalWinnings', 'desc'),
              limit(100)
            )
          );
        } catch {
          snap = await getDocs(query(collection(db, 'users'), limit(100)));
        }
        if (!isMounted) return;
        const usersMap = snap.docs.reduce((acc, d) => {
          acc[d.id] = { id: d.id, ...d.data() } as User;
          return acc;
        }, {} as Record<string, User>);
        setAllUsers(usersMap);
      } catch (error) {
        console.warn('Leaderboard users read notice:', error);
      }
    };
    fetchTopUsers();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchLeaderboardTransactions = async () => {
      setLoading(true);
      const now = new Date();
      let startDate: Date;
      
      if (activeTab === 'weekly') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(now.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
      }

      const q = query(
        collection(db, 'transactions'),
        where('type', '==', 'win'),
        where('createdAt', '>=', startDate),
        limit(250)
      );

      try {
        const snap = await getDocs(q);
        if (!isMounted) return;
        setPeriodTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Leaderboard trans error:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchLeaderboardTransactions();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  const displayPlayers = React.useMemo(() => {
    const userIds = new Set([
      ...Object.keys(allUsers),
      ...periodTransactions.map(t => t.userId)
    ]);

    const earningsMap: Record<string, number> = {};
    periodTransactions.forEach(t => {
      if (t.userId) {
        earningsMap[t.userId] = (earningsMap[t.userId] || 0) + (Number(t.amount) || 0);
      }
    });

    const lbData = Array.from(userIds).map(uid => {
      const user = allUsers[uid];
      const periodWin = earningsMap[uid] || 0;
      const totalWin = user?.stats?.totalWinnings || 0;
      
      return {
        ...(user || { id: uid, username: 'Unknown Gamer' }),
        periodWinnings: periodWin,
        totalWinnings: totalWin
      };
    });

    return lbData
      .sort((a, b) => {
        if (b.periodWinnings !== a.periodWinnings) {
          return b.periodWinnings - a.periodWinnings;
        }
        return (b.totalWinnings || 0) - (a.totalWinnings || 0);
      })
      .slice(0, 100);
  }, [allUsers, periodTransactions]);

  const topThree = displayPlayers.slice(0, 3);
  const remainingPlayers = displayPlayers.slice(3);
  const hasTopThree = topThree.length > 0;

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] text-slate-900 max-w-lg mx-auto overflow-hidden border-x border-slate-200">
      <header className="relative pt-10 pb-5 px-6 z-20 flex-none bg-white border-b border-slate-200 shadow-2xs">
        <div className="text-center mb-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 bg-[#ECFDF5] border border-[#BBF7D0] rounded-full mb-3"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#16A34A]">Elite Rankings</span>
          </motion.div>
          
          <h1 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter leading-none mb-2 text-slate-900">
            THE <span className="text-[#16A34A]">ARENA</span> KINGS
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] font-bold">
            Real-time Global Standings
          </p>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 relative">
          {(['weekly', 'monthly'] as LeaderboardTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all rounded-xl relative cursor-pointer ${
                activeTab === tab ? 'text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AnimatePresence>
                {activeTab === tab && (
                  <motion.div
                    layoutId="active-tab-glitter"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-[#16A34A] rounded-xl shadow-xs"
                  />
                )}
              </AnimatePresence>
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Star size={10} className={activeTab === tab ? 'fill-current' : ''} />
                {tab}
              </span>
            </button>
          ))}
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-5 pb-32 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 p-1 bg-white border border-[#BBF7D0] rounded-2xl shadow-sm"
            >
              <div className="w-full h-full rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center">
                <SafeImage src={APP_LOGO_CIRCLE} alt="Loading" className="w-full h-full" />
              </div>
            </motion.div>
            <div className="space-y-2 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 animate-pulse">Syncing Arena Data</p>
              <div className="w-32 h-1.5 bg-slate-200 rounded-full mx-auto overflow-hidden">
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-full h-full bg-[#16A34A]"
                />
              </div>
            </div>
          </div>
        ) : !hasTopThree ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 mb-6 relative">
              <SafeImage src={APP_LOGO_CIRCLE} alt="No Data" className="w-full h-full opacity-25 filter grayscale" />
            </div>
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-700 mb-2">No Rankings Yet</h3>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Be the first to dominate the arena</p>
          </div>
        ) : (
          <>
            {/* Podium Section */}
            <div className="flex items-end justify-center gap-2 sm:gap-4 pt-14 mb-12 px-2">
              {/* RANK 2 - LEFT */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex-1 flex flex-col items-center"
              >
                <div className="relative mb-4 group">
                  <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-[1.8rem] bg-white border-2 ${topThree[1] ? 'border-slate-300' : 'border-slate-200'} p-1 shadow-md`}>
                    <div className="w-full h-full rounded-[1.5rem] overflow-hidden bg-slate-50">
                      <SafeImage src={APP_LOGO_CIRCLE} className="w-full h-full" showLoader={false} />
                    </div>
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-slate-600 text-white rounded-xl flex items-center justify-center border-2 border-white text-[12px] font-black italic shadow-sm">2</div>
                </div>
                <div className="text-center w-full min-h-[40px]">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-700 truncate px-1">
                    {topThree[1]?.username || '---'}
                  </h4>
                  {topThree[1] && (
                    <span className="text-[14px] font-black italic text-[#16A34A] tracking-tighter flex items-center justify-center gap-1 tabular-nums">
                      <Zap size={10} /> ₹{topThree[1].periodWinnings || 0}
                    </span>
                  )}
                </div>
              </motion.div>

              {/* RANK 1 - CENTER */}
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-28 sm:w-32 flex flex-col items-center -mt-10 relative z-20"
              >
                <div className="relative mb-6 group">
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center justify-center"
                  >
                    <Crown size={44} className={`${topThree[0] ? 'text-amber-500' : 'text-slate-300'} fill-current`} />
                  </motion.div>

                  <div className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-[2.5rem] bg-white border-4 ${topThree[0] ? 'border-[#16A34A]' : 'border-slate-200'} p-1.5 shadow-lg ring-4 ring-emerald-100`}>
                    <div className="w-full h-full rounded-[2rem] overflow-hidden bg-slate-50">
                      <SafeImage src={APP_LOGO_CIRCLE} className="w-full h-full" showLoader={false} />
                    </div>
                  </div>

                  <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 w-11 h-11 ${topThree[0] ? 'bg-[#16A34A]' : 'bg-slate-400'} text-white rounded-2xl flex items-center justify-center border-4 border-white text-lg font-black shadow-md z-20`}>
                    <Trophy size={18} />
                  </div>
                </div>

                <div className="text-center w-full min-h-[50px]">
                  <h4 className={`text-[12px] font-black uppercase tracking-[0.15em] ${topThree[0] ? 'text-slate-900' : 'text-slate-400'} mb-1 truncate px-1`}>
                    {topThree[0]?.username || '---'}
                  </h4>
                  {topThree[0] && (
                    <div className="inline-flex items-center gap-2 px-4 py-1 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-lg font-black italic text-[#16A34A] tracking-tighter tabular-nums">₹{topThree[0].periodWinnings || 0}</span>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* RANK 3 - RIGHT */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="flex-1 flex flex-col items-center"
              >
                <div className="relative mb-4 group">
                  <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-[1.8rem] bg-white border-2 ${topThree[2] ? 'border-amber-600/50' : 'border-slate-200'} p-1 shadow-md`}>
                    <div className="w-full h-full rounded-[1.5rem] overflow-hidden bg-slate-50">
                      <SafeImage src={APP_LOGO_CIRCLE} className="w-full h-full" showLoader={false} />
                    </div>
                  </div>
                  <div className="absolute -bottom-2 -left-2 w-7 h-7 bg-amber-600 text-white rounded-xl flex items-center justify-center border-2 border-white text-[12px] font-black italic shadow-sm">3</div>
                </div>
                <div className="text-center w-full min-h-[40px]">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-700 truncate px-1">
                    {topThree[2]?.username || '---'}
                  </h4>
                  {topThree[2] && (
                    <span className="text-[14px] font-black italic text-[#16A34A] tracking-tighter flex items-center justify-center gap-1 tabular-nums">
                      <Zap size={10} /> ₹{topThree[2].periodWinnings || 0}
                    </span>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Top 100 List */}
            <div className="space-y-3 mb-10">
              <div className="flex items-center justify-between px-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hall of Fame</span>
                <div className="h-px bg-slate-200 flex-1 mx-4" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#16A34A]">Top 100</span>
              </div>

              {remainingPlayers.length > 0 ? (
                remainingPlayers.map((player, index) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: Math.min(index * 0.05, 0.5) }}
                    whileTap={{ scale: 0.98 }}
                    className="relative group h-20"
                  >
                    <div className="absolute inset-0 bg-white rounded-[1.5rem] border border-slate-200 group-hover:border-emerald-300 shadow-2xs transition-all duration-300" />
                    
                    <div className="relative h-full px-4 flex items-center justify-between z-10">
                      <div className="flex items-center gap-3.5">
                        <div className="w-8 flex items-center justify-center">
                          <span className="text-base font-black italic text-slate-500 group-hover:text-[#16A34A] transition-colors tabular-nums">
                            #{index + 4}
                          </span>
                        </div>

                        <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 p-1 group-hover:border-emerald-300 transition-colors">
                          <div className="w-full h-full rounded-xl overflow-hidden">
                            <SafeImage src={APP_LOGO_CIRCLE} className="w-full h-full" showLoader={false} />
                          </div>
                        </div>

                        <div>
                          <h4 className="text-[13px] font-black uppercase tracking-tight text-slate-900 group-hover:text-[#16A34A] transition-colors">
                            {player.username}
                          </h4>
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.15em]">Ranked Competitor</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <div className="px-3.5 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200">
                          <span className="text-[15px] font-black italic text-[#16A34A] tracking-tighter tabular-nums">
                            ₹{player.periodWinnings || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="py-12 bg-white rounded-[1.5rem] border border-dashed border-slate-200 text-center">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">More challengers needed</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
