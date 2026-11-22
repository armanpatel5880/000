import React from 'react';
import { RefreshCw, Calendar, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { Page, Tournament } from '../types';
import { getMatchRemainingTime } from '../utils/matchAlertHelper';

interface MyMatchesProps {
  matches?: Tournament[];
  joinedMatchIds?: string[];
  onPageChange: (page: Page, param?: string) => void;
}

export default function MyMatches({ matches = [], joinedMatchIds = [], onPageChange }: MyMatchesProps) {
  const imminentCount = matches.filter(m => 
    joinedMatchIds.includes(m.id) && 
    m.status !== 'completed' && 
    getMatchRemainingTime(m.time).is15MinWindow
  ).length;
  const cards = [
    {
      id: 'ongoing',
      title: 'Ongoing',
      type: 'ongoing',
      actionParam: 'freefire?status=ongoing'
    },
    {
      id: 'upcoming',
      title: 'Upcoming',
      type: 'upcoming',
      actionParam: 'freefire?status=upcoming'
    },
    {
      id: 'completed',
      title: 'Completed',
      type: 'completed',
      actionParam: 'freefire?status=completed'
    }
  ];

  return (
    <section className="px-4 sm:px-5 mt-5">
      <h3 className="text-center text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider mb-3">
        My <span className="text-[#16A34A]">Matches</span>
      </h3>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
        {cards.map((card) => {
          return (
            <motion.div
              key={card.id}
              whileHover={{ scale: 1.02, y: -2, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onPageChange(Page.TOURNAMENTS, card.actionParam)}
              className="bg-white hover:bg-emerald-50/40 rounded-2xl py-4 px-2 text-center cursor-pointer shadow-xs hover:shadow-[0_4px_20px_rgba(22,163,74,0.12)] transition-all flex flex-col items-center justify-center gap-2 border-2 border-emerald-100 hover:border-[#16A34A] group select-none aspect-[1/0.95]"
            >
              {card.type === 'ongoing' && (
                <div className="w-10 h-10 rounded-full bg-[#ECFDF5] border-2 border-[#BBF7D0] flex items-center justify-center text-[#16A34A] group-hover:rotate-180 transition-transform duration-500 shadow-2xs">
                  <RefreshCw size={20} className="stroke-[2.5] text-[#16A34A]" />
                </div>
              )}

              {card.type === 'upcoming' && (
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-[#16A34A] flex items-center justify-center text-white shadow-xs">
                    <Calendar size={20} className="stroke-[2.5]" />
                  </div>
                  {imminentCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 px-1.5 py-0.5 rounded-full bg-[#16A34A] text-white text-[8px] font-black uppercase tracking-tight shadow-xs animate-bounce">
                      Soon
                    </span>
                  )}
                </div>
              )}

              {card.type === 'completed' && (
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#16A34A]">
                  <Check size={22} className="stroke-[3]" />
                </div>
              )}

              <span className="text-xs font-extrabold text-slate-800 group-hover:text-[#16A34A] tracking-tight leading-none transition-colors">
                {card.title}
              </span>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
