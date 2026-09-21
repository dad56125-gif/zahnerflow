import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TutorialRunner, { type TutorialController, type TutorialEvent } from './TutorialRunner';
import { tutorialLessons } from './tutorialLessons';
import type { TutorialSession } from './tutorialSession';
import { runtimeSocket } from '../../runtimeClient';
import { WORKFLOW_SNAPSHOT } from '../../eventContracts';
import type { ExecutionSnapshot } from '@zahnerflow/types';

export default function TutorialPlayer({ lessonId, session, onClose, onReplay }: {
  lessonId: string;
  session: TutorialSession;
  onClose: (interrupted?: boolean) => void;
  onReplay: () => void;
}) {
  const controller = useMemo<TutorialController>(() => ({ send() {}, async stop() {} }), []);
  const instructions = useRef<HTMLElement>(null);
  const closing = useRef(false);
  const [status, setStatus] = useState<TutorialEvent>({ type: 'tutorial-state', step: 0, phase: 'loading', playing: true });
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const [exiting, setExiting] = useState(false);
  const lesson = tutorialLessons.find(item => item.id === lessonId)!;
  const step = lesson.steps[status.step ?? 0];
  const finish = useCallback(async (replay = false, interrupted = false) => {
    if (closing.current) return;
    closing.current = true;
    setExiting(true);
    await controller.stop();
    // Close lesson-opened business dialogs through their normal Escape handlers.
    for (let i = 0; i < 8 && document.querySelector('.overlay-layer:not([data-state="closing"])'); i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(resolve => window.setTimeout(resolve, 280));
    }
    await session.close();
    if (replay) onReplay();
    else onClose(interrupted);
  }, [controller, session, onClose, onReplay]);
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const receive = useCallback((event: TutorialEvent) => {
    if (event.type === 'tutorial-dismiss') { void finishRef.current(); return; }
    if (event.type === 'tutorial-focus') {
      const buttons = [...(instructions.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      (event.backward ? buttons.at(-1) : buttons[0])?.focus();
      return;
    }
    if (event.type === 'tutorial-target') {
      const target = event.rect;
      if (!target || !instructions.current) return;
      const { width, height } = instructions.current.getBoundingClientRect();
      const candidates = [
        { left: 24, top: window.innerHeight - 90 - height },
        { left: window.innerWidth - 24 - width, top: window.innerHeight - 90 - height },
        { left: (window.innerWidth - width) / 2, top: 80 },
      ];
      const overlap = (p: { left: number; top: number }) =>
        Math.max(0, Math.min(p.left + width, target.right + 12) - Math.max(p.left, target.left - 12)) *
        Math.max(0, Math.min(p.top + height, target.bottom + 12) - Math.max(p.top, target.top - 12));
      setPosition(candidates.reduce((best, candidate) => overlap(candidate) < overlap(best) ? candidate : best));
      return;
    }
    setStatus(event);
    window.dispatchEvent(new CustomEvent('tutorial-verification', { detail: event }));
    if (event.phase === 'ready') controller.send('play');
  }, [controller]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) { controller.send('pause'); setStatus(value => ({ ...value, playing: false })); }
    };
    const off = runtimeSocket.onLiveEvent((event, payload) => {
      if (event === WORKFLOW_SNAPSHOT && ['running', 'paused', 'cancelling'].includes((payload as ExecutionSnapshot).status))
        void finishRef.current(false, true);
    });
    if (['running', 'paused', 'cancelling'].includes(runtimeSocket.liveSnapshot?.status ?? 'idle')) void finishRef.current(false, true);
    document.addEventListener('visibilitychange', hidden);
    return () => { off(); document.removeEventListener('visibilitychange', hidden); };
  }, [controller]);
  const send = (command: string) => {
    controller.send(command);
    setStatus(value => ({ ...value, playing: command !== 'pause' }));
  };
  return createPortal(<div className="tutorial-player" data-tutorial-phase={exiting ? 'exiting' : status.phase} data-tutorial-step={status.step}>
    {exiting && <div className="tutorial-exit-shield" />}
    <TutorialRunner lessonId={lessonId} runtime={session.runtime} controller={controller} onEvent={receive} />
    <section ref={instructions} data-tutorial-controls onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} className="tutorial-instructions" style={position ? { ...position, bottom: 'auto' } : undefined} aria-label="教学控制" aria-live="polite" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); void finish(); }
    }}>
      <span className="tutorial-eyebrow">{status.phase === 'complete' ? '演示完成' : `${(status.step ?? 0) + 1} / ${lesson.steps.length}`} · {lesson.title}</span>
      <h3>{step.title}</h3><p>{status.error ?? step.text}</p>
      {status.phase === 'loading' && <small>正在准备教学数据…</small>}
      {status.phase === 'error' && <small role="alert">演示已停下，请重播或退出。</small>}
      <div className="tutorial-instructions__controls">
        <button className="btn btn--sm btn--secondary" disabled={exiting} onClick={() => void finish(true)}>从头重播</button>
        <button className="btn btn--sm btn--secondary" disabled={exiting || ['loading', 'complete', 'error', 'acting'].includes(status.phase ?? '')} onClick={() => send('next')}>下一步</button>
        <button className="btn btn--sm btn--primary" disabled={exiting || status.phase === 'loading'} title="暂停会在当前操作完成后生效" onClick={() => {
          if (status.phase === 'complete' || status.phase === 'error') void finish(true);
          else send(status.playing ? 'pause' : 'play');
        }}>{status.phase === 'complete' || status.phase === 'error' ? '重新播放' : status.playing ? '暂停演示' : '继续演示'}</button>
      </div>
    </section>
    <header className="tutorial-player-banner" data-tutorial-controls onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <span>教学模式 · 示例数据 · 退出后返回原工作区</span>
      <button className="btn btn--sm btn--secondary" disabled={exiting} onClick={() => void finish()}>{exiting ? '正在退出…' : '退出演示'}</button>
    </header>
  </div>, document.body);
}
