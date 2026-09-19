import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ModalLayer } from "../shared/OverlayLayer";
import { TutorialStage } from "./TutorialStage";
import { tutorialLessons } from "./tutorialLessons";

export interface TutorialSession {
  lessonId: string;
  step: number;
  playing: boolean;
  replay: number;
}
const anchors: Record<string, string> = {
  library: '[data-tutorial-library="ocp_measurement"]',
  ocp: '[data-tutorial-node="tutorial-ocp"]',
  eis: '[data-tutorial-node="tutorial-eis"]',
  wait: '[data-tutorial-node="tutorial-wait"]',
  loop: '[data-tutorial-node="tutorial-loop"]',
  end: '[data-tutorial-node="tutorial-end"]',
};

export default function TutorialGuide({
  session,
  onChange,
  onClose,
}: {
  session: TutorialSession;
  onChange: (session: TutorialSession) => void;
  onClose: () => void;
}) {
  const lesson = tutorialLessons.find((item) => item.id === session.lessonId)!;
  const frame = lesson.frames[session.step];
  const controls = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [finished, setFinished] = useState(false);
  const animations = useRef<Animation[]>([]);
  const cursor = useRef<HTMLDivElement>(null);
  const lastPoint = useRef({ x: 0, y: 0 });
  const auxiliary =
    frame.scene &&
    frame.scene !== "workflow" &&
    !(frame.scene === "setup" && frame.target !== "settings");
  const selector = auxiliary
    ? `.tutorial-guide__panel [data-tutorial-target="${frame.target}"]`
    : frame.target === "parameter"
      ? `[data-tutorial-parameter="${frame.selected === "loop" ? "loopCount" : "measurementDuration"}"]`
      : frame.target === "confirm"
        ? "[data-tutorial-confirm]"
        : anchors[frame.target] || `[data-tutorial-anchor="${frame.target}"]`;

  useLayoutEffect(() => {
    let scrollSaved: { element: Element; top: number; left: number }[] = [];
    let scrolled = false;
    const update = () => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target || !target.getClientRects().length) {
        setBox(null);
        setMissing(true);
        return;
      }
      if (!scrolled) {
        for (
          let parent = target.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          if (
            parent.scrollHeight > parent.clientHeight ||
            parent.scrollWidth > parent.clientWidth
          )
            scrollSaved.push({
              element: parent,
              top: parent.scrollTop,
              left: parent.scrollLeft,
            });
        }
        target.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
        scrolled = true;
      }
      setMissing(false);
      const measured = target.getBoundingClientRect();
      const translate =
        frame.action === "drag"
          ? getComputedStyle(target)
              .translate.split(" ")
              .map((value) => parseFloat(value) || 0)
          : [0, 0];
      const next = new DOMRect(
        measured.x - translate[0],
        measured.y - (translate[1] || 0),
        measured.width,
        measured.height,
      );
      setBox((previous) =>
        previous &&
        ["x", "y", "width", "height"].every(
          (key) => Math.abs(previous[key] - next[key]) < 0.5,
        )
          ? previous
          : next,
      );
    };
    const timer = window.setInterval(update, 120);
    update();
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      scrollSaved.forEach(({ element, top, left }) => {
        element.scrollTop = top;
        element.scrollLeft = left;
      });
      scrollSaved = [];
    };
  }, [selector, session.step, session.replay, frame.action]);

  useEffect(() => {
    if (!session.playing || !box || missing) return;
    const timer = window.setTimeout(() => {
      if (session.step < lesson.frames.length - 1)
        onChange({ ...session, step: session.step + 1 });
      else {
        setFinished(true);
        onChange({ ...session, playing: false });
      }
    }, frame.duration || 4200);
    return () => window.clearTimeout(timer);
  }, [session, lesson.frames.length, frame.duration, box, missing, onChange]);

  useEffect(() => {
    // 只放行教程控制条，避免输入、快捷键和原生拖拽穿透到设备操作。
    const block = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".window-controls-bar")
      )
        return;
      if (
        event.target instanceof Node &&
        controls.current?.contains(event.target)
      )
        return;
      if (event instanceof KeyboardEvent && event.key === "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const events = [
      "pointerdown",
      "pointerup",
      "click",
      "dblclick",
      "contextmenu",
      "dragstart",
      "dragover",
      "drop",
      "wheel",
      "keydown",
    ];
    events.forEach((name) =>
      document.addEventListener(name, block, { capture: true, passive: false }),
    );
    return () =>
      events.forEach((name) => document.removeEventListener(name, block, true));
  }, []);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden && session.playing)
        onChange({ ...session, playing: false });
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [session, onChange]);

  useLayoutEffect(() => {
    if (!box || !cursor.current) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const point = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };
    const draggedNode =
      frame.action === "drag"
        ? document.querySelector<HTMLElement>(
            '[data-tutorial-node="tutorial-eis"]',
          )
        : null;
    const source = draggedNode?.getBoundingClientRect();
    const previous = source
      ? { x: source.x + source.width * 0.6, y: source.y + source.height * 0.6 }
      : lastPoint.current.x
        ? lastPoint.current
        : point;
    lastPoint.current = point;
    const motion = cursor.current.animate(
      [
        { transform: `translate(${previous.x}px, ${previous.y}px)` },
        { transform: `translate(${point.x}px, ${point.y}px)` },
      ],
      {
        delay: source ? 850 : 0,
        duration: reduced ? 0 : source ? 1200 : 850,
        fill: "both",
        easing: "ease-in-out",
      },
    );
    animations.current = [motion];
    if (frame.action === "drag") {
      const node = draggedNode;
      if (node) {
        const start = node.getBoundingClientRect();
        animations.current.push(
          node.animate(
            [
              { translate: "0 0" },
              { translate: `${box.x - start.x}px ${box.y - start.y}px` },
            ],
            {
              delay: 850,
              duration: reduced ? 0 : 1200,
              fill: "forwards",
              easing: "ease-in-out",
            },
          ),
        );
        node.style.zIndex = "2";
        const destination = document.querySelector<HTMLElement>(selector);
        if (destination)
          animations.current.push(
            destination.animate(
              [
                { translate: "0 0" },
                { translate: `${start.x - box.x}px ${start.y - box.y}px` },
              ],
              {
                delay: 850,
                duration: reduced ? 0 : 1200,
                fill: "forwards",
                easing: "ease-in-out",
              },
            ),
          );
      }
    }
    if (!session.playing)
      animations.current.forEach((animation) => animation.pause());
    return () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      if (draggedNode) draggedNode.style.removeProperty("z-index");
    };
    // 每个目标或步骤只建立一次动画；暂停/继续由下面的 effect 控制。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, session.step, session.replay]);
  useEffect(() => {
    animations.current.forEach((animation) =>
      session.playing ? animation.play() : animation.pause(),
    );
  }, [session.playing]);

  const changeStep = (step: number) => {
    setFinished(false);
    onChange({ ...session, step, playing: false });
  };
  return (
    <ModalLayer
      id="tutorial-guide-overlay"
      className={`tutorial-guide ${session.playing ? "is-playing" : "is-paused"}`}
      onClose={onClose}
      closeOnBackdrop={false}
      exitDurationMs={0}
    >
      {auxiliary && (
        <div className="tutorial-guide__panel">
          <TutorialStage
            frame={frame}
            playing={session.playing}
            frameKey={`${session.step}-${session.replay}`}
          />
        </div>
      )}
      {frame.status === "confirm" && (
        <div className="tutorial-guide__confirm" data-tutorial-confirm>
          <h3>确定要删除节点“等待”吗？</h3>
          <p>取消将保留节点，确认后删除。</p>
          <span>取消 确认删除</span>
        </div>
      )}
      {box && (
        <div
          className="tutorial-guide__spotlight"
          style={{
            left: box.x - 6,
            top: box.y - 6,
            width: box.width + 12,
            height: box.height + 12,
          }}
        />
      )}
      {!box && <div className="tutorial-guide__shade" />}
      <div
        ref={cursor}
        className="tutorial-guide__cursor"
        style={{
          visibility: box ? "visible" : "hidden",
          transform: box
            ? `translate(${box.x + box.width * 0.6}px, ${box.y + box.height * 0.6}px)`
            : undefined,
        }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 38">
          <path d="M3 2L26 22L16 23L22 34L17 37L11 25L3 32Z" />
        </svg>
        {frame.action && (
          <i
            key={`${session.step}-${session.replay}`}
            className="tutorial-stage__gesture"
          />
        )}
        {frame.action === "hold" && (
          <svg
            key={`hold-${session.replay}`}
            className="tutorial-guide__hold"
            viewBox="0 0 40 40"
          >
            <circle cx="20" cy="20" r="17" pathLength="100" />
          </svg>
        )}
      </div>
      <div
        ref={controls}
        className="tutorial-guide__controls"
        role="dialog"
        aria-modal="true"
        aria-label="界面教学控制"
        style={
          box && box.y > window.innerHeight * 0.65
            ? { top: "calc(var(--app-chrome-h, 0px) + 90px)", bottom: "auto" }
            : undefined
        }
      >
        <div aria-live="polite">
          <small>
            {lesson.title} · {session.step + 1} / {lesson.frames.length} ·
            教学模式
          </small>
          <h3>{finished ? "演示完成" : frame.title}</h3>
          <p>
            {missing
              ? "正在定位目标。你可以切换步骤、重播或退出教程。"
              : finished
                ? "已完成这个操作的演示。退出后回到你的原始工作流。"
                : frame.text}
          </p>
        </div>
        <div className="tutorial-guide__buttons">
          <button
            className="btn btn--md btn--secondary"
            disabled={session.step === 0}
            onClick={() => changeStep(session.step - 1)}
          >
            上一步
          </button>
          <button
            className="btn btn--md btn--secondary"
            disabled={session.step === lesson.frames.length - 1}
            onClick={() => changeStep(session.step + 1)}
          >
            下一步
          </button>
          <button
            className="btn btn--md btn--secondary"
            onClick={() => {
              setFinished(false);
              onChange({
                ...session,
                step: 0,
                playing: true,
                replay: session.replay + 1,
              });
            }}
          >
            重播
          </button>
          <button
            className="btn btn--md btn--primary"
            disabled={finished}
            onClick={() => onChange({ ...session, playing: !session.playing })}
          >
            {session.playing ? "暂停" : "继续"}
          </button>
          <button className="btn btn--md btn--secondary" onClick={onClose}>
            退出教程
          </button>
        </div>
      </div>
    </ModalLayer>
  );
}
