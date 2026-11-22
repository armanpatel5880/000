import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ArrowLeft, Save, Loader2, Layers, ChevronDown, Image as ImageIcon, Upload, Trash2, CheckCircle2, Lock 
} from 'lucide-react';
import { Page, Tournament, User } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { GameMode } from './AdminModes';
import { uploadOriginalImage } from '../utils/imageCompressor';
import { hasAdminPanelAccess, hasSectionPermission } from '../utils/adminPermissions';

interface AdminEditMatchProps {
  user?: User | null;
  onPageChange: (page: Page) => void;
}

const DEFAULT_MODES_FALLBACK: GameMode[] = [
  { id: 'br_solo', gameId: 'freefire', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '', order: 1 },
  { id: 'br_duo', gameId: 'freefire', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '', order: 2 },
  { id: 'br_squad', gameId: 'freefire', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: '', order: 3 },
  { id: 'cs_solo', gameId: 'freefire', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '', order: 4 },
  { id: 'cs_duo', gameId: 'freefire', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '', order: 5 },
  { id: 'cs_squad', gameId: 'freefire', title: 'CS SQUAD', subtitle: 'Clash Squad', category: 'Clash Squad', image: '', order: 6 },
  { id: 'lone_wolf_solo', gameId: 'freefire', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '', order: 7 },
  { id: 'lone_wolf_duo', gameId: 'freefire', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '', order: 8 },
  { id: 'custom_room', gameId: 'freefire', title: 'CUSTOM ROOM', subtitle: 'Special Tournament', category: 'Custom Room', image: '', order: 9 },
];

const PRESET_MATCH_THUMBNAILS = [
  {
    name: 'Battle Royale Esports',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Clash Squad 4v4',
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Lone Wolf 1v1',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Headshot / Sniper',
    url: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Survival Arena',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Tournament Stage',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop'
  }
];

export default function AdminEditMatch({ user, onPageChange }: AdminEditMatchProps) {
  const { id: matchId } = useParams();
  const canManageMatches = hasSectionPermission(user, 'matches', auth.currentUser?.email, auth.currentUser?.uid);
  const canAccessPanel = hasAdminPanelAccess(user, auth.currentUser?.email, auth.currentUser?.uid);
  const [loading, setLoading] = useState(canManageMatches);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableModes, setAvailableModes] = useState<GameMode[]>(DEFAULT_MODES_FALLBACK);
  const [loadingModes, setLoadingModes] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matchForm, setMatchForm] = useState({
    title: '',
    gameId: 'freefire',
    selectedModeDocId: 'br_solo',
    modeId: 'br_solo',
    image: '',
    entryFee: 0,
    prize: '',
    prizePool: 0,
    maxPlayers: 48,
    totalSlots: 48,
    time: '',
    map: '',
    mode: 'Solo',
    section: 'Battle Royale',
    prizeType: 'survival' as 'perKill' | 'survival',
    perKillAmount: 0,
    winnersCount: 1,
    prizeDistribution: {} as Record<number, number>,
    positionWinnersCount: 0,
    positionPrizeDistribution: {} as Record<number, number>
  });

  const GAME_MAPS = {
    'freefire': ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NeXTerra', 'Bermuda Remastered']
  };

  useEffect(() => {
    if (!canManageMatches) return;
    const fetchGameModes = async () => {
      setLoadingModes(true);
      try {
        const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ ...d.data() }) as GameMode);
          const filtered = list.filter(m => !matchForm.gameId || m.gameId === matchForm.gameId);
          if (filtered.length > 0) {
            setAvailableModes(filtered);
          }
        }
      } catch (err) {
        console.warn('Could not fetch custom game modes, using presets:', err);
      } finally {
        setLoadingModes(false);
      }
    };

    fetchGameModes();
  }, [matchForm.gameId, canManageMatches]);

  useEffect(() => {
    if (!canManageMatches) {
      setLoading(false);
      return;
    }
    if (!matchId) {
      onPageChange(Page.ADMIN);
      return;
    }

    const fetchMatch = async () => {
      try {
        const matchDoc = await getDoc(doc(db, 'matches', matchId));
        if (matchDoc.exists()) {
          const data = matchDoc.data() as Tournament;
          setMatchForm({
            title: data.title || '',
            gameId: data.gameId || 'freefire',
            selectedModeDocId: data.modeId || 'br_solo',
            modeId: data.modeId || 'br_solo',
            image: data.image || '',
            entryFee: data.entryFee || 0,
            prize: data.prize || '',
            prizePool: data.prizePool || 0,
            maxPlayers: data.maxPlayers || 48,
            totalSlots: data.totalSlots || 48,
            time: data.time || '',
            map: data.map || '',
            mode: data.mode || 'Solo',
            section: data.section || 'Battle Royale',
            prizeType: data.prizeType || 'survival',
            perKillAmount: data.perKillAmount || 0,
            winnersCount: data.winnersCount || 1,
            prizeDistribution: data.prizeDistribution || {},
            positionWinnersCount: data.positionWinnersCount || 0,
            positionPrizeDistribution: data.positionPrizeDistribution || {}
          });
        } else {
          alert('Match not found');
          onPageChange(Page.ADMIN);
        }
      } catch (e) {
        console.error('Error fetching match:', e);
        handleFirestoreError(e, OperationType.GET, `matches/${matchId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchMatch();
  }, [matchId, onPageChange, canManageMatches]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadProgress(10);

    try {
      const uploadedUrl = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setMatchForm(prev => ({ ...prev, image: uploadedUrl }));
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSelectGameMode = (modeSlugOrId: string) => {
    const found = availableModes.find(m => m.id === modeSlugOrId || `${m.gameId}_${m.id}` === modeSlugOrId);
    
    if (found) {
      const titleUpper = found.title.toUpperCase();
      let derivedSection = found.category || found.subtitle || 'Battle Royale';
      let derivedMode = 'Solo';
      let derivedSlots = matchForm.totalSlots;

      if (titleUpper.includes('SOLO') || titleUpper.includes('1V1')) {
        derivedMode = 'Solo';
      } else if (titleUpper.includes('DUO') || titleUpper.includes('2V2')) {
        derivedMode = 'Duo';
      } else if (titleUpper.includes('SQUAD') || titleUpper.includes('4V4')) {
        derivedMode = 'Squad';
      } else {
        derivedMode = found.title;
      }

      if (titleUpper.includes('HEADSHOT')) {
        derivedSection = 'Headshot';
      } else if (titleUpper.includes('CS 1V1') || titleUpper.includes('1V1 DUEL')) {
        derivedSection = 'CS 1v1';
        derivedSlots = 2;
      } else if (titleUpper.includes('CS 2V2')) {
        derivedSection = 'CS 2v2';
        derivedSlots = 4;
      } else if (titleUpper.includes('CS') || titleUpper.includes('CLASH') || titleUpper.includes('4V4')) {
        derivedSection = 'Clash Squad';
        derivedSlots = 8;
      } else if (titleUpper.includes('LONE') || titleUpper.includes('WOLF')) {
        derivedSection = 'Lone Wolf';
        derivedSlots = derivedMode === 'Duo' ? 4 : 2;
      } else if (titleUpper.includes('CUSTOM')) {
        derivedSection = 'Custom Room';
        derivedSlots = 48;
      } else if (titleUpper.includes('FULL MAP') || titleUpper.includes('BR')) {
        derivedSection = 'Battle Royale';
        derivedSlots = 48;
      } else if (found.category || found.subtitle) {
        derivedSection = found.category || found.subtitle || 'Battle Royale';
      } else {
        derivedSection = found.title || 'Battle Royale';
      }

      setMatchForm(prev => ({
        ...prev,
        selectedModeDocId: found.id,
        modeId: found.id,
        section: derivedSection,
        mode: derivedMode,
        totalSlots: derivedSlots,
        image: prev.image || found.image || ''
      }));
    } else {
      setMatchForm(prev => ({
        ...prev,
        selectedModeDocId: modeSlugOrId,
        modeId: modeSlugOrId
      }));
    }
  };

  const handlePrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm(prev => ({
      ...prev,
      prizeDistribution: {
        ...prev.prizeDistribution,
        [rank]: amount
      }
    }));
  };

  const handleWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.prizeDistribution };
    Object.keys(newDist).forEach(rank => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm(prev => ({
      ...prev,
      winnersCount: count,
      prizeDistribution: newDist
    }));
  };

  const handlePositionPrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm(prev => ({
      ...prev,
      positionPrizeDistribution: {
        ...prev.positionPrizeDistribution,
        [rank]: amount
      }
    }));
  };

  const handlePositionWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.positionPrizeDistribution };
    Object.keys(newDist).forEach(rank => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm(prev => ({
      ...prev,
      positionWinnersCount: count,
      positionPrizeDistribution: newDist
    }));
  };

  const handleUpdateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMatches || isProcessing || !matchId) return;

    if (!matchForm.gameId || !matchForm.map) {
      alert('Please select game and map');
      return;
    }

    const totalSlots = Number(matchForm.totalSlots) || 0;
    const entryFee = Number(matchForm.entryFee) || 0;
    if (!Number.isFinite(totalSlots) || totalSlots <= 0) {
      alert('Total slots must be greater than 0');
      return;
    }
    if (!Number.isFinite(entryFee) || entryFee < 0) {
      alert('Entry fee cannot be negative');
      return;
    }

    setIsProcessing(true);
    try {
      let finalImage = matchForm.image ? matchForm.image.trim() : '';
      if (finalImage && finalImage.startsWith('data:')) {
        try {
          finalImage = await uploadOriginalImage(finalImage);
        } catch (imgErr) {
          console.warn('Image upload warning:', imgErr);
        }
      }

      const matchRef = doc(db, 'matches', matchId);
      const updateData: any = {
        title: matchForm.title,
        gameId: matchForm.gameId,
        modeId: matchForm.modeId || matchForm.selectedModeDocId || 'br_solo',
        image: finalImage,
        entryFee,
        maxPlayers: totalSlots,
        totalSlots,
        time: matchForm.time,
        map: matchForm.map,
        mode: matchForm.mode,
        section: matchForm.section,
        updatedAt: serverTimestamp()
      };

      updateData.prizeType = matchForm.prizeType;

      if (matchForm.prizeType === 'survival') {
        const sumOfDistribution = (Object.values(matchForm.prizeDistribution || {}) as number[]).reduce((sum: number, v: number) => sum + (Number(v) || 0), 0);
        const finalPrizePool = sumOfDistribution > 0 ? sumOfDistribution : (Number(matchForm.prizePool) || 0);

        updateData.perKillAmount = 0;
        updateData.winnersCount = Number(matchForm.winnersCount) || 1;
        updateData.prizeDistribution = matchForm.prizeDistribution || {};
        updateData.prizePool = finalPrizePool;
        updateData.prize = matchForm.prize 
          ? (String(matchForm.prize).startsWith('₹') ? String(matchForm.prize) : `₹${matchForm.prize}`)
          : `₹${finalPrizePool}`;
        updateData.positionWinnersCount = 0;
        updateData.positionPrizeDistribution = {};
      } else {
        updateData.perKillAmount = Number(matchForm.perKillAmount) || 0;
        updateData.prizePool = Number(matchForm.prizePool) || 0;
        updateData.prize = `₹${matchForm.prizePool || 0}`;
        updateData.positionWinnersCount = Number(matchForm.positionWinnersCount) || 0;
        updateData.positionPrizeDistribution = matchForm.positionPrizeDistribution || {};
        updateData.winnersCount = 0;
        updateData.prizeDistribution = {};
      }

      await updateDoc(matchRef, updateData);
      alert('Match updated successfully!');
      onPageChange(Page.ADMIN);
    } catch (e) {
      console.error("Error updating match:", e);
      handleFirestoreError(e, OperationType.UPDATE, `matches/${matchId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!canManageMatches) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pt-24 px-4 text-center max-w-2xl mx-auto border-x border-slate-200">
        <div className="max-w-sm mx-auto bg-white border border-slate-200 rounded-3xl p-7 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mb-4">
            <Lock size={22} />
          </div>
          <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 font-medium mt-1.5">
            You do not have permission to edit matches.
          </p>
          <button
            onClick={() => onPageChange(canAccessPanel ? Page.ADMIN : Page.HOME)}
            className="mt-5 w-full py-3 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors cursor-pointer"
          >
            {canAccessPanel ? 'Back to Admin Panel' : 'Go Home'}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center">
        <Loader2 className="text-[#16A34A] animate-spin mb-4" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loading Match Details...</p>
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-2xl mx-auto bg-[#F8FAFC] text-slate-900 min-h-screen border-x border-slate-200">
      <div className="px-5 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => onPageChange(Page.ADMIN)}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-[#16A34A] hover:border-emerald-300 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-slate-900 leading-none">
              Edit <span className="text-[#16A34A]">Match</span>
            </h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">Match ID: {matchId}</p>
          </div>
        </div>

        <form onSubmit={handleUpdateMatch} className="space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Match Title *</label>
            <input 
              type="text"
              required
              placeholder="e.g. Daily Battle Room #1"
              value={matchForm.title}
              onChange={(e) => setMatchForm({...matchForm, title: e.target.value})}
              className="w-full h-12 bg-white border border-slate-200 rounded-2xl px-4 text-xs font-bold outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 transition-all text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Dynamic Mode Picker */}
          <div className="space-y-2.5 p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A] flex items-center gap-1.5">
                <Layers size={13} /> Select Game Mode (From Admin Modes) *
              </label>
              {loadingModes && <Loader2 size={12} className="animate-spin text-[#16A34A]" />}
            </div>

            <select
              value={matchForm.selectedModeDocId}
              onChange={(e) => handleSelectGameMode(e.target.value)}
              className="w-full h-12 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
            >
              {availableModes.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title} — {m.subtitle || m.category || 'Mode'} (ID: {m.id})
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {availableModes.slice(0, 8).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectGameMode(m.id)}
                  className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    matchForm.selectedModeDocId === m.id
                      ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-[#16A34A] hover:border-emerald-300'
                  }`}
                >
                  {m.title}
                </button>
              ))}
            </div>
          </div>

          {/* Thumbnail Upload */}
          <div className="space-y-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A] flex items-center gap-1.5">
                <ImageIcon size={14} /> Match Thumbnail / Cover Image
              </label>
              {matchForm.image && (
                <button
                  type="button"
                  onClick={() => setMatchForm(prev => ({ ...prev, image: '' }))}
                  className="text-[9px] font-black text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 size={11} /> Remove
                </button>
              )}
            </div>

            <input 
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {matchForm.image ? (
              <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-slate-200 shadow-xs group">
                <img 
                  src={matchForm.image} 
                  alt="Match Thumbnail Preview" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent flex flex-col justify-between p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase tracking-wider bg-[#16A34A] text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 size={10} /> Active Thumbnail
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[9px] font-black uppercase tracking-wider bg-white hover:bg-slate-100 text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Upload size={11} /> Change File
                    </button>
                  </div>
                  <div className="text-white">
                    <p className="text-[10px] font-black uppercase tracking-wide line-clamp-1">
                      {matchForm.title || 'Tournament Card Preview'}
                    </p>
                    <p className="text-[8px] font-bold text-emerald-200 uppercase">
                      {matchForm.section} • {matchForm.mode}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 hover:border-[#16A34A] rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50 hover:bg-[#ECFDF5]/40 group"
              >
                <div className="w-10 h-10 rounded-full bg-white group-hover:bg-[#ECFDF5] border border-slate-200 group-hover:border-emerald-300 flex items-center justify-center text-slate-500 group-hover:text-[#16A34A] transition-colors mb-2">
                  <Upload size={18} />
                </div>
                <p className="text-xs font-bold text-slate-800 group-hover:text-[#16A34A]">
                  Click to Upload Thumbnail Image
                </p>
                <p className="text-[9px] font-semibold text-slate-500 mt-0.5">
                  PNG, JPG, WebP supported (Esports / Game banner)
                </p>
              </div>
            )}

            {isUploadingImage && (
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] font-black uppercase text-[#16A34A]">
                  <span>Uploading Image...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#16A34A] transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1 pt-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                Or Enter Image URL:
              </label>
              <div className="flex gap-2">
                <input 
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={matchForm.image}
                  onChange={(e) => setMatchForm(prev => ({ ...prev, image: e.target.value }))}
                  className="flex-1 h-10 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 h-10 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                >
                  <Upload size={12} /> Browse
                </button>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                Quick Presets (1-Tap Apply):
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_MATCH_THUMBNAILS.map((preset, idx) => {
                  const isSelected = matchForm.image === preset.url;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setMatchForm(prev => ({ ...prev, image: preset.url }))}
                      className={`relative aspect-video rounded-lg overflow-hidden border transition-all text-left group cursor-pointer ${
                        isSelected 
                          ? 'border-[#16A34A] ring-2 ring-[#16A34A]/30 shadow-xs' 
                          : 'border-slate-200 hover:border-emerald-300 opacity-85 hover:opacity-100'
                      }`}
                    >
                      <img 
                        src={preset.url} 
                        alt={preset.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent p-1.5 flex flex-col justify-end">
                        <span className="text-[8px] font-black uppercase tracking-tighter text-white line-clamp-1 leading-tight">
                          {preset.name}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-[#16A34A] text-white rounded-full p-0.5">
                          <CheckCircle2 size={10} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Game & Map */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Game</label>
              <select 
                value={matchForm.gameId}
                onChange={(e) => setMatchForm({...matchForm, gameId: e.target.value})}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
              >
                <option value="freefire">Free Fire</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Map</label>
              <select 
                value={matchForm.map}
                onChange={(e) => setMatchForm({...matchForm, map: e.target.value})}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
              >
                {((GAME_MAPS as any)[matchForm.gameId] || GAME_MAPS['freefire']).map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section & Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Section / Category</label>
              <input 
                type="text"
                value={matchForm.section}
                onChange={(e) => setMatchForm({...matchForm, section: e.target.value})}
                placeholder="e.g. Battle Royale, Clash Squad"
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Mode Type</label>
              <input 
                type="text"
                value={matchForm.mode}
                onChange={(e) => setMatchForm({...matchForm, mode: e.target.value})}
                placeholder="e.g. Solo, Duo, Squad, 4v4"
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Schedule Time & Total Slots */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Schedule Time</label>
              <input 
                type="datetime-local"
                required
                value={matchForm.time}
                onChange={(e) => setMatchForm({...matchForm, time: e.target.value})}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Total Slots</label>
              <input 
                type="number"
                required
                placeholder="48"
                value={matchForm.totalSlots}
                onChange={(e) => setMatchForm({...matchForm, totalSlots: Number(e.target.value)})}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
              />
            </div>
          </div>

          {/* Entry Fee & Prize Pool */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Entry Fee (₹)</label>
              <input 
                type="number"
                required
                value={matchForm.entryFee}
                onChange={(e) => setMatchForm({...matchForm, entryFee: Number(e.target.value)})}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Prize Pool (₹)</label>
              <input 
                type="number"
                value={matchForm.prizePool}
                onChange={(e) => setMatchForm({...matchForm, prizePool: Number(e.target.value)})}
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
              />
            </div>
          </div>

          {/* Prize Distribution */}
          <div className="space-y-5 p-5 bg-white border border-slate-200 rounded-3xl shadow-2xs">
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setMatchForm({...matchForm, prizeType: 'perKill'})}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border cursor-pointer ${
                  matchForm.prizeType === 'perKill' 
                    ? 'bg-[#16A34A] border-[#16A34A] text-white' 
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                Per Kill + Rewards
              </button>
              <button 
                type="button"
                onClick={() => setMatchForm({...matchForm, prizeType: 'survival'})}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border cursor-pointer ${
                  matchForm.prizeType === 'survival' 
                    ? 'bg-[#16A34A] border-[#16A34A] text-white' 
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                Survival / Ranks
              </button>
            </div>

            {matchForm.prizeType === 'perKill' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Per Kill (₹)</label>
                    <input 
                      type="number"
                      value={matchForm.perKillAmount}
                      onChange={(e) => setMatchForm({...matchForm, perKillAmount: Number(e.target.value)})}
                      className="w-full h-12 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Total Pool (₹)</label>
                    <input 
                      type="number"
                      value={matchForm.prizePool}
                      onChange={(e) => setMatchForm({...matchForm, prizePool: Number(e.target.value)})}
                      className="w-full h-12 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A]">Position Rewards (Optional)</label>
                    <div className="relative min-w-[140px]">
                      <select 
                        value={matchForm.positionWinnersCount}
                        onChange={(e) => handlePositionWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none cursor-pointer focus:border-[#16A34A] appearance-none pr-8"
                      >
                        <option value={0}>No Position Reward</option>
                        {[1, 2, 3, 5, 10].map(n => (
                          <option key={n} value={n}>Top {n} Winners</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[0, 1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handlePositionWinnersCountChange(n)}
                        className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          matchForm.positionWinnersCount === n
                            ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-[#16A34A]'
                        }`}
                      >
                        {n === 0 ? 'None' : `Top ${n}`}
                      </button>
                    ))}
                  </div>

                  {matchForm.positionWinnersCount > 0 && (
                    <div className="space-y-2">
                      {Array.from({ length: matchForm.positionWinnersCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-16 h-9 bg-[#ECFDF5] border border-[#BBF7D0] rounded-lg flex items-center justify-center text-[9px] font-black text-[#16A34A]">
                            RANK {i + 1}
                          </div>
                          <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#16A34A] font-bold text-xs">₹</span>
                            <input 
                              type="number"
                              placeholder="0"
                              value={matchForm.positionPrizeDistribution[i + 1] || ''}
                              onChange={(e) => handlePositionPrizeDistributionChange(i + 1, Number(e.target.value))}
                              className="w-full h-9 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg pl-7 pr-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Prize Text (e.g. ₹500)</label>
                  <input 
                    type="text"
                    value={matchForm.prize}
                    onChange={(e) => setMatchForm({...matchForm, prize: e.target.value})}
                    className="w-full h-12 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none focus:border-[#16A34A] transition-all text-slate-900"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A]">Winning Distribution</label>
                    <div className="relative min-w-[140px]">
                      <select 
                        value={matchForm.winnersCount}
                        onChange={(e) => handleWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none cursor-pointer focus:border-[#16A34A] appearance-none pr-8"
                      >
                        {[1, 2, 3, 5, 10, 20].map(n => (
                          <option key={n} value={n}>Top {n} Winners</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[1, 2, 3, 5, 10, 20].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleWinnersCountChange(n)}
                        className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          matchForm.winnersCount === n
                            ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-[#16A34A]'
                        }`}
                      >
                        Top {n}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {Array.from({ length: matchForm.winnersCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-16 h-9 bg-[#ECFDF5] border border-[#BBF7D0] rounded-lg flex items-center justify-center text-[9px] font-black text-[#16A34A]">
                          RANK {i + 1}
                        </div>
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#16A34A] font-bold text-xs">₹</span>
                          <input 
                            type="number"
                            placeholder="0"
                            value={matchForm.prizeDistribution[i + 1] || ''}
                            onChange={(e) => handlePrizeDistributionChange(i + 1, Number(e.target.value))}
                            className="w-full h-9 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg pl-7 pr-3 text-xs font-bold text-slate-900 outline-none focus:border-[#16A34A]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button 
            type="submit"
            disabled={isProcessing}
            className="w-full py-4 bg-[#16A34A] hover:bg-[#15803D] rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm mt-6 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin text-white" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Update Match Details</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
