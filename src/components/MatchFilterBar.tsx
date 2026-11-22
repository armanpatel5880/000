import React from 'react';
import { SlidersHorizontal, ArrowUpDown, Clock, X } from 'lucide-react';

export type MatchTypeFilter = 'all' | 'Solo' | 'Duo' | 'Squad';
export type EntryFeeFilter = 'all' | 'low_to_high' | 'high_to_low' | 'free';
export type StartTimeFilter = 'all' | 'starting_soon' | 'today' | 'earliest';

export interface MatchFilterState {
  matchType: MatchTypeFilter;
  entryFee: EntryFeeFilter;
  startTime: StartTimeFilter;
}

interface MatchFilterBarProps {
  filters: MatchFilterState;
  onChange: (newFilters: MatchFilterState) => void;
  totalCount?: number;
  compact?: boolean;
}

export const INITIAL_FILTER_STATE: MatchFilterState = {
  matchType: 'all',
  entryFee: 'all',
  startTime: 'all',
};

export function filterAndSortMatches<T extends Record<string, any>>(
  matches: T[],
  filters: MatchFilterState
): T[] {
  let result = [...matches];

  // 1. Filter by Match Type (Solo, Duo, Squad)
  if (filters.matchType !== 'all') {
    const targetType = filters.matchType.toLowerCase();
    result = result.filter((m) => {
      const modeStr = (m.mode || '').toLowerCase();
      const sectionStr = (m.section || '').toLowerCase();
      const titleStr = (m.title || '').toLowerCase();

      if (targetType === 'solo') {
        return (
          modeStr.includes('solo') ||
          modeStr.includes('1v1') ||
          sectionStr.includes('solo') ||
          titleStr.includes('solo')
        );
      }
      if (targetType === 'duo') {
        return (
          modeStr.includes('duo') ||
          modeStr.includes('2v2') ||
          sectionStr.includes('duo') ||
          titleStr.includes('duo')
        );
      }
      if (targetType === 'squad') {
        return (
          modeStr.includes('squad') ||
          modeStr.includes('4v4') ||
          sectionStr.includes('squad') ||
          sectionStr.includes('clash') ||
          titleStr.includes('squad')
        );
      }
      return modeStr.includes(targetType) || sectionStr.includes(targetType) || titleStr.includes(targetType);
    });
  }

  // 2. Filter by Start Time
  const now = new Date().getTime();
  if (filters.startTime === 'starting_soon') {
    const twoHoursInMs = 2 * 60 * 60 * 1000;
    result = result.filter((m) => {
      if (!m.time && !m.date) return true;
      const t = new Date(m.time || m.date || '').getTime();
      if (isNaN(t)) return true;
      return t >= now && t <= now + twoHoursInMs;
    });
  } else if (filters.startTime === 'today') {
    const todayStr = new Date().toDateString();
    result = result.filter((m) => {
      if (!m.time && !m.date) return true;
      const d = new Date(m.time || m.date || '');
      if (isNaN(d.getTime())) return true;
      return d.toDateString() === todayStr;
    });
  }

  // 3. Entry Fee Filter (Free filter)
  if (filters.entryFee === 'free') {
    result = result.filter((m) => (m.entryFee || 0) === 0);
  }

  // 4. Sorting logic
  result.sort((a, b) => {
    if (filters.entryFee === 'low_to_high') {
      const feeA = a.entryFee !== undefined ? Number(a.entryFee) : 0;
      const feeB = b.entryFee !== undefined ? Number(b.entryFee) : 0;
      if (feeA !== feeB) return feeA - feeB;
    } else if (filters.entryFee === 'high_to_low') {
      const feeA = a.entryFee !== undefined ? Number(a.entryFee) : 0;
      const feeB = b.entryFee !== undefined ? Number(b.entryFee) : 0;
      if (feeA !== feeB) return feeB - feeA;
    }

    if (filters.startTime === 'earliest') {
      const timeA = new Date(a.time || a.date || 0).getTime();
      const timeB = new Date(b.time || b.date || 0).getTime();
      if (!isNaN(timeA) && !isNaN(timeB)) {
        return timeA - timeB;
      }
    }

    return 0;
  });

  return result;
}

export default function MatchFilterBar({
  filters,
  onChange,
  totalCount
}: MatchFilterBarProps) {
  const isFilterActive =
    filters.matchType !== 'all' || filters.entryFee !== 'all' || filters.startTime !== 'all';

  const handleClear = () => {
    onChange(INITIAL_FILTER_STATE);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs select-none space-y-3">
      {/* Top Header Row with Active Count & Clear Action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#ECFDF5] text-[#16A34A] rounded-lg border border-[#BBF7D0]">
            <SlidersHorizontal size={14} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-900">
            Filter Matches
          </span>
          {totalCount !== undefined && (
            <span className="text-[10px] font-bold text-[#16A34A] bg-[#ECFDF5] px-2 py-0.5 rounded-full border border-[#BBF7D0] tabular-nums">
              {totalCount} matches
            </span>
          )}
        </div>

        {isFilterActive && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-700 transition-colors cursor-pointer"
          >
            <X size={12} />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* 1. Match Type Pills */}
      <div>
        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
          Match Type
        </label>
        <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {(['all', 'Solo', 'Duo', 'Squad'] as const).map((type) => {
            const isActive = filters.matchType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ ...filters, matchType: type })}
                className={`py-1.5 px-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer text-center truncate ${
                  isActive
                    ? 'bg-[#16A34A] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                }`}
              >
                {type === 'all' ? 'All Types' : type}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Dropdowns */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
            <ArrowUpDown size={11} className="text-[#16A34A]" />
            <span>Entry Fee</span>
          </label>
          <div className="relative">
            <select
              value={filters.entryFee}
              onChange={(e) => onChange({ ...filters, entryFee: e.target.value as EntryFeeFilter })}
              className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-900 outline-none focus:border-[#16A34A] transition-colors cursor-pointer appearance-none"
            >
              <option value="all" className="bg-white text-slate-900">All Fees</option>
              <option value="low_to_high" className="bg-white text-slate-900">Low to High (₹)</option>
              <option value="high_to_low" className="bg-white text-slate-900">High to Low (₹)</option>
              <option value="free" className="bg-white text-slate-900">Free Matches Only</option>
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[10px]">
              ▼
            </div>
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
            <Clock size={11} className="text-[#16A34A]" />
            <span>Start Time</span>
          </label>
          <div className="relative">
            <select
              value={filters.startTime}
              onChange={(e) => onChange({ ...filters, startTime: e.target.value as StartTimeFilter })}
              className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-900 outline-none focus:border-[#16A34A] transition-colors cursor-pointer appearance-none"
            >
              <option value="all" className="bg-white text-slate-900">All Schedules</option>
              <option value="starting_soon" className="bg-white text-slate-900">Starting Soon (&lt; 2h)</option>
              <option value="today" className="bg-white text-slate-900">Today's Matches</option>
              <option value="earliest" className="bg-white text-slate-900">Earliest Start First</option>
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[10px]">
              ▼
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
