import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { transitions, fadeUp, fade, staggerContainer } from './motionTokens';

/**
 * Shared motion components for Calori Life. All helpers honour the user's
 * "reduce motion" OS setting and collapse to a plain fade (or nothing) when on.
 * Motion tokens (springs, easings, variants) live in ./motionTokens.
 */

/** Fade + slide-up entrance. Optional `delay` (seconds). */
export function FadeIn({ children, delay = 0, y = 16, className, ...rest }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ ...transitions.enter, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered container — direct `<Stagger.Item>` children cascade in. Use as the
 * wrapper around a list/grid of cards.
 */
export function Stagger({ children, className, ...rest }) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      {...rest}
    >
      {children}
    </motion.div>
  );
}

Stagger.Item = function StaggerItem({ children, as = 'div', className, variant = fadeUp, ...rest }) {
  const reduce = useReducedMotion();
  const Comp = motion[as] || motion.div;
  return (
    <Comp className={className} variants={reduce ? fade : variant} {...rest}>
      {children}
    </Comp>
  );
};

/** Tactile scale-down press feedback for cards/buttons. Renders a `<button>` by default. */
export function Pressable({ children, as = 'button', scale = 0.96, className, ...rest }) {
  const reduce = useReducedMotion();
  const Comp = motion[as] || motion.button;
  return (
    <Comp
      className={className}
      whileTap={reduce ? undefined : { scale }}
      transition={transitions.snappy}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/**
 * Wrap a routed view so it cross-fades/slides on mount-unmount. Give each view a
 * stable, unique `routeKey` and render inside a single shared
 * `<AnimatePresence mode="wait">`.
 */
export function PageTransition({ children, routeKey, className }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={routeKey}
        className={className}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
        transition={transitions.enter}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
