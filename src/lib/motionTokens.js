/**
 * Shared motion tokens for Calori Life — springs, easings and reusable variants.
 * Kept separate from the component helpers (motion.jsx) so React Fast Refresh
 * stays happy. Import components from `./motion`, tokens from here.
 */

export const transitions = {
  // Snappy tactile feedback (taps, toggles).
  snappy: { type: 'spring', stiffness: 520, damping: 30, mass: 0.7 },
  // Smooth content/layout movement.
  smooth: { type: 'spring', stiffness: 260, damping: 28 },
  // Gentle entrance ease.
  enter: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  // Quick exit.
  exit: { duration: 0.2, ease: [0.4, 0, 1, 1] },
};

export const STAGGER_STEP = 0.06;

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: transitions.enter },
};

export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transitions.enter },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: transitions.enter },
};

export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER_STEP } },
};
