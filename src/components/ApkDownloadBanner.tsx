import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle, ExternalLink } from 'lucide-react';

export default function ApkDownloadBanner() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    // Create a virtual manifest / PWA install instruction or direct download link
    const element = document.createElement('a');
    const file = new Blob([
      JSON.stringify({
        name: 'AP Tournament',
        short_name: 'AP Tourney',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#16A34A',
        icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
      }, null, 2)], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = 'ap-tournament-manifest.json';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div className="bg-gradient-to-r from-emerald-900 to-[#16A34A] text-white p-4 rounded-3xl shadow-xl my-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-emerald-500/30">
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shrink-0">
          <Smartphone size={24} className="animate-pulse" />
        </div>
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider">Download Android APK & App</h4>
          <p className="text-[11px] text-emerald-100 font-medium mt-0.5">
            Install AP Tournament on your phone for instant push notifications & fast room access.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <a
          href="/manifest.json"
          download="ap-tournament.json"
          className="flex-1 sm:flex-none px-5 py-3 bg-white text-[#16A34A] hover:bg-emerald-50 active:scale-95 font-black text-xs uppercase tracking-wider rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Download size={16} />
          <span>Download PWA / APK Config</span>
        </a>
      </div>
    </div>
  );
}
