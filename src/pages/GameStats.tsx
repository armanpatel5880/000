import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Sword, TrendingUp, History, Gamepad2, Loader2, IndianRupee } from 'lucide-react';
import { Page, User, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';

interface GameStatsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function GameStats({ user, onPageChange }: GameStatsProps) {
  const [history, setHistory] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user.id) {
        setLoading(false);
        return;
      }
      try {
        const q = query(
          collection(db, 'registrations'),
          where('userId', '==', user.id),
          orderBy('joinedAt', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);
        
        const tournamentPromises = snap.docs.map(async (pDoc) => {
          const tData = pDoc.data();
          const tDoc = await getDoc(doc(db, 'matches', tData.tournamentId));
          if (tDoc.exists()) {
            return { id: tDoc.id, ...tDoc.data() } as Tournament;
          }
          const legacyTDoc = await getDoc(doc(db, 'tournaments', tData.tournamentId));
          return { id: legacyTDoc.id, ...legacyTDoc.data() } as Tournament;
        });

        const tournaments = await Promise.all(tournamentPromises);
        setHistory(tournaments.filter(t => t.title));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'registrations');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user.id]);

  const stats = user.stats || { matchesPlayed: 0, totalWins: 0, totalKills: 0, totalWinnings: 0 };
  const matchesPlayed = stats.matchesPlayed || 0;
  const totalWins = stats.totalWins || 0;
  const totalKills = stats.totalKills || 0;
  const totalWinnings = stats.totalWinnings || 0;

  const winRate = matchesPlayed > 0 
    ? ((totalWins / matchesPlayed) * 100).toFixed(1) 
    : '0.0';

  return (
    <div className="pb-24 max-w-lg mx-auto bg-[#F8FAFC] min-h-screen text-slate-900 border-x border-slate-200">
      <div className="px-5 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => onPageChange(Page.PROFILE)}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-[#16A34A] hover:border-emerald-300 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-slate-900 leading-none">
              Game <span className="text-[#16A34A]">Statistics</span>
            </h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">Warrior's Performance Metrics</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
           <StatCard icon={Gamepad2} label="Matches" value={matchesPlayed.toString()} color="text-[#16A34A]" />
           <StatCard icon={Trophy} label="Wins" value={totalWins.toString()} color="text-[#16A34A]" />
           <StatCard icon={Sword} label="Kills" value={totalKills.toString()} color="text-[#16A34A]" />
           <StatCard icon={TrendingUp} label="Win Rate" value={`${winRate}%`} color="text-[#16A34A]" />
        </div>

        <div className="p-6 bg-white border border-slate-200 rounded-[2rem] mb-8 shadow-xs">
           <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Lifetime Earnings</span>
              <IndianRupee size={16} className="text-[#16A34A]" />
           </div>
           <div className="text-3xl font-black italic text-[#16A34A] leading-none tabular-nums">
             ₹{(totalWinnings || 0).toLocaleString()}
           </div>
        </div>

        {/* Match History */}
        <div className="space-y-4">
           <div className="flex items-center gap-3 px-1">
              <History size={16} className="text-[#16A34A]" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Match History</h3>
           </div>

           {loading ? (
             <div className="py-20 flex flex-col items-center justify-center">
                <Loader2 className="text-[#16A34A] animate-spin mb-4" size={32} />
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 italic">Retrieving battle logs...</p>
             </div>
           ) : history.length === 0 ? (
             <div className="py-12 bg-white border border-slate-200 border-dashed rounded-3xl flex flex-col items-center justify-center text-center px-8">
                <History size={32} className="text-slate-300 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">No matches history found</p>
             </div>
           ) : (
             history.map((t, idx) => (
                <div key={t.id + idx} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 shadow-2xs">
                   <div className="w-12 h-12 bg-[#ECFDF5] rounded-xl border border-[#BBF7D0] flex items-center justify-center text-[#16A34A]">
                      <Gamepad2 size={24} />
                   </div>
                   <div className="flex-1">
                      <h4 className="text-[11px] font-black uppercase tracking-tight text-slate-900 line-clamp-1">{t.title}</h4>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{t.section} • {t.displayId}</p>
                   </div>
                   <div className="text-right">
                      <span className="text-[10px] font-black text-slate-500">ENTRY</span>
                      <p className="text-[11px] font-bold text-[#16A34A] tabular-nums">₹{t.entryFee}</p>
                   </div>
                </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="p-6 bg-white border border-slate-200 rounded-3xl relative overflow-hidden group shadow-2xs hover:border-emerald-300 transition-all">
       <div className={`absolute top-0 right-0 p-4 ${color} opacity-10 group-hover:opacity-20 transition-opacity`}>
          <Icon size={40} />
       </div>
       <div className={`w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center ${color} mb-4`}>
          <Icon size={14} />
       </div>
       <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1 leading-none">{label}</div>
       <div className="text-xl font-black italic text-slate-900 uppercase leading-none tabular-nums">{value}</div>
    </div>
  );
}
