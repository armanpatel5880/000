import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, User as UserIcon, Check, Loader2, X, AlertCircle, Sparkles, Trophy, Calendar, CheckCircle2 } from 'lucide-react';
import { Page, User as UserType, Tournament } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  doc, 
  serverTimestamp,
  onSnapshot,
  updateDoc,
  runTransaction
} from 'firebase/firestore';

interface JoinMatchProps {
  user: UserType;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
  onJoinSuccess: (matchId: string) => void;
}

// Fintech Emerald & White Wallet Illustration Component
function WalletIllustration() {
  return (
    <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 drop-shadow-sm">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Money Bills poking out */}
        <g transform="translate(18, 8) rotate(-12)">
          <rect x="0" y="0" width="34" height="24" rx="3" fill="#22C55E" stroke="#15803D" strokeWidth="1.5" />
          <circle cx="17" cy="12" r="4" fill="#ECFDF5" />
          <line x1="4" y1="4" x2="30" y2="4" stroke="#ECFDF5" strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <g transform="translate(32, 10) rotate(8)">
          <rect x="0" y="0" width="34" height="24" rx="3" fill="#4ADE80" stroke="#16A34A" strokeWidth="1.5" />
          <circle cx="17" cy="12" r="4" fill="#ECFDF5" />
        </g>

        {/* Wallet Back */}
        <rect x="12" y="24" width="76" height="56" rx="14" fill="#14532D" stroke="#15803D" strokeWidth="1.5" />
        
        {/* Wallet Body Main */}
        <rect x="10" y="28" width="78" height="54" rx="12" fill="#166534" stroke="#15803D" strokeWidth="1.5" />
        
        {/* Flap Stitching */}
        <path d="M16 38 H82" stroke="#86EFAC" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.8" />
        
        {/* Front Flap Clasp */}
        <path d="M56 46 H88 V66 H56 C50 66 50 46 56 46 Z" fill="#14532D" stroke="#86EFAC" strokeWidth="1.2" />
        <circle cx="78" cy="56" r="4" fill="#16A34A" stroke="#FFFFFF" strokeWidth="1.2" />
        <circle cx="78" cy="56" r="1.5" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export default function JoinMatch({ user, onPageChange, joinedMatchIds, onJoinSuccess }: JoinMatchProps) {
  const { id: matchId } = useParams();
  const isJoined = matchId ? joinedMatchIds.includes(matchId) : false;

  // Flow steps: 'select_position' | 'summary' | 'success'
  const [currentStep, setCurrentStep] = useState<'select_position' | 'summary' | 'success'>('select_position');
  
  // State for positions & IGN
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [inGameName, setInGameName] = useState('');
  const [ignModalOpen, setIgnModalOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [tempIgn, setTempIgn] = useState('');
  const [activeEditingSlotIndex, setActiveEditingSlotIndex] = useState<number>(0);
  const [teammateIGNs, setTeammateIGNs] = useState<string[]>(['', '', '']); // For multi-slot/teammates

  const [loading, setLoading] = useState(false);
  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [takenSlots, setTakenSlots] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Determine game key for IGN retrieval
  const getGameKey = (gameId?: string, section?: string) => {
    const g = (gameId || '').toLowerCase();
    const s = (section || '').toLowerCase();
    if (g.includes('freefire') || s.includes('battle royale') || s.includes('clash squad') || s.includes('lone wolf')) {
      return 'freefire';
    }
    if (g.includes('cod') || g.includes('call of duty')) {
      return 'codm';
    }
    if (g.includes('bgmi') || g.includes('pubg')) {
      return 'bgmi';
    }
    return g || 'freefire';
  };

  // Real-time listener for current match
  useEffect(() => {
    if (!matchId) return;

    const unsubscribe = onSnapshot(doc(db, 'matches', matchId), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Tournament;
        setMatchData({ id: doc.id, ...data });
        if (data.players) {
          setTakenSlots((data.players as any[]).map((p: any) => p.slot));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `matches/${matchId}`);
    });

    return () => unsubscribe();
  }, [matchId]);

  // Autofill Game-Specific IGN from Profile
  useEffect(() => {
    if (matchData && user) {
      const gameKey = getGameKey(matchData.gameId, matchData.section);
      const savedGameIGN = user.gameIGNs?.[gameKey] || user.gameIGNs?.[matchData.gameId] || user.ign || (user as any)[`${gameKey}IGN`];
      
      if (savedGameIGN && !inGameName) {
        setInGameName(savedGameIGN);
      }
    }
  }, [matchData, user]);

  const isUserJoined = (matchData?.players as any[])?.some((p: any) => p.userId === auth.currentUser?.uid) || isJoined;

  const totalSlots = matchData?.totalSlots || matchData?.maxPlayers || 48;
  const maxTeamSlots = matchData?.mode === 'Duo' ? 2 : matchData?.mode === 'Squad' ? 4 : 1;

  // Toggle position selection in Step 1
  const toggleSlot = (slotId: number) => {
    if (takenSlots.includes(slotId) || isUserJoined) return;

    if (maxTeamSlots > 1) {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots(selectedSlots.filter(id => id !== slotId));
      } else {
        if (selectedSlots.length < maxTeamSlots) {
          setSelectedSlots([...selectedSlots, slotId].sort((a, b) => a - b));
        } else {
          setSelectedSlots([slotId]);
        }
      }
    } else {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots([]);
      } else {
        setSelectedSlots([slotId]);
      }
    }
  };

  const handleProceedToSummary = () => {
    if (selectedSlots.length === 0) return;
    setCurrentStep('summary');
  };

  const openIgnModal = (slotIndex: number = 0) => {
    setActiveEditingSlotIndex(slotIndex);
    if (slotIndex === 0) {
      setTempIgn(inGameName || '');
    } else {
      setTempIgn(teammateIGNs[slotIndex - 1] || '');
    }
    setIgnModalOpen(true);
  };

  const handleSaveIgnModal = async () => {
    const trimmed = tempIgn.trim();
    if (!trimmed) {
      alert('Please enter a valid in-game name');
      return;
    }

    if (activeEditingSlotIndex === 0) {
      const previousIgn = inGameName;
      setInGameName(trimmed);
      if (auth.currentUser && trimmed !== previousIgn) {
        try {
          const gameKey = getGameKey(matchData?.gameId, matchData?.section);
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            [`gameIGNs.${gameKey}`]: trimmed,
            ign: trimmed
          });
        } catch (e) {
          console.warn('Could not auto-save IGN to profile:', e);
        }
      }
    } else {
      const updated = [...teammateIGNs];
      updated[activeEditingSlotIndex - 1] = trimmed;
      setTeammateIGNs(updated);
    }

    setIgnModalOpen(false);
  };

  const handleFinalJoin = async () => {
    if (loading || selectedSlots.length === 0 || !matchId || !auth.currentUser) return;
    
    if (!inGameName) {
      openIgnModal(0);
      return;
    }

    if (selectedSlots.length > 1) {
      for (let i = 0; i < selectedSlots.length - 1; i++) {
        if (!teammateIGNs[i]) {
          openIgnModal(i + 1);
          return;
        }
      }
    }

    if (isUserJoined) {
      alert('You have already joined this match!');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const uid = auth.currentUser.uid;
      const userRef = doc(db, 'users', uid);
      const matchRef = doc(db, 'matches', matchId);
      const regId = `${matchId}_${uid}`;
      const regRef = doc(db, 'registrations', regId);

      await runTransaction(db, async (transaction) => {
        const [userDoc, matchDoc, regDoc] = await Promise.all([
          transaction.get(userRef),
          transaction.get(matchRef),
          transaction.get(regRef)
        ]);

        if (!userDoc.exists()) throw new Error('User profile not found. Please log in again.');
        if (!matchDoc.exists()) throw new Error('Match not found.');

        const userData = userDoc.data() as UserType;
        const tournamentData = matchDoc.data() as Tournament;

        if (tournamentData.status === 'completed') {
          throw new Error('This match has already ended.');
        }

        const existingPlayers = (tournamentData.players as any[]) || [];
        if (regDoc.exists() || existingPlayers.some((p: any) => p.userId === uid)) {
          throw new Error('You have already joined this match.');
        }

        const entryFeePerSlot = Math.max(0, Number(tournamentData.entryFee || 0));
        const totalFee = entryFeePerSlot * selectedSlots.length;

        const deposit = userData.wallet?.deposit || 0;
        const winnings = userData.wallet?.winnings || 0;
        const bonus = userData.wallet?.bonus || 0;

        const maxBonusUsable = totalFee > 0 ? Math.min(bonus, Math.floor(totalFee * 0.10)) : 0;
        const totalPayable = deposit + winnings + maxBonusUsable;

        if (totalPayable < totalFee) {
          throw new Error('NOT_ENOUGH_BALANCE');
        }

        for (const slotId of selectedSlots) {
          if (existingPlayers.some((p: any) => p.slot === slotId)) {
            throw new Error(`Position ${slotId} was just taken. Please choose another position.`);
          }
        }

        const capacity = tournamentData.totalSlots || tournamentData.maxPlayers || 48;
        if (existingPlayers.length + selectedSlots.length > capacity) {
          throw new Error('Match does not have enough slots left.');
        }

        let bonusUsed = maxBonusUsable;
        let remainingFee = totalFee - bonusUsed;

        let depositUsed = 0;
        if (remainingFee > 0) {
          depositUsed = Math.min(deposit, remainingFee);
          remainingFee -= depositUsed;
        }

        let winningsUsed = 0;
        if (remainingFee > 0) {
          winningsUsed = Math.min(winnings, remainingFee);
          remainingFee -= winningsUsed;
        }

        const newDeposit = Math.max(0, deposit - depositUsed);
        const newWinnings = Math.max(0, winnings - winningsUsed);
        const newBonus = Math.max(0, bonus - bonusUsed);

        transaction.update(userRef, {
          "wallet.deposit": newDeposit,
          "wallet.winnings": newWinnings,
          "wallet.bonus": newBonus
        });

        const teamMembers = [
          { name: inGameName, isOwner: true }
        ];
        for (let i = 0; i < selectedSlots.length - 1; i++) {
          teamMembers.push({ name: teammateIGNs[i], isOwner: false } as any);
        }

        const playersToAdd = selectedSlots.map((slot, index) => ({
          userId: uid,
          username: user.username,
          ign: index === 0 ? inGameName : teammateIGNs[index - 1],
          slot: slot
        }));

        transaction.update(matchRef, {
          players: [...existingPlayers, ...playersToAdd],
          playersCount: existingPlayers.length + selectedSlots.length
        });

        transaction.set(regRef, {
          tournamentId: matchId,
          userId: uid,
          ign: inGameName,
          slots: selectedSlots,
          teamMembers: teamMembers,
          totalSlotsBooked: selectedSlots.length,
          joinedAt: serverTimestamp(),
          gameId: tournamentData.gameId || 'freefire',
          status: 'active'
        });

        if (totalFee > 0) {
          const transRef = doc(db, 'transactions', `entry_${matchId}_${uid}`);
          transaction.set(transRef, {
            userId: uid,
            type: 'entry',
            amount: totalFee,
            matchId: matchId,
            status: 'completed',
            title: `JOINED MATCH: ${tournamentData.title || tournamentData.displayId || '#000'} (${selectedSlots.length} Slots)`,
            createdAt: serverTimestamp()
          });
        }
      });

      onJoinSuccess(matchId);
      setShowSuccessModal(true);
      setCurrentStep('summary');
    } catch (error: any) {
      console.error('Registration failed:', error);
      const errorMsg = error.message || '';
      if (errorMsg === 'NOT_ENOUGH_BALANCE' || errorMsg.includes('Insufficient') || errorMsg.includes('balance')) {
        setErrorMessage('Insufficient wallet balance. Please recharge your wallet.');
        setTimeout(() => {
          onPageChange(Page.WALLET);
        }, 1500);
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to join match');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!matchData) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-slate-900">
        <Loader2 size={36} className="text-[#16A34A] animate-spin mb-4" />
        <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Loading Contest Positions...</p>
      </div>
    );
  }

  const entryFeePerSlot = matchData.entryFee !== undefined && matchData.entryFee !== null ? matchData.entryFee : 5;
  const totalAmount = entryFeePerSlot * Math.max(1, selectedSlots.length);
  const maxBonusUsable = totalAmount > 0 ? Math.min(user.wallet?.bonus || 0, Math.floor(totalAmount * 0.10)) : 0;
  const userBalance = ((user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + maxBonusUsable);

  // STEP 5: SUCCESS SCREEN
  if (currentStep === 'success') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between p-6 max-w-lg mx-auto select-none">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 180 }}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-50 border-2 border-[#16A34A] flex items-center justify-center text-[#16A34A] shadow-sm mb-8"
          >
            <Check size={52} className="stroke-[3.5]" />
          </motion.div>

          <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-900 px-4 max-w-xs leading-tight mb-2">
            {matchData.title || 'BR SOLO BATTLE'}
          </h2>

          <p className="text-sm font-black text-[#16A34A] tracking-wider uppercase">
            Match Joined Successfully
          </p>
        </div>

        <div className="w-full pt-6">
          <button
            onClick={() => onPageChange(Page.HOME)}
            className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-base font-black tracking-wider uppercase shadow-sm active:scale-98 transition-all cursor-pointer"
          >
            HOME
          </button>
        </div>
      </div>
    );
  }

  // STEP 2 & 4: JOINING MATCH SUMMARY SCREEN
  if (currentStep === 'summary') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between max-w-lg mx-auto select-none">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3.5 flex items-center shadow-2xs">
          <button
            onClick={() => setCurrentStep('select_position')}
            className="p-1 -ml-1 text-slate-600 hover:text-[#16A34A] active:scale-95 transition-transform cursor-pointer"
            aria-label="Back to positions"
          >
            <ChevronLeft size={26} className="stroke-[2.5]" />
          </button>
          <h1 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 flex-1 text-center pr-6 truncate">
            JOINING MATCH SUMMARY
          </h1>
        </header>

        <div className="p-4 sm:p-5 flex-1 space-y-4">
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-xs font-bold shadow-2xs">
              <AlertCircle size={18} className="text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Wallet Balance Card */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <WalletIllustration />
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Available Balance</span>
                <span className="text-lg font-black text-[#16A34A] tabular-nums">₹{userBalance.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={() => onPageChange(Page.ADD_MONEY)}
              className="px-3.5 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              Add Cash
            </button>
          </div>

          {/* Match Details Card */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs text-slate-500 font-bold uppercase">Match</span>
              <span className="text-xs font-black text-slate-900 truncate max-w-[200px]">{matchData.title || 'BR SOLO BATTLE'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs text-slate-500 font-bold uppercase">Positions Booked</span>
              <span className="text-xs font-black text-[#16A34A] tabular-nums">Position #{selectedSlots.join(', #')}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs text-slate-500 font-bold uppercase">Entry Fee</span>
              <span className="text-xs font-black text-slate-900 tabular-nums">₹{entryFeePerSlot} x {selectedSlots.length} = ₹{totalAmount}</span>
            </div>
            {maxBonusUsable > 0 && (
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 text-[#16A34A]">
                <span className="text-xs font-bold uppercase">Bonus Used (10%)</span>
                <span className="text-xs font-black tabular-nums">-₹{maxBonusUsable}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-700 font-black uppercase">Total Payable</span>
              <span className="text-sm font-black text-[#16A34A] tabular-nums">₹{Math.max(0, totalAmount - maxBonusUsable)}</span>
            </div>
          </div>

          {/* Player IGN Form */}
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#16A34A]">Player Credentials</h3>
            
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                In-Game Name (Position #{selectedSlots[0]})
              </label>
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-900">{inGameName || 'No IGN Set'}</span>
                <button
                  onClick={() => openIgnModal(0)}
                  className="text-[10px] font-black uppercase text-[#16A34A] hover:underline cursor-pointer"
                >
                  {inGameName ? 'Edit' : 'Add IGN'}
                </button>
              </div>
            </div>

            {selectedSlots.length > 1 && selectedSlots.slice(1).map((slot, idx) => (
              <div key={slot}>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Teammate #{idx + 2} IGN (Position #{slot})
                </label>
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-xs font-bold text-slate-900">{teammateIGNs[idx] || 'No Teammate IGN'}</span>
                  <button
                    onClick={() => openIgnModal(idx + 1)}
                    className="text-[10px] font-black uppercase text-[#16A34A] hover:underline cursor-pointer"
                  >
                    {teammateIGNs[idx] ? 'Edit' : 'Add IGN'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={() => setCurrentStep('select_position')}
              disabled={loading}
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-black text-xs tracking-wider uppercase active:scale-95 transition-transform cursor-pointer"
            >
              CANCEL
            </button>
            <button
              onClick={handleFinalJoin}
              disabled={loading}
              className="flex-1 py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl text-xs tracking-wider uppercase shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 size={16} className="animate-spin text-white" /> : <span>CONFIRM & JOIN</span>}
            </button>
          </div>
        </div>

        {/* IGN Modal Overlay */}
        <AnimatePresence>
          {ignModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setIgnModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                className="w-full max-w-xs bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-[#16A34A] text-white text-center py-3.5 px-4 font-black text-sm uppercase tracking-wider">
                  ENTER IN-GAME NAME
                </div>
                <div className="p-5 text-slate-900">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">
                    EXACT FREE FIRE IGN {activeEditingSlotIndex > 0 ? `(PLAYER ${activeEditingSlotIndex + 1})` : ''}
                  </label>
                  <div className="relative mb-3">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <UserIcon size={18} />
                    </div>
                    <input
                      type="text"
                      value={tempIgn}
                      onChange={(e) => setTempIgn(e.target.value)}
                      placeholder="e.g. OP_GAMER_99"
                      autoFocus
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] rounded-xl text-sm font-bold text-slate-900 outline-none transition-all"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveIgnModal();
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => setIgnModalOpen(false)}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleSaveIgnModal}
                      className="flex-1 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-xs cursor-pointer"
                    >
                      SAVE
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // STEP 1: SELECT MATCH POSITION SCREEN
  const positions = Array.from({ length: totalSlots }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between max-w-lg mx-auto select-none">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3.5 flex items-center shadow-2xs">
        <button
          onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
          className="p-1 -ml-1 text-slate-600 hover:text-[#16A34A] active:scale-95 transition-transform cursor-pointer"
          aria-label="Back to tournaments"
        >
          <ChevronLeft size={26} className="stroke-[2.5]" />
        </button>
        <h1 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 flex-1 text-center pr-6 truncate">
          {matchData.title || 'BR SOLO BATTLE'}
        </h1>
      </header>

      {/* Positions Area */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col">
        <div className="bg-[#16A34A] text-white text-center py-2.5 px-4 font-black text-xs sm:text-sm uppercase tracking-wider rounded-t-2xl shadow-2xs">
          SELECT MATCH POSITION
        </div>

        <div className="bg-white border-x border-b border-slate-200 rounded-b-2xl p-4 sm:p-5 shadow-xs flex-1 max-h-[68vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-4 gap-2.5 sm:gap-3.5">
            {positions.map((pos) => {
              const isOccupied = takenSlots.includes(pos);
              const isSelected = selectedSlots.includes(pos);

              return (
                <div
                  key={pos}
                  onClick={() => toggleSlot(pos)}
                  className={`flex items-center justify-between px-2.5 py-2.5 rounded-xl border transition-all select-none ${
                    isOccupied
                      ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-60'
                      : isSelected
                      ? 'bg-emerald-50 border-2 border-[#16A34A] shadow-xs cursor-pointer'
                      : 'bg-white border-slate-200 hover:border-[#16A34A] hover:bg-[#ECFDF5]/40 cursor-pointer active:scale-95'
                  }`}
                >
                  <span className={`text-xs sm:text-sm font-bold tabular-nums ${
                    isOccupied ? 'text-slate-400' : isSelected ? 'text-[#16A34A] font-black' : 'text-slate-800'
                  }`}>
                    {pos}
                  </span>

                  <div
                    className={`w-5 h-5 rounded-[5px] flex items-center justify-center shrink-0 transition-all ${
                      isOccupied
                        ? 'bg-slate-200 border border-slate-300'
                        : isSelected
                        ? 'bg-[#16A34A] border-2 border-[#16A34A] text-white'
                        : 'border-2 border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check size={13} className="stroke-[3.5]" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Large JOIN NOW Button */}
      <div className="p-4 sm:p-5 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
        <button
          onClick={handleProceedToSummary}
          disabled={selectedSlots.length === 0}
          className={`w-full py-4 rounded-xl text-base font-black uppercase tracking-wider transition-all ${
            selectedSlots.length > 0
              ? 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm active:scale-98 cursor-pointer'
              : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          JOIN NOW
        </button>
      </div>

      {/* SUCCESS POP-UP MODAL OVERLAY */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => onPageChange(Page.HOME)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 25 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 text-slate-900 shadow-2xl text-center relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative mb-5 flex items-center justify-center mt-2">
                <div className="absolute w-20 h-20 rounded-full bg-emerald-200/50 animate-ping opacity-60 pointer-events-none" />
                <div className="relative w-16 h-16 rounded-full bg-emerald-50 border-2 border-[#16A34A] flex items-center justify-center text-[#16A34A] shadow-xs">
                  <Check size={36} className="stroke-[3.5]" />
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] font-black text-[#16A34A] uppercase tracking-widest mb-2">
                <Sparkles size={12} />
                <span>REGISTRATION CONFIRMED</span>
              </div>

              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-900 mb-1">
                MATCH JOINED SUCCESSFULLY!
              </h2>
              <p className="text-xs text-slate-500 font-medium mb-5 px-2">
                You are registered for <span className="text-[#16A34A] font-bold">{matchData.title || 'BR SOLO BATTLE'}</span>.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2.5 mb-6 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold text-[11px] uppercase">Contest</span>
                  <span className="font-extrabold text-slate-900 truncate max-w-[170px]">{matchData.title || 'BR BATTLE'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold text-[11px] uppercase">Booked Position</span>
                  <span className="font-black text-[#16A34A] tabular-nums">Position #{selectedSlots.join(', #')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold text-[11px] uppercase">In-Game Name</span>
                  <span className="font-extrabold text-slate-900 truncate max-w-[150px]">{inGameName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold text-[11px] uppercase">Entry Fee Paid</span>
                  <span className="font-black text-[#16A34A] tabular-nums">₹{totalAmount}</span>
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => onPageChange(Page.HOME)}
                  className="w-full py-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-sm active:scale-95 transition-transform cursor-pointer"
                >
                  GO TO HOME
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
