import { useEffect, useRef, useState } from "react";
import { tutorialLessons } from "./tutorialLessons";

interface FrameStatus {
  lessonId: string;
  step: number;
  phase: string;
  playing: boolean;
  error?: string;
}
export function TutorialFrame({
  lessonId,
  preview = false,
  onExit,
}: {
  lessonId: string;
  preview?: boolean;
  onExit?: () => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const instructions = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [scale, setScale] = useState(0.5);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<FrameStatus>({
    lessonId,
    step: 0,
    phase: "loading",
    playing: !preview,
  });
  const lesson = tutorialLessons.find((item) => item.id === lessonId)!;
  const step = lesson.steps[status.lessonId === lessonId ? status.step : 0];
  const send = (command: string) =>
    iframe.current?.contentWindow?.postMessage(
      { type: "tutorial-command", command },
      window.location.origin,
    );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframe.current?.contentWindow ||
        ![
          "tutorial-state",
          "tutorial-target",
          "tutorial-dismiss",
          "tutorial-focus",
        ].includes(event.data?.type)
      )
        return;
      if (event.data.type === "tutorial-dismiss") {
        onExit?.();
        return;
      }
      if (event.data.type === "tutorial-focus") {
        const buttons = [
          ...(instructions.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? []),
        ];
        (event.data.backward ? buttons.at(-1) : buttons[0])?.focus();
        return;
      }
      if (event.data.type === "tutorial-target") {
        const target = event.data.rect;
        if (preview || !target || !instructions.current) return;
        const { width, height } = instructions.current.getBoundingClientRect();
        const candidates = [
          { left: 24, top: window.innerHeight - 90 - height },
          {
            left: window.innerWidth - 24 - width,
            top: window.innerHeight - 90 - height,
          },
          { left: (window.innerWidth - width) / 2, top: 80 },
        ];
        const overlap = (candidate: { left: number; top: number }) =>
          Math.max(
            0,
            Math.min(candidate.left + width, target.right + 12) -
              Math.max(candidate.left, target.left - 12),
          ) *
          Math.max(
            0,
            Math.min(candidate.top + height, target.bottom + 12) -
              Math.max(candidate.top, target.top - 12),
          );
        setPosition(
          candidates.reduce((best, candidate) =>
            overlap(candidate) < overlap(best) ? candidate : best,
          ),
        );
        return;
      }
      setStatus(event.data);
      if (event.data.phase === "ready" && !preview) send("play");
    };
    window.addEventListener("message", receive);
    const observer = new ResizeObserver(() => {
      if (wrapper.current) setScale(wrapper.current.clientWidth / 1440);
    });
    if (wrapper.current) observer.observe(wrapper.current);
    return () => {
      window.removeEventListener("message", receive);
      observer.disconnect();
    };
  }, [preview, onExit]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        send("pause");
        setStatus((value) => ({ ...value, playing: false }));
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const replay = () => {
    setStatus({ lessonId, step: 0, phase: "loading", playing: !preview });
    setRevision((value) => value + 1);
  };
  const toggle = () => {
    if (status.phase === "complete" || status.phase === "error") {
      replay();
      return;
    }
    send(status.playing ? "pause" : "play");
    setStatus((value) => ({ ...value, playing: !value.playing }));
  };
  return (
    <div
      className={preview ? "tutorial-preview" : "tutorial-player"}
      data-tutorial-phase={status.phase}
      data-tutorial-step={status.step}
    >
      <div ref={wrapper} className="tutorial-frame-viewport">
        <iframe
          key={`${lessonId}-${revision}`}
          ref={iframe}
          title={`${lesson.title} · 实际应用教学`}
          tabIndex={-1}
          src={`${window.location.pathname}?tutorial=${encodeURIComponent(lessonId)}&preview=${preview ? 1 : 0}`}
          style={
            preview
              ? { width: 1440, height: 1000, transform: `scale(${scale})` }
              : undefined
          }
        />
        <div className="tutorial-input-shield" />
      </div>
      <section
        ref={instructions}
        style={
          !preview && position ? { ...position, bottom: "auto" } : undefined
        }
        className="tutorial-instructions"
        aria-label="教学控制"
        aria-live="polite"
      >
        <div className="tutorial-instructions__copy">
          <span className="tutorial-eyebrow">
            {status.phase === "complete"
              ? "演示完成"
              : `${status.step + 1} / ${lesson.steps.length}`}{" "}
            · {lesson.title}
          </span>
          <h3>{step.title}</h3>
          <p>{status.error ?? step.text}</p>
          {status.phase === "loading" && <small>正在准备教学工作区…</small>}
          {status.phase === "error" && (
            <small role="alert">演示已停下，请重播或退出。</small>
          )}
        </div>
        <div className="tutorial-instructions__controls">
          <button className="btn btn--sm btn--secondary" onClick={replay}>
            从头重播
          </button>
          <button
            className="btn btn--sm btn--secondary"
            disabled={["loading", "complete", "error", "acting"].includes(
              status.phase,
            )}
            onClick={() => {
              send("next");
              setStatus((value) => ({ ...value, playing: true }));
            }}
          >
            下一步
          </button>
          <button
            className="btn btn--sm btn--primary"
            disabled={status.phase === "loading"}
            title="暂停会在当前操作完成后生效"
            onClick={toggle}
          >
            {status.phase === "complete" || status.phase === "error"
              ? "重新播放"
              : status.playing
                ? "暂停演示"
                : preview
                  ? "播放片段"
                  : "继续演示"}
          </button>
        </div>
      </section>
    </div>
  );
}
