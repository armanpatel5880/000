import { Tournament } from '../types';
import { triggerMobileStatusBarNotification } from './mobileNotificationHelper';

export interface MatchCountdownStatus {
  remainingMs: number;
  totalSeconds: number;
  minutes: number;
  seconds: number;
  formattedCountdown: string;
  is15MinWindow: boolean;
  is5MinWindow: boolean;
  isStartingSoon: boolean;
  isLive: boolean;
  isPast: boolean;
}

/**
 * Accurately parses match start time and returns remaining milliseconds and countdown values.
 */
export function getMatchRemainingTime(timeStr?: string): MatchCountdownStatus {
  if (!timeStr) {
    return {
      remainingMs: -1,
      totalSeconds: 0,
      minutes: 0,
      seconds: 0,
      formattedCountdown: '--:--',
      is15MinWindow: false,
      is5MinWindow: false,
      isStartingSoon: false,
      isLive: false,
      isPast: true
    };
  }

  let matchTimestamp = NaN;
  try {
    matchTimestamp = new Date(timeStr).getTime();
  } catch {
    matchTimestamp = NaN;
  }

  if (isNaN(matchTimestamp)) {
    return {
      remainingMs: -1,
      totalSeconds: 0,
      minutes: 0,
      seconds: 0,
      formattedCountdown: '--:--',
      is15MinWindow: false,
      is5MinWindow: false,
      isStartingSoon: false,
      isLive: false,
      isPast: true
    };
  }

  const now = Date.now();
  const remainingMs = matchTimestamp - now;
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  const formattedCountdown = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;

  // 15-minute window: > 0 and <= 15 minutes
  const is15MinWindow = remainingMs > 0 && remainingMs <= 15 * 60 * 1000;
  // 5-minute urgent window: > 0 and <= 5 minutes
  const is5MinWindow = remainingMs > 0 && remainingMs <= 5 * 60 * 1000;
  const isStartingSoon = remainingMs > 0 && remainingMs <= 30 * 60 * 1000;
  // Live: between 0 and 45 minutes after scheduled start
  const isLive = remainingMs <= 0 && remainingMs >= -45 * 60 * 1000;
  const isPast = remainingMs < -45 * 60 * 1000;

  return {
    remainingMs,
    totalSeconds,
    minutes,
    seconds,
    formattedCountdown,
    is15MinWindow,
    is5MinWindow,
    isStartingSoon,
    isLive,
    isPast
  };
}

/**
 * Distinctive Esports Attention Sound (Dual Tone Arpeggio)
 */
export function playMatchAlertChime(urgency: '15min' | '5min' | 'general' = '15min') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    if (urgency === '5min') {
      // Rapid double alert for 5 minutes
      osc1.type = 'sawtooth';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc1.frequency.setValueAtTime(880, now + 0.12); // A5
      osc1.frequency.setValueAtTime(1046.5, now + 0.24); // C6

      osc2.frequency.setValueAtTime(329.63, now);
      osc2.frequency.setValueAtTime(440, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } else {
      // Uplifting 15-minute tournament chime
      osc1.type = 'sine';
      osc2.type = 'triangle';
      
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
      osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.3); // G5

      osc2.frequency.setValueAtTime(261.63, now); // C4
      osc2.frequency.exponentialRampToValueAtTime(392.0, now + 0.25);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.55);
      osc2.stop(now + 0.55);
    }
  } catch (err) {
    // Audio restriction fallback
  }
}

/**
 * Triggers vibration on mobile devices if supported
 */
export function triggerHapticFeedback(pattern: number[] = [250, 100, 250, 100, 400]) {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration error
    }
  }
}

/**
 * Helper to dispatch simulated 15-minute match alert for testing/demo
 */
export function dispatchSimulatedMatchAlert(customMatch?: Partial<Tournament>) {
  if (typeof window === 'undefined') return;
  const mockMatch: Tournament = {
    id: 'simulated_match_' + Date.now(),
    matchNumber: 104,
    title: 'Free Fire Grand Championship',
    gameId: 'freefire',
    entryFee: 20,
    prize: '₹600',
    prizePool: 600,
    maxPlayers: 48,
    totalSlots: 48,
    playersCount: 42,
    players: [],
    mode: 'Solo',
    section: 'Battle Royale',
    map: 'Bermuda',
    // Scheduled 14 minutes and 30 seconds from right now
    time: new Date(Date.now() + 14.5 * 60 * 1000).toISOString(),
    roomId: '894215',
    roomPassword: '777',
    status: 'upcoming',
    ...(customMatch || {})
  };

  const event = new CustomEvent('kg-simulate-match-alert', {
    detail: { match: mockMatch, urgency: '15min' }
  });
  window.dispatchEvent(event);
}
