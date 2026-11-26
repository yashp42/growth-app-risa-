import { useEffect, useRef, useState } from 'react';

/**
 * Live microphone level (0..1) from a local Web Audio AnalyserNode, used only
 * to animate the orb while listening. The stream stays in the browser: nothing
 * is recorded or sent anywhere, and the tracks stop as soon as `active` ends.
 */
export function useMicLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let lastEmit = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        const tick = (t: number) => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          // ~30 updates/s is plenty for a pulse and keeps React renders cheap.
          if (t - lastEmit > 33) {
            lastEmit = t;
            setLevel(Math.min(1, rms * 4));
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Permission denied or no device: the orb still shows "listening" without a level.
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      setLevel(0);
    };
  }, [active]);

  return level;
}
