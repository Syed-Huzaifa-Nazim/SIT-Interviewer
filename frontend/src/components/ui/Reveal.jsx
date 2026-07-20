import React from 'react';
import useInView from '../../hooks/useInView';

/**
 * Scroll-triggered entrance wrapper: invisible until the element enters the viewport,
 * then plays the existing slide-up/fade-in keyframes (index.css) exactly once. Reuses the
 * app's established animation tokens instead of introducing a new animation library —
 * prefers-reduced-motion is already handled globally in index.css.
 */
const Reveal = ({ children, as: Tag = 'div', delay = 0, className = '', variant = 'up' }) => {
  const [ref, inView] = useInView();
  const animClass = variant === 'fade' ? 'animate-fade-in' : 'animate-slide-up';

  return (
    <Tag
      ref={ref}
      className={`${inView ? animClass : 'opacity-0'} ${className}`}
      style={inView && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
};

export default Reveal;
