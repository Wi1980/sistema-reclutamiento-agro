import { useEffect, useRef } from 'react';

/**
 * Llama a `fn` cada `intervalMs` milisegundos mientras el documento esté visible.
 * Se pausa automáticamente cuando el usuario cambia de pestaña y reanuda al volver.
 */
export function useAutoRefresh(fn: () => void, intervalMs = 30_000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') fnRef.current();
      }, intervalMs);
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        fnRef.current(); // refresca inmediatamente al volver a la pestaña
        start();
      } else {
        stop();
      }
    }

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
