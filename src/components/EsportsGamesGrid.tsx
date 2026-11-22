import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Page, Tournament } from '../types';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import SafeImage from './SafeImage';

interface GameModeItem {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  image?: string;
  gameId?: string;
  order?: number;
}

interface EsportsGamesGridProps {
  matches?: Tournament[];
  onPageChange: (page: Page, param?: string) => void;
}

const DEFAULT_GAME_MODES: GameModeItem[] = [
  {
    id: 'br_squad',
    title: 'BR SQUAD',
    subtitle: 'Battle Royale',
    category: 'Battle Royale',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'cs_squad',
    title: 'CLASH SQUAD',
    subtitle: '4v4 Arena',
    category: 'Clash Squad',
    image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'lone_wolf_solo',
    title: 'LONE WOLF',
    subtitle: '1v1 / 2v2',
    category: 'Lone Wolf',
    image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'br_solo',
    title: 'BR SOLO',
    subtitle: 'Battle Royale',
    category: 'Battle Royale',
    image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'br_duo',
    title: 'BR DUO',
    subtitle: 'Battle Royale',
    category: 'Battle Royale',
    image: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'custom_room',
    title: 'CUSTOM ROOM',
    subtitle: 'Special Scrims',
    category: 'Custom Room',
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop',
  },
];

export default function EsportsGamesGrid({ onPageChange }: EsportsGamesGridProps) {
  const [modes, setModes] = useState<GameModeItem[]>(DEFAULT_GAME_MODES);

  useEffect(() => {
    const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const fetched = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as GameModeItem[];
          setModes(fetched);
        }
      },
      (error) => {
        console.warn('Using default esports modes due to snapshot error:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const displayModes = modes.length > 0 ? modes : DEFAULT_GAME_MODES;

  return (
    <section className="px-4 sm:px-5 mt-6 mb-6">
      {/* Section Title */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-wide uppercase">
          Esports <span className="text-[#16A34A]">Arenas & Modes</span>
        </h3>
        <button
          onClick={() => onPageChange(Page.GAME_MODES, 'freefire')}
          className="text-[10px] font-black uppercase text-[#16A34A] hover:text-[#15803D] tracking-widest transition-colors cursor-pointer"
        >
          View All
        </button>
      </div>

      {/* 3-Column Arena Cards Grid */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {displayModes.map((mode, index) => {
          const modeImage = mode.image || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop';
          const targetParam = `freefire?mode=${mode.id}`;

          return (
            <motion.div
              key={mode.id || index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onPageChange(Page.TOURNAMENTS, targetParam)}
              className="group relative aspect-square rounded-2xl overflow-hidden border-2 border-emerald-100 cursor-pointer bg-white shadow-xs hover:shadow-[0_4px_20px_rgba(22,163,74,0.18)] hover:border-[#16A34A] transition-all"
            >
              {/* Background Image */}
              <SafeImage
                src={modeImage}
                alt={mode.title}
                className="absolute inset-0 w-full h-full"
                imgClassName="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                showLoader={false}
              />

              {/* Royal Blue Hover Ring */}
              <div className="absolute inset-0 border-2 border-[#16A34A]/0 group-hover:border-[#16A34A] rounded-2xl transition-all duration-300 z-20 pointer-events-none" />

              {/* Bottom Dark Gradient for Text Contrast */}
              <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent z-10" />

              {/* Mode Details Overlay */}
              <div className="absolute inset-x-0 bottom-0 p-2 z-30 text-center flex flex-col justify-end">
                <h4 className="text-[10px] sm:text-[11px] font-black text-white uppercase tracking-tight leading-tight group-hover:text-emerald-300 transition-colors truncate drop-shadow">
                  {mode.title}
                </h4>
                <p className="text-[7px] sm:text-[8px] font-bold text-slate-300 uppercase tracking-wider leading-none mt-0.5 truncate">
                  {mode.subtitle || mode.category || 'Arena'}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
