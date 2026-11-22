import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Zap, 
  Loader2, 
  ShieldCheck, 
  AlertCircle
} from 'lucide-react';
import { Page, PaymentGateway } from '../types';
import { auth } from '../lib/firebase';
import { paymentService } from '../services/paymentService';

interface AddMoneyProps {
  onPageChange: (page: Page) => void;
}

export default function AddMoney({ onPageChange }: AddMoneyProps) {
  const [amount, setAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);
  const [pollingOrderId, setPollingOrderId] = useState<string | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const isCheckingStatusRef = useRef(false);

  const presetAmounts = ['50', '100', '200', '500', '1000'];

  const numericAmount = parseInt(amount, 10);
  const isAmountValid = !isNaN(numericAmount) && numericAmount >= 10 && numericAmount <= 10000;
  const isBelowMin = !isNaN(numericAmount) && numericAmount > 0 && numericAmount < 10;
  const isAboveMax = !isNaN(numericAmount) && numericAmount > 10000;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    if (pollingActive && pollingOrderId) {
      setPollingTimedOut(false);
      isCheckingStatusRef.current = false;

      timeout = setTimeout(() => {
        if (!cancelled) {
          setPollingActive(false);
          setPollingTimedOut(true);
        }
      }, 5 * 60 * 1000);

      const checkStatus = async () => {
        if (cancelled || isCheckingStatusRef.current) return;
        isCheckingStatusRef.current = true;
        try {
          const res = await fetch('/api/zapupi/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: pollingOrderId })
          });

          if (!cancelled && res.ok) {
            const data = await res.json();
            const detailSt = String(data.detail?.status || data.detail?.order_status || '').toLowerCase();
            const isFinished = data.status === 'success' || detailSt === 'success' || detailSt === 'paid' || detailSt === 'completed';

            if (isFinished) {
              if (interval) clearInterval(interval);
              if (timeout) clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              setTimeout(() => {
                onPageChange(Page.WALLET);
              }, 500);
            } else if (data.status === 'failed' || detailSt === 'failed' || detailSt === 'failure') {
              if (interval) clearInterval(interval);
              if (timeout) clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              onPageChange(Page.WALLET);
            }
          }
        } catch (err) {
          console.error('[AddMoney] Polling error:', err);
        } finally {
          isCheckingStatusRef.current = false;
        }
      };

      checkStatus();
      interval = setInterval(checkStatus, 3000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [pollingActive, pollingOrderId, onPageChange]);

  useEffect(() => {
    const fetchGateway = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      setActiveGateway(g);
    };
    fetchGateway();
  }, []);

  const handleDeposit = async () => {
    if (loading || !auth.currentUser || !amount) return;
    const value = parseInt(amount, 10);
    if (isNaN(value) || value < 10 || value > 10000) return;

    setErrorMessage(null);
    setLoading(true);
    try {
      const gateway = activeGateway || await paymentService.getActiveGatewayAsync();
      const result: any = await paymentService.initiateDeposit(value, auth.currentUser.uid);

      if (result?.type === 'zapupi' && result?.order_id) {
        setPollingOrderId(result.order_id);
        setPollingActive(true);
        if (result.payment_url) {
          window.open(result.payment_url, '_blank');
        }
        return;
      }

      if (gateway?.id === 'cashfree') {
        // Cashfree SDK handles checkout redirection & webhook verifies payment server-side
        return;
      }

      if (result?.directFallback) {
        setErrorMessage('Payment gateway is temporarily unavailable. Please try again in a moment.');
        return;
      }

      setErrorMessage('Could not initiate payment order. Please try again.');
    } catch (error: any) {
      console.error('[AddMoney] Payment initiation error:', error);
      setErrorMessage(error?.message || 'Payment initiation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAmountClick = (val: string) => {
    setAmount(val);
  };

  const handleClear = () => {
    setAmount('');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 max-w-lg mx-auto select-none relative border-x border-slate-200">
      {/* 1. HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md text-slate-900 shadow-2xs border-b border-slate-200 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="p-1.5 -ml-1 text-slate-600 hover:text-[#16A34A] hover:bg-slate-100 rounded-xl transition-colors active:scale-95 flex items-center justify-center cursor-pointer"
            aria-label="Back to Wallet"
          >
            <ChevronLeft size={22} className="stroke-[2.5]" />
          </button>
          <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
            Add Coins / Cash
          </h1>
        </div>

        <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase text-[#16A34A] border border-emerald-200">
          <ShieldCheck size={13} className="text-[#16A34A]" />
          <span>Secure</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* 2. PAYMENT PROVIDER CARD */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center text-[#16A34A] shrink-0">
            <Zap size={20} className="fill-[#16A34A] text-[#16A34A]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs sm:text-sm font-black text-slate-900 leading-tight">
              Instant Payment via {activeGateway?.name || 'ZapUPI'}
            </h2>
            <p className="text-[11px] font-bold text-[#16A34A] mt-0.5 tracking-tight">
              Secure & Fast • UPI, Google Pay, PhonePe, Cards
            </p>
          </div>
        </div>

        {/* 3. AMOUNT SECTION */}
        <div className="pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <span className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 text-[#16A34A] flex items-center justify-center text-[11px] font-black">₹</span>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider">
              Amount (Min: ₹10 | Max: ₹10,000)
            </h3>
          </div>

          <div className="mt-3 bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs flex items-center justify-between focus-within:border-[#16A34A] focus-within:ring-2 focus-within:ring-[#16A34A]/15 transition-all">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xl sm:text-2xl font-black text-[#16A34A]">₹</span>
              <input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent text-xl sm:text-2xl font-black text-slate-900 tabular-nums placeholder:text-slate-400 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {amount && (
              <button
                onClick={handleClear}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg active:scale-95 transition-all cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {isBelowMin && (
            <p className="text-[11px] font-bold text-red-600 mt-1.5 flex items-center gap-1 pl-1">
              <AlertCircle size={13} />
              <span>Minimum deposit amount is ₹10</span>
            </p>
          )}
          {isAboveMax && (
            <p className="text-[11px] font-bold text-red-600 mt-1.5 flex items-center gap-1 pl-1">
              <AlertCircle size={13} />
              <span>Maximum deposit amount is ₹10,000</span>
            </p>
          )}
        </div>

        {/* 4. QUICK AMOUNT BUTTONS */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {presetAmounts.map((preset) => {
            const isSelected = amount === preset;
            return (
              <button
                key={preset}
                onClick={() => handleQuickAmountClick(preset)}
                className={`py-3 sm:py-3.5 px-2 rounded-xl text-xs sm:text-sm font-black tabular-nums transition-all active:scale-95 border cursor-pointer ${
                  isSelected
                    ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300 hover:text-[#16A34A]'
                }`}
              >
                ₹{preset}
              </button>
            );
          })}

          <button
            onClick={handleClear}
            className="py-3 sm:py-3.5 px-2 rounded-xl text-xs sm:text-sm font-black bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
          >
            Clear
          </button>
        </div>

        {/* 5. MAIN PAYMENT BUTTON */}
        <div className="pt-2 space-y-2.5">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2 font-bold">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <button
            onClick={handleDeposit}
            disabled={loading || !isAmountValid}
            className="w-full py-4 sm:py-4.5 bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl sm:rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin text-white" size={18} />
                <span>PROCESSING...</span>
              </>
            ) : (
              <span>ADD CASH VIA {(activeGateway?.name || 'ZAPUPI').toUpperCase()}</span>
            )}
          </button>
        </div>

        {/* 6. PAYMENT INFORMATION / SAFETY CARD */}
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xs space-y-3.5">
          {[
            'Do not press back during payment.',
            'Wait till the payment gets confirmed.',
            'Payment is 100% secure.',
            'Accepts all UPI apps (GPay, PhonePe, Paytm).',
            'No hidden charges.',
            'Instant deposit confirmation.',
            'Contact support for any transaction issues.'
          ].map((text, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] mt-2 shrink-0" />
              <p className="text-xs sm:text-[13px] font-medium text-slate-600 leading-snug">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 7. POLLING & VERIFICATION MODAL OVERLAY */}
      <AnimatePresence>
        {pollingActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 15 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 text-slate-900 shadow-xl text-center border border-slate-200 relative overflow-hidden"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#ECFDF5] border-2 border-[#BBF7D0] flex items-center justify-center mx-auto mb-5 text-[#16A34A]">
                <Loader2 className="animate-spin text-[#16A34A]" size={28} />
              </div>

              <h3 className="text-base sm:text-lg font-black uppercase text-slate-900 mb-1">
                {pollingTimedOut ? (
                   <span className="text-red-600">Verification Timed Out</span>
                ) : (
                   <>Verifying <span className="text-[#16A34A]">Payment</span></>
                )}
              </h3>

              <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
                {pollingTimedOut
                  ? "Payment verification timed out. If your funds were deducted, please reach out to support with your Order ID."
                  : "We're confirming your transaction with ZapUPI. Please do not close or refresh this page."}
              </p>

              {pollingOrderId && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-6 text-[11px] font-mono text-slate-600">
                  Order ID: <span className="font-bold text-[#16A34A] select-all">{pollingOrderId}</span>
                </div>
              )}

              <button
                onClick={() => {
                  setPollingActive(false);
                  setPollingOrderId(null);
                  setPollingTimedOut(false);
                }}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                {pollingTimedOut ? 'Close & Return' : 'Cancel & Return to Wallet'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
