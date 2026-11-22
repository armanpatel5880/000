import React, { useState, useEffect } from 'react';
import apOldLogoCircle from '../assets/images/ap_old_logo_circle.png';
import apOldLogoSquare from '../assets/images/ap_old_logo_square.png';

interface SafeImageProps {
  src?: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackSrc?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  showLoader?: boolean;
}

export const APP_LOGO_CIRCLE = apOldLogoCircle;
export const APP_LOGO_SQUARE = apOldLogoSquare;
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
