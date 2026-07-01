import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const QUOTES = [
  'מחשבים לך את הדרך להצלחה...',
  'הבריאות שלך היא ההשקעה הטובה ביותר',
  'כל יום הוא הזדמנות חדשה לשינוי',
  'אנחנו בונים עבורך תוכנית אישית',
  'איכות היא לא מעשה, היא הרגל',
  'הצעד הראשון הוא הכי חשוב',
];

// Cream v3 — mirrors the in-app header/cards: warm canvas, serif accents,
// hairline borders, green/purple brand gradient.
export const BrandedLoadingScreen = () => {
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentQuoteIndex((prev) => (prev + 1) % QUOTES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="h-screen w-full flex flex-col justify-between select-none overflow-hidden relative"
      style={{ background: '#FAF7F2' }}
      dir="rtl"
    >
      {/* Brand gradient hairline along the top — same as in-app hero cards */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #065F46, #7C3AED 50%, #2563EB)' }} />
      {/* Warm radial glows */}
      <div style={{ position: 'absolute', top: -120, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(5,150,105,.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -100, left: -90, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="h-10" />

      {/* Main Centered Branding Block */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Floating App Video Logo — cream card framing */}
        <motion.div
          animate={{ y: [-7, 7] }}
          transition={{ repeat: Infinity, repeatType: 'reverse', duration: 2.5, ease: 'easeInOut' }}
          className="w-[170px] h-[170px] overflow-hidden"
          style={{ borderRadius: 32, border: '1px solid rgba(180,140,80,.18)', boxShadow: '0 18px 50px rgba(40,20,0,.14), 0 6px 18px rgba(5,150,105,.12)' }}
        >
          <video
            src="/loading_animation.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover pointer-events-none"
          />
        </motion.div>

        {/* Wordmark — identical lineage to the in-app header */}
        <h1 className="mt-6 leading-none" dir="ltr" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', color: '#2A1A0A' }}>
          calori
          <span style={{ color: '#059669', fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 35 }}> life</span>
        </h1>

        {/* Indeterminate progress bar — warm track, green sweep */}
        <div className="mt-6 w-[170px] h-[3px] rounded-full overflow-hidden relative" style={{ background: 'rgba(180,140,80,.15)' }}>
          <motion.div
            className="h-full w-[35%] rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, #059669, transparent)' }}
            animate={{ x: ['-100%', '300%'] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
          />
        </div>
      </div>

      {/* Footer Info Block */}
      <div className="pb-[110px] px-10 flex flex-col items-center text-center">
        {/* Rotating quotes — serif italic, warm ink */}
        <div className="h-[54px] flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentQuoteIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="leading-[1.5] max-w-[300px]"
              style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 18, color: '#5A4A3A' }}
            >
              {QUOTES[currentQuoteIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Version — Fraunces italic, green em like settings */}
        <div className="mt-2 select-text" dir="ltr" style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontWeight: 600, fontSize: 13, color: '#8A7A6A', letterSpacing: '-.01em' }}>
          Calori Life · <em style={{ color: '#059669' }}>v7.1.3</em>
        </div>

        {/* Indicator dots — warm inactive, green active */}
        <div className="mt-5 flex justify-center items-center gap-2" dir="ltr">
          {QUOTES.map((_, i) => {
            const isActive = currentQuoteIndex === i;
            return (
              <motion.div
                key={i}
                animate={{ width: isActive ? 22 : 6, background: isActive ? '#059669' : 'rgba(180,140,80,.25)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{ height: 6, borderRadius: 999 }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
