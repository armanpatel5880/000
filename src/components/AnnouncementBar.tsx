import React from 'react';
import { Megaphone } from 'lucide-react';

interface AnnouncementBarProps {
  text?: string;
  onClick: () => void;
}

export default function AnnouncementBar({
  text = 'AP TOURNAMENT — MAIN RULES & TELEGRAM CHANNEL',
  onClick
}: AnnouncementBarProps) {
  return (
    <section className="px-4 sm:px-5 mt-2.5">
      <div
        onClick={onClick}
        className="w-full bg-white border-2 border-emerald-300/80 rounded-2xl overflow-hidden shadow-xs hover:border-[#16A34A] flex items-stretch cursor-pointer active:scale-[0.99] transition-all select-none"
      >
        {/* Left: Vibrant Emerald Block with Megaphone Icon */}
        <div className="w-12 sm:w-14 bg-gradient-to-br from-[#16A34A] to-[#15803D] flex items-center justify-center text-white shrink-0 py-2.5 sm:py-3 shadow-inner">
          <Megaphone size={18} className="transform -rotate-12 text-white drop-shadow-xs" />
        </div>

        {/* Right: Text Banner */}
        <div className="flex-1 bg-gradient-to-r from-emerald-50/70 via-white to-emerald-50/40 px-3.5 py-2 flex items-center overflow-hidden border-l border-emerald-200/80">
          <div className="w-full overflow-hidden whitespace-nowrap">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-800 truncate">
              <span className="text-[#16A34A] font-black mr-1.5">NOTICE:</span>
              {text}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
