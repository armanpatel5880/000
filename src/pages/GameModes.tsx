import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Gamepad2, PlayCircle, Star, ShieldCheck, Loader2 } from 'lucide-react';
import { GAMES } from '../constants';
import { Page } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';

interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface GameModesProps {
  onPageChange: (page: Page, id?: string) => void;
}

export default function GameModes({ onPageChange }: GameModesProps) {
  const { gameId } = useParams<{ gameId: string }>();
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);
  
  const game = GAMES.find(g => g.id === gameId);

  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchModes = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'gameModes'),
          where('gameId', '==', gameId),
          orderBy('order', 'asc'),
          limit(30)
        );
        const snapshot = await getDocs(q);
        if (!isMounted) return;
        const fetchedModes = snapshot.docs.map(doc => ({ ...doc.data() } as GameMode));
        setModes(fetchedModes);
      } catch (error) {
        if (isMounted) {
          handleFirestoreError(error, OperationType.LIST, 'gameModes');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchModes();

    return () => {
      isMounted = false;
    };
  }, [gameId]);

  if (!game) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-5 text-slate-900">
        <div className="text-center">
          <Gamepad2 size={48} className="mx-auto mb-4 text-[#16A34A]" />
          <p className="text-slate-500 mb-4 font-bold uppercase tracking-widest text-xs">Arena not found</p>
          <button 
            onClick={() => onPageChange(Page.HOME)}
            className="text-[#16A34A] font-black uppercase tracking-[0.2em] text-xs cursor-pointer hover:underline"
          >
            Return to Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-32 max-w-lg mx-auto overflow-x-hidden">
      {/* Header Area */}
      <div className="relative pt-6 pb-8 px-5 bg-white border-b border-slate-200 mb-5">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => onPageChange(Page.HOME)}
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
            >
              <ChevronLeft size={18} />
            </motion.button>
            
            <div className="text-center">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#16A34A] mb-1">
                {game ? `${game.title} ARENA`.toUpperCase() : 'GAMING ARENA'}
              </h2>
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#16A34A]">Servers Optimal</span>
              </div>
            </div>

            <div className="w-10" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-1.5 text-slate-900">
              Choose Your <span className="text-[#16A34A]">Mode</span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[240px] mx-auto">
              Select a category to view available tournaments
            </p>
          </motion.div>
        </div>
      </div>

      <div className="px-4">
        {/* Modes Grid - 3 Columns Square Grid */}
        <div className="grid grid-cols-3 gap-2.5 pb-10">
          {loading ? (
            Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-white border border-slate-200 rounded-2xl animate-pulse" />
            ))
          ) : modes.length === 0 ? (
            <div className="col-span-3 py-20 text-center">
              <Star size={40} className="mx-auto mb-3 text-slate-300" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">No Active Categories</p>
            </div>
          ) : (
            modes.map((mode, index) => (
              <motion.div
                key={mode.id}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onPageChange(Page.TOURNAMENTS, `${game.id}?mode=${mode.id}`)}
                className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-200 hover:border-[#16A34A] cursor-pointer bg-white shadow-xs hover:shadow-md transition-all"
              >
                <SafeImage 
                  src={mode.image || game?.image || 'https://i.ibb.co/v4v8Q5N/freefire.jpg'} 
                  alt={mode.title} 
                  className="absolute inset-0 w-full h-full"
                  imgClassName="transition-transform duration-500 group-hover:scale-110"
                  showLoader={false}
                />
                
                <div className="absolute inset-0 border-2 border-[#16A34A]/0 group-hover:border-[#16A34A] rounded-2xl transition-all duration-300 z-20 pointer-events-none" />
                
                <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent z-10" />
                
                <div className="absolute inset-x-0 bottom-0 p-2 z-30 text-center">
                  <h3 className="text-[10px] sm:text-[11px] font-black text-white uppercase tracking-tight leading-tight group-hover:text-emerald-300 transition-colors truncate drop-shadow">
                    {mode.title}
                  </h3>
                  <p className="text-[7px] font-bold text-slate-300 uppercase tracking-wider leading-none mt-0.5 truncate">
                    {mode.subtitle || 'Arena'}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

