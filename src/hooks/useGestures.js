/**
 * useGestures — Hook unifié pour tous les gestes mobile
 * Swipe navigation, bottom sheets, transitions, long press, pull-to-refresh
 * Respecte prefers-reduced-motion, alternatives accessibles incluses.
 */
import { useRef, useEffect, useCallback, useState } from 'react';

export function useGestures({ elementRef, thresholds = {}, accessibility = true }) {
  const {
    swipe = 60,
    longPress = 400,
    pullRefresh = 80,
  } = thresholds;

  const [gestureState, setGestureState] = useState({
    isSwiping: false,
    swipeDirection: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  const longPressTimer = useRef(null);
  const isLongPress = useRef(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    try { reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (!elementRef.current) return;
    if (reduceMotion.current) return;

    const touch = e.touches[0];
    setGestureState({
      isSwiping: true,
      swipeDirection: null,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
    });

    // Long press timer
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      const el = elementRef.current;
      if (el) {
        const event = new CustomEvent('sg-longpress', { detail: { x: touch.clientX, y: touch.clientY, target: el } });
        el.dispatchEvent(event);
      }
    }, longPress);
  }, [elementRef, longPress]);

  const handleTouchMove = useCallback((e) => {
    if (!gestureState.isSwiping || reduceMotion.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - gestureState.startX;
    const deltaY = touch.clientY - gestureState.startY;

    setGestureState(prev => ({
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY,
      swipeDirection: Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX > 0 ? 'right' : 'left')
        : (deltaY > 0 ? 'down' : 'up'),
    }));

    // Cancel long press if moved too much
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      isLongPress.current = false;
    }
  }, [gestureState.isSwiping, gestureState.startX, gestureState.startY]);

  const handleTouchEnd = useCallback(() => {
    if (!gestureState.isSwiping || reduceMotion.current) return;

    const deltaX = gestureState.currentX - gestureState.startX;
    const deltaY = gestureState.currentY - gestureState.startY;
    const direction = gestureState.swipeDirection;

    // Clear long press timer
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    isLongPress.current = false;

    const el = elementRef.current;
    if (el && Math.abs(deltaX) > swipe || Math.abs(deltaY) > swipe) {
      const event = new CustomEvent('sg-swipe', {
        detail: { direction, deltaX, deltaY, target: el }
      });
      el.dispatchEvent(event);
    }

    setGestureState({
      isSwiping: false,
      swipeDirection: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
  }, [gestureState, elementRef, swipe]);

  const handleTouchCancel = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    isLongPress.current = false;
    setGestureState({
      isSwiping: false,
      swipeDirection: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
  }, []);

  // Attach listeners
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const opts = { passive: true };
    el.addEventListener('touchstart', handleTouchStart, opts);
    el.addEventListener('touchmove', handleTouchMove, opts);
    el.addEventListener('touchend', handleTouchEnd, opts);
    el.addEventListener('touchcancel', handleTouchCancel, opts);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart, opts);
      el.removeEventListener('touchmove', handleTouchMove, opts);
      el.removeEventListener('touchend', handleTouchEnd, opts);
      el.removeEventListener('touchcancel', handleTouchCancel, opts);
    };
  }, [elementRef, handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  // Keyboard accessibility alternatives
  useEffect(() => {
    if (!accessibility) return;

    const handleKeyDown = (e) => {
      const el = elementRef.current;
      if (!el) return;

      // Arrow keys for swipe navigation
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
        const event = new CustomEvent('sg-swipe', { detail: { direction, keyboard: true, target: el } });
        el.dispatchEvent(event);
      }

      // Space/Enter for long press equivalent
      if (['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        const event = new CustomEvent('sg-longpress', { detail: { keyboard: true, target: el } });
        el.dispatchEvent(event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [elementRef, accessibility]);

  return {
    ...gestureState,
    // Helper to check if swipe threshold met
    hasSwiped: Math.abs(gestureState.currentX - gestureState.startX) > swipe ||
      Math.abs(gestureState.currentY - gestureState.startY) > swipe,
  };
}

/**
 * useSwipeNavigation — Navigation par swipe entre fiches plages
 * Gauche = plage suivante, Droite = plage précédente
 */
export function useSwipeNavigation({ beaches = [], currentIndex = 0, onNavigate, enabled = true }) {
  const containerRef = useRef(null);

  const handleSwipe = useCallback((e) => {
    if (!enabled) return;
    const { direction } = e.detail;
    if (direction === 'left' && currentIndex < beaches.length - 1) {
      onNavigate?.(currentIndex + 1);
    } else if (direction === 'right' && currentIndex > 0) {
      onNavigate?.(currentIndex - 1);
    }
  }, [beaches, currentIndex, onNavigate, enabled]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('sg-swipe', handleSwipe);
    return () => el.removeEventListener('sg-swipe', handleSwipe);
  }, [handleSwipe]);

  return containerRef;
}

/**
 * useBottomSheet — Gestion bottom sheet (swipe down pour fermer, drag handle)
 * États : closed / peek / half / full
 */
export function useBottomSheet({ initialState = 'closed', snapPoints = [0, 0.4, 0.8, 1] }) {
  const [state, setState] = useState(initialState);
  const [dragOffset, setDragOffset] = useState(0);
  const sheetRef = useRef(null);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const open = useCallback((to = 'full') => setState(to), []);
  const close = useCallback(() => setState('closed'), []);
  const toggle = useCallback(() => setState(s => s === 'closed' ? 'full' : 'closed'), []);

  const handleTouchStart = useCallback((e) => {
    if (!e.target.closest('[data-sheet-handle]')) return;
    isDragging.current = true;
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging.current) return;
    const deltaY = e.touches[0].clientY - startY.current;
    // Swipe down = positive = close
    setDragOffset(deltaY);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const threshold = window.innerHeight * 0.15;
    if (dragOffset > threshold) {
      setState('closed');
    } else {
      setDragOffset(0);
    }
  }, []);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Compute transform
  const height = window.innerHeight;
  const snapHeight = state === 'closed' ? 0 : height * snapPoints[snapPoints.length - 1];
  const transformY = state === 'closed' ? height : height - snapHeight - dragOffset;

  return {
    sheetRef,
    state,
    open,
    close,
    toggle,
    setState,
    style: {
      transform: `translateY(${Math.max(0, transformY)}px)`,
      transition: isDragging.current ? 'none' : 'transform .3s cubic-bezier(.32,.72,.33,1)',
    },
  };
}

/**
 * useCardTransition — Transition carte → fiche (shared element)
 * Utilise View Transitions API si dispo, fallback CSS
 */
export function useCardTransition({ fromRef, toRef, onComplete }) {
  const [isTransitioning, setIsTransitioning] = useState(false);

  const startTransition = useCallback(() => {
    if (!fromRef.current || !toRef.current) {
      onComplete?.();
      return;
    }

    setIsTransitioning(true);

    // View Transitions API (modern browsers)
    if (document.startViewTransition && !reduceMotion()) {
      const transition = document.startViewTransition(async () => {
        onComplete?.();
      });
      transition.finished.then(() => setIsTransitioning(false));
    } else {
      // Fallback CSS animation
      fromRef.current.style.transition = 'opacity .2s, transform .3s cubic-bezier(.22,1,.36,1)';
      fromRef.current.style.opacity = '0';
      fromRef.current.style.transform = 'scale(0.95)';

      toRef.current.style.opacity = '0';
      toRef.current.style.transform = 'scale(1.05)';
      requestAnimationFrame(() => {
        toRef.current.style.transition = 'opacity .3s cubic-bezier(.22,1,.36,1), transform .3s cubic-bezier(.22,1,.36,1)';
        toRef.current.style.opacity = '1';
        toRef.current.style.transform = 'scale(1)';
      });

      setTimeout(() => {
        setIsTransitioning(false);
        onComplete?.();
      }, 350);
    }
  }, [fromRef, toRef, onComplete]);

  return { isTransitioning, startTransition };
}

function reduceMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * usePullToRefresh — Pull to refresh pour le feed d'accueil
 */
export function usePullToRefresh({ onRefresh, threshold = 80, containerRef }) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isActive = useRef(false);

  useEffect(() => {
    const el = containerRef?.current || window;
    if (!el) return;

    const handleTouchStart = (e) => {
      if (el === window ? window.scrollY === 0 : el.scrollTop === 0) {
        isActive.current = true;
        startY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      if (!isActive.current) return;
      const deltaY = e.touches[0].clientY - startY.current;
      if (deltaY > 0) {
        e.preventDefault();
        setIsPulling(true);
        setPullDistance(Math.min(deltaY * 0.5, threshold * 1.5));
      }
    };

    const handleTouchEnd = async () => {
      if (!isActive.current) return;
      isActive.current = false;
      if (pullDistance >= threshold) {
        setPullDistance(0);
        setIsPulling(false);
        await onRefresh?.();
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }
    };

    const opts = { passive: false };
    el.addEventListener('touchstart', handleTouchStart, opts);
    el.addEventListener('touchmove', handleTouchMove, opts);
    el.addEventListener('touchend', handleTouchEnd, opts);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart, opts);
      el.removeEventListener('touchmove', handleTouchMove, opts);
      el.removeEventListener('touchend', handleTouchEnd, opts);
    };
  }, [containerRef, onRefresh, threshold, pullDistance]);

  return { isPulling, pullDistance, progress: Math.min(pullDistance / threshold, 1) };
}

/**
 * usePressFeedback — Feedback tactile (ripple, scale, haptic) sur tout élément pressable
 */
export function usePressFeedback({ scale = 0.97, haptic = true }) {
  const elementRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    if (!elementRef.current) return;
    elementRef.current.style.transform = `scale(${scale})`;
    elementRef.current.style.transition = 'transform .06s ease';
    if (haptic && navigator.vibrate) navigator.vibrate(10);
  }, [scale, haptic]);

  const handleMouseUp = useCallback((e) => {
    if (!elementRef.current) return;
    elementRef.current.style.transform = 'scale(1)';
    elementRef.current.style.transition = 'transform .12s cubic-bezier(.34,1.56,.64,1)';
  }, []);

  const handleMouseLeave = useCallback((e) => {
    if (!elementRef.current) return;
    elementRef.current.style.transform = 'scale(1)';
    elementRef.current.style.transition = 'transform .12s cubic-bezier(.34,1.56,.64,1)';
  }, []);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('touchstart', handleMouseDown, { passive: true });
    el.addEventListener('touchend', handleMouseUp, { passive: true });
    el.addEventListener('touchcancel', handleMouseUp, { passive: true });

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('touchstart', handleMouseDown);
      el.removeEventListener('touchend', handleMouseUp);
      el.removeEventListener('touchcancel', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseUp, handleMouseLeave]);

  return elementRef;
}

export default useGestures;