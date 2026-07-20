import { useEffect, useRef, useState } from 'react';

/**
 * Fires once when the element first scrolls into view, using IntersectionObserver
 * (cheap — no scroll-event polling). Stays true afterwards so entrance animations don't
 * replay on scroll-up. CSS handles prefers-reduced-motion (index.css zeroes animation
 * durations globally), so this hook doesn't need its own reduced-motion branch.
 */
const useInView = ({ threshold = 0.15, rootMargin = '0px 0px -80px 0px' } = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // If IntersectionObserver isn't available for any reason, just show content.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView];
};

export default useInView;
