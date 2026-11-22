import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Edit2, Trash2, Save, X, Search,
  Loader2, Gamepad2, ArrowLeft, Upload, 
  Sparkles, Check, Lock
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, setDoc, doc, deleteDoc, onSnapshot, orderBy, writeBatch, query } from 'firebase/firestore';
import { Page, User } from '../types';
import { GAMES } from '../constants';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';
import { hasAdminPanelAccess, hasSectionPermission } from '../utils/adminPermissions';

export interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface AdminModesProps {
  user?: User | null;
  onPageChange: (page: Page) => void;
}

const PRESET_COVERS = [
  {
    name: 'Battle Royale Classic',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Clash Squad / 4v4',
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Lone Wolf / 1v1',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Survival Arena',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Cyberpunk Esports',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Sniper / Stealth',
    url: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop'
  }
];

const DEFAULT_PRESET_MODES: GameMode[] = [
  { id: 'br_solo', gameId: 'freefire', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop', order: 1 },
  { id: 'br_duo', gameId: 'freefire', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop', order: 2 },
  { id: 'br_squad', gameId: 'freefire', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop', order: 3 },
  { id: 'cs_solo', gameId: 'freefire', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop', order: 4 },
  { id: 'cs_duo', gameId: 'freefire', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop', order: 5 },
  { id: 'cs_squad', gameId: 'freefire', title: 'CS SQUAD', subtitle: 'Clash Squad', category: 'Clash Squad', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop', order: 6 },
  { id: 'lone_wolf_solo', gameId: 'freefire', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop', order: 7 },
  { id: 'lone_wolf_duo', gameId: 'freefire', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop', order: 8 },
  { id: 'custom_room', gameId: 'freefire', title: 'CUSTOM ROOM', subtitle: 'Special Tournament', category: 'Custom Room', image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop', order: 9 },
];

const SUGGESTED_TITLES = [
  'BR SOLO', 'BR DUO', 'BR SQUAD',
  'CS SOLO', 'CS DUO', 'CS SQUAD',
  'LONE WOLF SOLO', 'LONE WOLF DUO',
  'CUSTOM ROOM', 'SNIPER ONLY', '4V4 CLASH', '1V1 DUEL'
];

const SUGGESTED_SUBTITLES = [
  'Battle Royale', 'Clash Squad', 'Lone Wolf',
  'Custom Room', 'Survival Arena', 'Ranked Esports', 'Special Event'
];

export default function AdminModes({ user, onPageChange }: AdminModesProps) {
  const canManageModes = hasSectionPermission(user, 'gameModes', auth.currentUser?.email, auth.currentUser?.uid);
  const canAccessPanel = hasAdminPanelAccess(user, auth.currentUser?.email, auth.currentUser?.uid);
  const [selectedGameId, setSelectedGameId] = useState<string>(GAMES[0].id);
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMode, setEditingMode] = useState<Partial<GameMode> | null>(null);
  const [modeToDelete, setModeToDelete] = useState<GameMode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadOriginalImage(file);
      setEditingMode(prev => prev ? { ...prev, image: url } : null);
    } catch (err) {
      console.error('Mode image upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!canManageModes) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allModes = snapshot.docs.map(docSnap => ({ ...docSnap.data() } as GameMode));
      const filtered = allModes.filter(m => m.gameId === selectedGameId);
      setModes(filtered);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'gameModes');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedGameId, canManageModes]);

  const handleSeedDefaults = async () => {
    if (!confirm(`Do you want to initialize standard preset game modes for ${selectedGameId}?`)) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      DEFAULT_PRESET_MODES.forEach((mode, i) => {
        const modeDocId = `${selectedGameId}_${mode.id}`;
        const ref = doc(db, 'gameModes', modeDocId);
        batch.set(ref, {
          ...mode,
          gameId: selectedGameId,
          order: i + 1
        }, { merge: true });
      });
      await batch.commit();
      alert('Preset game modes added successfully!');
    } catch (err) {
      console.error("Error seeding modes:", err);
      handleFirestoreError(err, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSeeding(false);
    }
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleTitleChange = (title: string) => {
    const slug = generateSlug(title);
    let subtitle = editingMode?.subtitle || '';
    let category = editingMode?.category || '';

    if (!subtitle || subtitle === 'Battle Royale' || subtitle === 'Clash Squad' || subtitle === 'Lone Wolf') {
      const upper = title.toUpperCase();
      if (upper.includes('BR') || upper.includes('ROYALE') || upper.includes('MAP')) {
        subtitle = 'Battle Royale';
        category = 'Battle Royale';
      } else if (upper.includes('CS') || upper.includes('CLASH') || upper.includes('4V4')) {
        subtitle = 'Clash Squad';
        category = 'Clash Squad';
      } else if (upper.includes('LONE') || upper.includes('WOLF') || upper.includes('1V1')) {
        subtitle = 'Lone Wolf';
        category = 'Lone Wolf';
      } else if (upper.includes('CUSTOM') || upper.includes('ROOM')) {
        subtitle = 'Custom Room';
        category = 'Custom Room';
      }
    }

    setEditingMode(prev => ({
      ...prev,
      title,
      id: prev?.id && prev.id !== '' ? prev.id : slug,
      subtitle: subtitle || 'Battleground',
      category: category || subtitle || 'Arena',
      image: prev?.image || PRESET_COVERS[0].url
    }));
  };

  const handleSave = async () => {
    if (!editingMode?.title?.trim()) {
      alert('Please enter a Mode Title');
      return;
    }

    const rawId = (editingMode.id || generateSlug(editingMode.title)).trim();
    if (!rawId) {
      alert('Please enter a valid Mode ID');
      return;
    }

    setIsSaving(true);
    try {
      const modeId = `${selectedGameId}_${rawId}`;
      let defaultImage = editingMode.image && editingMode.image.trim() !== ''
        ? editingMode.image.trim()
        : PRESET_COVERS[0].url;

      if (defaultImage && defaultImage.startsWith('data:')) {
        try {
          defaultImage = await uploadOriginalImage(defaultImage);
        } catch (imgErr) {
          console.warn('Mode image upload warning:', imgErr);
        }
      }

      const modeData: GameMode = {
        id: rawId,
        gameId: selectedGameId,
        title: editingMode.title.trim(),
        subtitle: (editingMode.subtitle || 'Battleground').trim(),
        category: (editingMode.category || editingMode.subtitle || 'Arena').trim(),
        image: defaultImage,
        order: Number(editingMode.order) || modes.length + 1
      };

      await setDoc(doc(db, 'gameModes', modeId), modeData, { merge: true });
      setEditingMode(null);
    } catch (error) {
      console.error("Error saving mode:", error);
      handleFirestoreError(error, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!modeToDelete || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'gameModes', `${selectedGameId}_${modeToDelete.id}`));
      setModeToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'gameModes');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredModes = modes.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!canManageModes) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pt-24 px-4 text-center max-w-2xl mx-auto border-x border-slate-200">
        <div className="max-w-sm mx-auto bg-white border border-slate-200 rounded-3xl p-7 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mb-4">
            <Lock size={22} />
          </div>
          <h2 className="text-base font-black uppercase tracking-tight text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 font-medium mt-1.5">
            You do not have permission to access Game Modes.
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

  return (
    <div className="pb-24 max-w-2xl mx-auto bg-[#F8FAFC] min-h-screen text-slate-900 border-x border-slate-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-5 h-16 flex items-center justify-between border-b border-slate-200 shadow-2xs">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onPageChange(Page.ADMIN)}
            className="p-2 -ml-2 text-slate-600 hover:text-[#16A34A] active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-base font-extrabold tracking-tight uppercase text-slate-900">Game Modes</h1>
            <p className="text-[8px] font-black uppercase tracking-widest text-[#16A34A]">Configure Arena Modes</p>
          </div>
        </div>

        <button 
          onClick={handleSeedDefaults}
          disabled={isSeeding}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] hover:bg-[#16A34A] hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          <span>Preset Modes</span>
        </button>
      </header>

      <section className="px-5 py-6 space-y-6">
        {/* Game Selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {GAMES.map(game => (
            <button
              key={game.id}
              onClick={() => setSelectedGameId(game.id)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                selectedGameId === game.id 
                  ? 'bg-[#16A34A] text-white shadow-xs' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:text-[#16A34A]'
              }`}
            >
              {game.title}
            </button>
          ))}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text"
              placeholder="Search modes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold outline-none focus:border-[#16A34A] text-slate-900 placeholder:text-slate-400 transition-all"
            />
          </div>

          <button 
            onClick={() => setEditingMode({ 
              id: '', 
              title: '', 
              subtitle: 'Battle Royale', 
              image: PRESET_COVERS[0].url, 
              category: 'Battle Royale', 
              order: modes.length + 1 
            })}
            className="flex items-center gap-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={14} /> Add Mode
          </button>
        </div>

        {/* Modes List */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin mb-3 text-[#16A34A]" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Loading Modes...</p>
            </div>
          ) : filteredModes.length === 0 ? (
            <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-3xl p-6">
              <Gamepad2 size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600">No modes found</p>
              <p className="text-[10px] text-slate-500 mt-1 mb-4">Click "Add Mode" or load default presets</p>
              <button 
                onClick={handleSeedDefaults}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#ECFDF5] border border-[#BBF7D0] text-[#16A34A] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#16A34A] hover:text-white transition-all cursor-pointer"
              >
                <Sparkles size={12} /> Load Default Modes
              </button>
            </div>
          ) : (
            filteredModes.map((mode, index) => (
              <div 
                key={mode.id}
                className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between group shadow-2xs hover:border-emerald-300 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 relative">
                    <SafeImage 
                      src={mode.image || PRESET_COVERS[0].url} 
                      alt={mode.title} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 bg-slate-900/80 px-1.5 py-0.5 rounded text-[7px] font-black text-white">
                      #{mode.order || index + 1}
                    </div>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-black italic uppercase tracking-tight text-slate-900 truncate">{mode.title}</h4>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">{mode.subtitle || 'Battleground'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-[7px] font-black text-slate-600 uppercase tracking-widest">
                        ID: {mode.id}
                      </span>
                      {mode.category && (
                        <span className="px-2 py-0.5 bg-[#ECFDF5] border border-[#BBF7D0] rounded text-[7px] font-black text-[#16A34A] uppercase tracking-widest">
                          {mode.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0 ml-2">
                  <button 
                    onClick={() => setEditingMode({ ...mode })}
                    className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-[#16A34A] hover:text-white transition-all active:scale-90 cursor-pointer"
                    title="Edit Mode"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => setModeToDelete(mode)}
                    className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-90 cursor-pointer"
                    title="Delete Mode"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Edit / Add Modal */}
      <AnimatePresence>
        {editingMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-black italic tracking-tight uppercase text-slate-900">
                    {editingMode.id ? 'Edit' : 'Add New'} <span className="text-[#16A34A]">Mode</span>
                  </h3>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                    Available for {selectedGameId.toUpperCase()} matches
                  </p>
                </div>
                <button 
                  onClick={() => setEditingMode(null)} 
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-xl bg-slate-100 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Mode Title (e.g. BR SOLO, CS 4V4, CUSTOM ROOM) *
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="Enter any mode title..."
                    value={editingMode.title || ''}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#16A34A] text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                  
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_TITLES.map(title => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => handleTitleChange(title)}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                          editingMode.title?.toUpperCase() === title 
                            ? 'bg-[#16A34A] border-[#16A34A] text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-[#16A34A]'
                        }`}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Mode ID (Slug, e.g. br_solo, cs_4v4, custom_room) *
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. br_solo"
                    value={editingMode.id || ''}
                    onChange={(e) => setEditingMode({ ...editingMode, id: generateSlug(e.target.value) })}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#16A34A] text-slate-900 placeholder:text-slate-400 transition-all font-mono"
                  />
                  <p className="text-[8px] text-slate-500 mt-1">Used for filtering tournaments & match registration</p>
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Subtitle / Section (e.g. Battle Royale, Clash Squad, Custom Room)
                  </label>
                  <input 
                    type="text"
                    placeholder="Enter category / subtitle..."
                    value={editingMode.subtitle || ''}
                    onChange={(e) => setEditingMode({ 
                      ...editingMode, 
                      subtitle: e.target.value,
                      category: e.target.value 
                    })}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#16A34A] text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                  
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_SUBTITLES.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setEditingMode({ ...editingMode, subtitle: sub, category: sub })}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                          editingMode.subtitle === sub 
                            ? 'bg-[#16A34A] border-[#16A34A] text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-[#16A34A]'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Display Order (Sorting)
                  </label>
                  <input 
                    type="number"
                    value={editingMode.order || 1}
                    onChange={(e) => setEditingMode({ ...editingMode, order: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-[#16A34A] text-slate-900 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Mode Thumbnail Cover
                  </label>

                  <p className="text-[8px] font-bold text-[#16A34A] uppercase mb-2">Select from Presets or Enter URL:</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {PRESET_COVERS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditingMode({ ...editingMode, image: preset.url })}
                        className={`relative aspect-[16/10] rounded-xl overflow-hidden border-2 transition-all group cursor-pointer ${
                          editingMode.image === preset.url 
                            ? 'border-[#16A34A] ring-2 ring-[#16A34A]/30' 
                            : 'border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <SafeImage src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-900/45 flex items-center justify-center p-1 text-center">
                          <span className="text-[7px] font-black uppercase text-white leading-tight">
                            {preset.name}
                          </span>
                        </div>
                        {editingMode.image === preset.url && (
                          <div className="absolute top-1 right-1 bg-[#16A34A] rounded-full p-0.5">
                            <Check size={10} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={editingMode.image || ''}
                        onChange={(e) => setEditingMode({ ...editingMode, image: e.target.value })}
                        placeholder="https://image-url.jpg"
                        className="flex-1 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#16A34A] text-slate-900 placeholder:text-slate-400"
                      />
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 hover:text-[#16A34A] transition-all disabled:opacity-50 flex items-center gap-1 text-[9px] font-black uppercase cursor-pointer"
                      >
                        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        <span>Upload</span>
                      </button>
                      <input 
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingMode(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 py-3.5 rounded-xl text-slate-700 font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !editingMode.title?.trim()}
                  className="w-full bg-[#16A34A] hover:bg-[#15803D] py-3.5 rounded-xl text-white font-black uppercase tracking-widest text-[10px] shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  <span>{editingMode.id ? 'Update Mode' : 'Save Mode'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {modeToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-600 border border-red-200">
                <Trash2 size={32} />
              </div>
              
              <h3 className="text-lg font-black italic uppercase tracking-tight text-slate-900 mb-1">
                Delete <span className="text-red-600">Mode?</span>
              </h3>
              
              <p className="text-xs text-slate-600 font-medium mb-6 leading-relaxed">
                Are you sure you want to delete <span className="text-slate-900 font-bold">{modeToDelete.title}</span>?
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={isDeleting}
                  onClick={() => setModeToDelete(null)}
                  className="bg-slate-100 hover:bg-slate-200 py-3 rounded-xl text-slate-700 font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700 py-3 rounded-xl text-white font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 disabled:opacity-50 shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
