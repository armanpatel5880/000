import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Banner, Page } from '../types';
import SafeImage from './SafeImage';

interface HeroBannerCarouselProps {
  banners: Banner[];
  onPageChange: (page: Page, id?: string) => void;
}

const FALLBACK_BANNERS: Banner[] = [
  {
    id: 'wp-channel-banner',
    imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop',
    redirectUrl: 'https://whatsapp.com/channel',
    type: 'main',
    order: 1,
    isActive: true
  },
  {
    id: 'esports-banner-2',
    imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop',
    redirectUrl: '',
    type: 'main',
    order: 2,
    isActive: true
  }
];

export default function HeroBannerCarousel({ banners, onPageChange }: HeroBannerCarouselProps) {
  const activeBanners = (banners && banners.length > 0) ? banners : FALLBACK_BANNERS;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (activeBanners.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    }, 6000);

    return () => clearInterval(timer);
  }, [activeBanners.length, isPaused]);

  const currentBanner = activeBanners[currentIndex] || activeBanners[0];

  const handleBannerClick = (banner: Banner) => {
    if (banner.redirectUrl) {
      const url = banner.redirectUrl.trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.open(url, '_blank');
        return;
      }
    }
    onPageChange(Page.TOURNAMENTS, 'freefire');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0) {
        setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
      }
    }
    touchStartX.current = null;
  };

  return (
    <section className="px-4 sm:px-5 mt-3.5">
      <div
        className="relative w-full aspect-[2.1/1] sm:aspect-[2.2/1] rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200 shadow-sm bg-white select-none"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBanner.id || currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={() => handleBannerClick(currentBanner)}
            className="w-full h-full relative cursor-pointer group flex items-center justify-between"
          >
            {currentBanner.id === 'wp-channel-banner' ? (
              <div className="w-full h-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] relative overflow-hidden flex items-center justify-between px-3 sm:px-5 py-2.5">
                <div className="relative z-10 w-28 sm:w-36 h-full flex items-end">
                  <img
                    src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=600&auto=format&fit=crop"
                    alt="Free Fire Hero"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-xl shadow-md border-2 border-white/25"
                  />
                  <div className="absolute -bottom-1 -left-1 bg-[#0F172A]/90 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-white/30 shadow-xs">
                    FF MAX
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center text-center pl-2 z-10">
                  <div className="flex items-center gap-1.5 justify-center mb-1">
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-[#16A34A] bg-white px-2.5 py-0.5 rounded-full shadow-xs">
                      AP TOURNAMENT
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2 my-1">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs border border-white/40 flex items-center justify-center text-white shadow-sm">
                      <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.587-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.075-2.222-.557-1.954-.809-3.21-2.794-3.307-2.923-.098-.129-.79-1.05-.79-2.001 0-.952.497-1.42.673-1.615.176-.195.385-.244.513-.244.128 0 .256.002.368.008.117.006.275-.045.43.328.16.388.545 1.332.593 1.43.048.098.08.213.016.34-.064.129-.096.21-.192.32-.096.11-.202.247-.289.332-.097.095-.198.198-.085.392.113.194.502.828 1.077 1.341.741.661 1.365.865 1.559.962.194.097.307.081.42-.049.113-.129.484-.564.613-.757.129-.194.258-.161.435-.097.177.065 1.125.531 1.318.628.193.097.322.145.37.227.049.081.049.469-.095.874z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] sm:text-sm font-black italic tracking-tight text-white leading-none">
                        FOLLOW OUR
                      </p>
                      <p className="text-[12px] sm:text-base font-black italic tracking-tight text-emerald-300 leading-none">
                        CHANNEL
                      </p>
                    </div>
                  </div>

                  <p className="text-[7.5px] sm:text-[9px] font-bold uppercase tracking-wider text-emerald-100 leading-none mt-1">
                    FOR DAILY UPDATES & REWARDS
                  </p>
                </div>
              </div>
            ) : (
              <>
                <SafeImage
                  src={currentBanner.imageUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'}
                  alt="Esports Banner"
                  className="w-full h-full object-cover"
                  imgClassName="group-hover:scale-105 transition-transform duration-700 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/65 to-transparent" />
                <div className="absolute inset-y-0 left-0 p-4 sm:p-5 flex flex-col justify-center max-w-[70%] z-10">
                  <span className="inline-block w-fit text-[8px] font-black uppercase tracking-widest bg-[#16A34A] text-white px-2 py-0.5 rounded mb-1.5">
                    Esports Arena
                  </span>
                  <h2 className="text-base sm:text-xl font-black italic uppercase tracking-tight text-white leading-none">
                    PLAY & WIN
                  </h2>
                  <h2 className="text-base sm:text-xl font-black italic uppercase tracking-tight text-emerald-400 leading-none mt-1">
                    DAILY TOURNAMENTS
                  </h2>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {activeBanners.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {activeBanners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                idx === currentIndex
                  ? 'w-5 bg-[#16A34A]'
                  : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
