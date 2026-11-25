import React, { useState, useEffect } from 'react';
import { ArrowLeft, User as UserIcon, Mail, Phone, Lock, Edit2, Check, X, Loader2, Gamepad2, Shield } from 'lucide-react';
import { Page, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';

interface ProfileDetailsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function ProfileDetails({ user, onPageChange }: ProfileDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [phone, setPhone] = useState(user.phone);
  const [ffIgn, setFfIgn] = useState(user.gameIGNs?.freefire || user.ign || '');
  const [ffUid, setFfUid] = useState(user.gameUIDs?.freefire || user.gameUid || '');
  const [bgmiIgn, setBgmiIgn] = useState(user.gameIGNs?.bgmi || '');
  const [bgmiUid, setBgmiUid] = useState(user.gameUIDs?.bgmi || '');
  const [codmIgn, setCodmIgn] = useState(user.gameIGNs?.codm || '');
  const [codmUid, setCodmUid] = useState(user.gameUIDs?.codm || '');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    setUsername(user.username);
    setPhone(user.phone);
    setFfIgn(user.gameIGNs?.freefire || user.ign || '');
    setFfUid(user.gameUIDs?.freefire || user.gameUid || '');
    setBgmiIgn(user.gameIGNs?.bgmi || '');
    setBgmiUid(user.gameUIDs?.bgmi || '');
    setCodmIgn(user.gameIGNs?.codm || '');
    setCodmUid(user.gameUIDs?.codm || '');
  }, [user, isEditing]);

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const cleanFfIgn = ffIgn.trim().slice(0, 50);
      const cleanFfUid = ffUid.trim().slice(0, 50);
      const cleanBgmiIgn = bgmiIgn.trim().slice(0, 50);
      const cleanBgmiUid = bgmiUid.trim().slice(0, 50);
      const cleanCodmIgn = codmIgn.trim().slice(0, 50);
      const cleanCodmUid = codmUid.trim().slice(0, 50);

      const resolvedIgn = cleanFfIgn || cleanBgmiIgn || cleanCodmIgn;
      const resolvedUid = cleanFfUid || cleanBgmiUid || cleanCodmUid;
      const cleanUsername = username.trim().slice(0, 50);
      const cleanPhone = phone.replace(/\D/g, '').slice(0, 10) || phone.trim().slice(0, 30);
      const isComplete = Boolean(
        cleanUsername.length >= 2 &&
        cleanPhone.replace(/\D/g, '').length >= 10 &&
        resolvedIgn &&
        resolvedUid
      );

      await updateDoc(doc(db, 'users', auth.currentUser?.uid || ''), {
        username: cleanUsername,
        phone: cleanPhone,
        ign: resolvedIgn,
        gameUid: resolvedUid,
        profileCompleted: isComplete,
        gameIGNs: {
          freefire: cleanFfIgn,
          bgmi: cleanBgmiIgn,
          codm: cleanCodmIgn
        },
        gameUIDs: {
          freefire: cleanFfUid,
          bgmi: cleanBgmiUid,
          codm: cleanCodmUid
        }
      });
      setIsEditing(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user.email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (e) {
      console.error(e);
      alert('Failed to send password reset email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pb-24 max-w-lg mx-auto bg-[#F8FAFC] min-h-screen text-slate-900 border-x border-slate-200">
      <div className="px-5 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => onPageChange(Page.PROFILE)}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-[#16A34A] hover:border-emerald-300 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-slate-900 leading-none">
              Personal <span className="text-[#16A34A]">Details</span>
            </h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">Manage your identity</p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="space-y-6">
          <div className="p-6 sm:p-8 bg-white border border-slate-200 rounded-[2rem] relative overflow-hidden shadow-xs">
             <div className="flex items-center justify-between mb-6">
                <div className="w-16 h-16 bg-[#ECFDF5] border border-[#BBF7D0] rounded-2xl flex items-center justify-center text-[#16A34A]">
                   <UserIcon size={32} />
                </div>
                {!isEditing ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl active:scale-90 transition-all shadow-xs cursor-pointer"
                  >
                    <Edit2 size={16} />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="p-3 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl hover:text-slate-900 transition-colors cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                    <button 
                      onClick={handleUpdateProfile}
                      disabled={loading}
                      className="p-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-black rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin text-white" /> : <Check size={16} />}
                    </button>
                  </div>
                )}
             </div>

             <div className="space-y-5">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-1.5 block">Username</label>
                  {isEditing ? (
                    <input 
                      autoFocus
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-[#16A34A] transition-all"
                    />
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <UserIcon size={14} className="text-[#16A34A]" />
                      <span className="text-sm font-bold text-slate-900">{user.username}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-1.5 block">Mobile Number</label>
                  {isEditing ? (
                    <input 
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-[#16A34A] transition-all"
                    />
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <Phone size={14} className="text-[#16A34A]" />
                      <span className="text-sm font-bold text-slate-900">{user.phone || 'Not set'}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-1.5 block">Email Address</label>
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Mail size={14} className="text-[#16A34A]" />
                      <span className="text-sm font-bold text-slate-700">{user.email}</span>
                    </div>
                    <Lock size={12} className="text-slate-400" />
                  </div>
                </div>
             </div>
          </div>

          {/* Game In-Game Names (IGN) & UID */}
          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gamepad2 size={16} className="text-[#16A34A]" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Game Profiles (IGN & UID)</h4>
              </div>
              {!isEditing && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] font-black uppercase text-[#16A34A] hover:underline cursor-pointer"
                >
                  Edit IGN & UID
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 mb-1 block">Free Fire IGN</label>
                  {isEditing ? (
                    <input
                      type="text"
                      maxLength={50}
                      placeholder="Enter Free Fire IGN"
                      value={ffIgn}
                      onChange={(e) => setFfIgn(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  ) : (
                    <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 truncate">
                      {ffIgn || <span className="text-slate-400 italic">Not set</span>}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 mb-1 block">Free Fire UID</label>
                  {isEditing ? (
                    <input
                      type="text"
                      maxLength={50}
                      placeholder="Enter Free Fire UID"
                      value={ffUid}
                      onChange={(e) => setFfUid(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  ) : (
                    <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 font-mono truncate">
                      {ffUid || <span className="text-slate-400 italic font-sans">Not set</span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 mb-1 block">BGMI IGN</label>
                  {isEditing ? (
                    <input
                      type="text"
                      maxLength={50}
                      placeholder="Enter BGMI IGN"
                      value={bgmiIgn}
                      onChange={(e) => setBgmiIgn(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  ) : (
                    <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 truncate">
                      {bgmiIgn || <span className="text-slate-400 italic">Not set</span>}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 mb-1 block">BGMI UID</label>
                  {isEditing ? (
                    <input
                      type="text"
                      maxLength={50}
                      placeholder="Enter BGMI UID"
                      value={bgmiUid}
                      onChange={(e) => setBgmiUid(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  ) : (
                    <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 font-mono truncate">
                      {bgmiUid || <span className="text-slate-400 italic font-sans">Not set</span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 mb-1 block">COD Mobile IGN</label>
                  {isEditing ? (
                    <input
                      type="text"
                      maxLength={50}
                      placeholder="Enter CODM IGN"
                      value={codmIgn}
                      onChange={(e) => setCodmIgn(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  ) : (
                    <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 truncate">
                      {codmIgn || <span className="text-slate-400 italic">Not set</span>}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase text-slate-500 mb-1 block">COD Mobile UID</label>
                  {isEditing ? (
                    <input
                      type="text"
                      maxLength={50}
                      placeholder="Enter CODM UID"
                      value={codmUid}
                      onChange={(e) => setCodmUid(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#16A34A]"
                    />
                  ) : (
                    <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 font-mono truncate">
                      {codmUid || <span className="text-slate-400 italic font-sans">Not set</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Security Action */}
          <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-3 shadow-2xs">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Account Security</h4>
             <button 
               onClick={handleResetPassword}
               disabled={loading || resetSent}
               className={`w-full py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-all cursor-pointer ${
                resetSent 
                  ? 'bg-emerald-50 text-[#16A34A] border border-emerald-200' 
                  : 'bg-[#16A34A] text-white font-black hover:bg-[#15803D] active:scale-[0.98]'
               }`}
             >
               {resetSent ? (
                 <>
                  <Check size={16} />
                  Reset Link Sent to Email
                 </>
               ) : (
                 <>
                   <Lock size={16} className="text-white" />
                   Change Password
                 </>
               )}
             </button>
             {!resetSent && (
               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center">
                 A secure link will be sent to your registered email
               </p>
             )}
          </div>

          {/* DPDP Act 2023 Data Rights */}
          <div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-3 shadow-2xs">
             <div className="flex items-center gap-2 mb-1">
                <Shield size={16} className="text-[#16A34A]" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600">DPDP Act 2023 Data Rights</h4>
             </div>
             <p className="text-[10px] text-slate-600 leading-relaxed font-medium">
               Under India's Digital Personal Data Protection Act (DPDP) 2023, you hold full Right to Erasure, Data Access, and Consent Withdrawal.
             </p>
             <a 
               href="mailto:dpo@aptournament.com?subject=DPDP%20Data%20Erasure%20Request"
               className="w-full py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
             >
               Request Data Erasure / Account Deletion
             </a>
          </div>
        </div>
      </div>
    </div>
  );
}
