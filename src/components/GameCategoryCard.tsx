import React from 'react';
import { motion } from 'motion/react';
import SafeImage from './SafeImage';

interface GameCategoryCardProps {
  id?: string;
  title: string;
  centerTitle?: string;
  bottomLabel?: string;
  badgeTitle?: string;
  image: string;
  playerCount: number;
  onClick: () => void;
}

export default function GameCategoryCard({
  title,
  centerTitle,
  bottomLabel,
  badgeTitle = 'FREE FIRE MAX',
  image,
  playerCount,
  onClick
}: GameCategoryCardProps) {
  const displayCenter = centerTitle || title;
  const displayBottom = bottomLabel || title;

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
      whileTap={{ scale: 0.96, transition: { duration: 0.1 } }}
      onClick={onClick}
      className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden border border-slate-200 hover:border-[#16A34A] hover:shadow-md cursor-pointer shadow-xs bg-white flex flex-col justify-between group select-none transition-all duration-300"
    >
      {/* Background Esports Artwork */}
      <SafeImage
        src={image}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover"
        imgClassName="group-hover:scale-105 transition-transform duration-500 object-cover w-full h-full"
      />

      {/* Gradient Scrim for artwork text contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/55 to-slate-900/20" />

      {/* Center Esports Banner Badge */}
      <div className="relative z-10 px-2 pt-2 flex flex-col items-center justify-center text-center my-auto">
        <span className="text-[6.5px] font-black uppercase tracking-[0.18em] text-white bg-[#16A34A] px-2 py-0.5 rounded mb-0.5 leading-none shadow-xs">
          {badgeTitle}
        </span>
        <h4 className="text-[10.5px] sm:text-xs font-black italic uppercase tracking-tight text-white leading-tight drop-shadow">
          {displayCenter}
        </h4>
        <span className="text-[7px] sm:text-[7.5px] font-black uppercase tracking-widest text-emerald-300 leading-none mt-0.5">
          TOURNAMENT
        </span>
      </div>

      {/* Bottom White Footer Bar: Title & Live Player Indicator */}
      <div className="relative z-10 bg-white/95 backdrop-blur-md px-2.5 py-1.5 border-t border-slate-200 flex items-center justify-between">
        <span className="text-[9.5px] sm:text-[10.5px] font-extrabold uppercase tracking-tight text-slate-900 truncate max-w-[62%]">
          {displayBottom}
        </span>

        {/* Live Active Player Count */}
        <div className="flex items-center gap-1 shrink-0 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
          <span className="text-[9px] sm:text-[10px] font-extrabold text-[#16A34A] tracking-tight leading-none tabular-nums">
            {playerCount > 0 ? playerCount : 'LIVE'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
