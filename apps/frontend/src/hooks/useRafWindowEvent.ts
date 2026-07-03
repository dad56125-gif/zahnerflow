import { RefObject, useEffect, useRef } from 'react';

interface RafWindowEventOptions {
  capture?: boolean;
  passive?: boolean;
}

export function useRafEvent<Target extends EventTarget, EventType extends Event>(
  targetRef: RefObject<Target>,
  eventName: string,
  callback: (event: EventType) => void,
  enabled = true,
  options: RafWindowEventOptions = {}
) {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number | null>(null);
  const latestEventRef = useRef<EventType | null>(null);
  const { capture = false, passive = true } = options;

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const target = targetRef.current;
    if (!enabled || !target) return;

    const listener = (event: Event) => {
      latestEventRef.current = event as EventType;
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const latestEvent = latestEventRef.current;
        if (latestEvent) {
          callbackRef.current(latestEvent);
        }
      });
    };

    const listenerOptions: AddEventListenerOptions = { capture, passive };
    target.addEventListener(eventName, listener, listenerOptions);

    return () => {
      target.removeEventListener(eventName, listener, { capture });
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      latestEventRef.current = null;
    };
  }, [capture, enabled, eventName, passive, targetRef]);
}

export function useRafWindowEvent<K extends keyof WindowEventMap>(
  eventName: K,
  callback: (event: WindowEventMap[K]) => void,
  enabled = true,
  options: RafWindowEventOptions = {}
) {
  const windowRef = useRef<Window>(window);
  useRafEvent<Window, WindowEventMap[K]>(windowRef, eventName, callback, enabled, options);
}
