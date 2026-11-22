import { useState, useEffect } from 'react';
import { 
  ArrowLeft, Landmark, Banknote, ShieldAlert, 
  Loader2, ShieldCheck, Smartphone, AlertCircle
} from 'lucide-react';
import { Page, User, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, increment, runTransaction, collection, serverTimestamp } from 'firebase/firestore';
import { paymentService } from '../services/paymentService';

interface WithdrawProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function Withdraw({ user, onPageChange }: WithdrawProps) {
  const [amount, setAmount] = useState('500');
  const [loading, setLoading] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);

  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank'>('upi');
  
  const [upiId, setUpiId] = useState('');
  const [upiHolderName, setUpiHolderName] = useState(user.username || '');
  
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankHolderName, setBankHolderName] = useState(user.username || '');

  const [formError, setFormError] = useState<string | null>(null);

  const availableWinnings = user.wallet?.winnings || 0;

  useEffect(() => {
    const fetchGateway = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      setActiveGateway(g);
    };
    fetchGateway();
  }, []);

  const handleWithdraw = async () => {
    if (loading) return;
    setFormError(null);
    if (!auth.currentUser || !amount) return;
    const value = Math.floor(Number(amount));

    if (!Number.isFinite(value) || value < 100) {
      setFormError('Minimum withdrawal amount is ₹100');
      return;
    }
    if (value > 50000) {
      setFormError('Maximum withdrawal limit per request is ₹50,000');
      return;
    }
    if (value > availableWinnings) {
      setFormError('Withdrawal amount cannot exceed your Winnings balance (₹' + availableWinnings + ')');
      return;
    }

    if (payoutMethod === 'upi') {
      const cleanUpi = upiId.trim();
      if (!cleanUpi || !cleanUpi.includes('@')) {
        setFormError('Please enter a valid UPI ID (e.g. 9876543210@ybl, name@oksbi)');
        return;
      }
    } else {
      if (!accountNumber.trim() || accountNumber.trim().length < 8) {
        setFormError('Please enter a valid Bank Account Number (minimum 8 digits)');
        return;
      }
      if (accountNumber.trim() !== confirmAccountNumber.trim()) {
        setFormError('Account numbers do not match');
        return;
      }
      if (!ifsc.trim() || ifsc.trim().length < 8) {
        setFormError('Please enter a valid 11-character IFSC Code');
        return;
      }
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await runTransaction(db, async (transaction) => {
        const uSnap = await transaction.get(userRef);
        if (!uSnap.exists()) throw new Error('User not found');
        
        const userData = uSnap.data() as User;
        const currentWinnings = userData.wallet?.winnings || 0;
        
        if (currentWinnings < value) throw new Error('Insufficient winnings balance');
        
        transaction.update(userRef, {
          "wallet.winnings": increment(-value)
        });
        
        const transRef = doc(collection(db, 'transactions'));
        const payoutInfo = payoutMethod === 'upi' ? {
          method: 'upi',
          upiId: upiId.trim(),
          holderName: upiHolderName.trim() || user.username
        } : {
          method: 'bank',
          accountNumber: accountNumber.trim(),
          ifsc: ifsc.trim().toUpperCase(),
          bankName: bankName.trim() || 'Bank Transfer',
          holderName: bankHolderName.trim() || user.username
        };

        transaction.set(transRef, {
          userId: auth.currentUser!.uid,
          username: user.username,
          userPhone: user.phone || '',
          userEmail: user.email || '',
          type: 'withdraw',
          amount: value,
          status: 'pending',
          payoutMethod,
          payoutDetails: payoutInfo,
          title: payoutMethod === 'upi' 
            ? `Withdrawal to UPI (${upiId.trim()})` 
            : `Withdrawal to Bank (A/C: ${accountNumber.trim().slice(-4)})`,
          createdAt: serverTimestamp()
        });
      });

      alert(`Withdrawal request of ₹${value} submitted successfully! Admin will verify and approve your payout soon.`);
      onPageChange(Page.WALLET);
    } catch (error: any) {
      alert(error.message || 'Withdrawal failed');
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const presetAmounts = [100, 200, 500, 1000, 2000];

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#F8FAFC] min-h-screen text-slate-900 border-x border-slate-200">
      <div className="px-5 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => onPageChange(Page.WALLET)}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-[#16A34A] hover:border-emerald-300 transition-colors active:scale-95 shadow-2xs cursor-pointer"
            aria-label="Back to wallet"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-black tracking-tight uppercase leading-none text-slate-900">
              Withdraw <span className="text-[#16A34A]">Winnings</span>
            </h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              <ShieldCheck size={12} className="text-[#16A34A]" />
              <span className="text-[9px] font-black uppercase tracking-widest text-[#16A34A]">
                100% Instant Approval & Safe Payouts
              </span>
            </div>
          </div>
        </div>

        {/* Available Balance Hero Card */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 mb-6 flex flex-col items-center shadow-sm relative overflow-hidden text-center">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center text-[#16A34A] mb-3">
            <Banknote size={26} />
          </div>
          
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
            Winnings Available for Withdrawal
          </p>
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-[#16A34A] italic mb-4 tabular-nums">
            ₹{availableWinnings.toLocaleString()}
          </h3>

          <div className="w-full space-y-2 text-left">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 pl-1">
              Enter Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-[#16A34A]">
                ₹
              </span>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setFormError(null);
                }}
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-2xl py-3.5 pl-9 pr-4 text-xl font-black tracking-tight outline-none text-slate-900 placeholder:text-slate-400 tabular-nums transition-all select-text"
                placeholder="0"
                min="100"
                max={availableWinnings}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {presetAmounts.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmount(String(preset));
                    setFormError(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border tabular-nums transition-all cursor-pointer ${
                    amount === String(preset)
                      ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-[#16A34A] hover:border-emerald-300'
                  }`}
                >
                  ₹{preset}
                </button>
              ))}
              {availableWinnings > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAmount(String(availableWinnings));
                    setFormError(null);
                  }}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border bg-emerald-50 border-emerald-200 text-[#16A34A] hover:bg-[#16A34A] hover:text-white transition-all ml-auto cursor-pointer tabular-nums"
                >
                  Max (₹{availableWinnings})
                </button>
              )}
            </div>

            <div className="flex justify-between px-1 pt-1 text-[8px] font-black text-slate-500 uppercase tracking-wider">
              <span>Min: ₹100</span>
              <span>Daily Limit: ₹50,000</span>
            </div>
          </div>
        </section>

        <div className="mb-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#16A34A] mb-2.5 block pl-1">
            Choose Withdrawal Method
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setPayoutMethod('upi');
                setFormError(null);
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer ${
                payoutMethod === 'upi'
                  ? 'bg-[#ECFDF5]/70 border-2 border-[#16A34A] text-slate-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                payoutMethod === 'upi' ? 'bg-[#16A34A] text-white' : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}>
                <Smartphone size={18} />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-tight text-slate-900">UPI Transfer</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase">GPay / PhonePe / Paytm</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setPayoutMethod('bank');
                setFormError(null);
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer ${
                payoutMethod === 'bank'
                  ? 'bg-[#ECFDF5]/70 border-2 border-[#16A34A] text-slate-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                payoutMethod === 'bank' ? 'bg-[#16A34A] text-white' : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}>
                <Landmark size={18} />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-tight text-slate-900">Bank A/C</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase">IMPS / NEFT</p>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 mb-6 space-y-4 shadow-xs">
          {payoutMethod === 'upi' ? (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                  UPI ID (VPA) <span className="text-[#16A34A]">*</span>
                </label>
                <input 
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="Ex: 9876543210@upi"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all select-text"
                />
                <p className="text-[9px] text-slate-500 pl-1">
                  Works with PhonePe, Google Pay, Paytm, BHIM UPI.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                  Account Holder Name
                </label>
                <input 
                  type="text"
                  value={upiHolderName}
                  onChange={(e) => setUpiHolderName(e.target.value)}
                  placeholder="Ex: Arman Patel"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all select-text"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                  Bank Account Number <span className="text-[#16A34A]">*</span>
                </label>
                <input 
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex: 123456789012"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all font-mono select-text"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                  Confirm Account Number <span className="text-[#16A34A]">*</span>
                </label>
                <input 
                  type="text"
                  inputMode="numeric"
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="Re-enter bank account number"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all font-mono select-text"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                    IFSC Code <span className="text-[#16A34A]">*</span>
                  </label>
                  <input 
                    type="text"
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                    placeholder="Ex: SBIN0001234"
                    maxLength={11}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all font-mono uppercase select-text"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                    Bank Name
                  </label>
                  <input 
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Ex: SBI, HDFC"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck="false"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all select-text"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                  Account Holder Name
                </label>
                <input 
                  type="text"
                  value={bankHolderName}
                  onChange={(e) => setBankHolderName(e.target.value)}
                  placeholder="Ex: Arman Patel"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15 rounded-xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-hidden transition-all select-text"
                />
              </div>
            </>
          )}

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2 font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex gap-3.5 items-start">
          <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <h5 className="text-[10px] font-black uppercase tracking-widest text-amber-800">
              Direct Admin Approval
            </h5>
            <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
              Withdrawal requests are reviewed and approved directly by the AP Tournament admin team. Ensure your UPI ID / Account details are correct.
            </p>
          </div>
        </div>

        <button 
          onClick={handleWithdraw}
          disabled={loading || parseInt(amount) < 100 || parseInt(amount) > availableWinnings}
          className={`w-full h-14 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all tabular-nums ${
            loading || parseInt(amount) < 100 || parseInt(amount) > availableWinnings
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
              : 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm active:scale-98 cursor-pointer'
          }`}
        >
          {loading ? (
            <Loader2 className="animate-spin text-white" size={18} />
          ) : (
            <span>Request Withdrawal of ₹{amount || '0'}</span>
          )}
        </button>
      </div>
    </div>
  );
}
