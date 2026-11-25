import React, { useState, useEffect } from 'react';

interface SafeImageProps {
  src?: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackSrc?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  showLoader?: boolean;
}

export const APP_LOGO_CIRCLE = '/pwa-192x192.png';
export const APP_LOGO_SQUARE = '/pwa-512x512.png';
export const APP_LOGO = APP_LOGO_SQUARE;

export default function SafeImage({ 
  src, 
  alt = "Image", 
  className = "", 
  imgClassName = "",
  fallbackSrc = APP_LOGO,
  objectFit = 'cover'
}: SafeImageProps) {
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src || fallbackSrc);

  useEffect(() => {
    setError(false);
    setCurrentSrc(src || fallbackSrc);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (!error) {
      setError(true);
      setCurrentSrc(fallbackSrc);
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        src={currentSrc || fallbackSrc}
        alt={alt}
        onError={handleError}
        className={`w-full h-full object-${objectFit} relative z-10 ${imgClassName}`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
