import { useEffect, useState } from "react";
import { getInstanceByDom } from "echarts/core";
import { appStorage } from "../../tutorialEnvironment";
import { useCanvasStore } from "../../state/canvasStore";
import { useExecutionStore } from "../../state/executionStateBridge";
import {
  tutorialLessons,
  anchor,
  type TutorialCheck,
  type TutorialStep,
} from "./tutorialLessons";
import type { TutorialRuntime } from "./tutorialRuntime";

function tutorialFacts() {
  const { nodes, selectedNodeId } = useCanvasStore.getState();
  const chart = document.querySelector<HTMLElement>(
    ".chart-modal__content [_echarts_instance_]",
  );
  const series = (chart ? getInstanceByDom(chart)?.getOption().series : []) as {
    data?: unknown[];
  }[];
  return {
    nodes: nodes.map((item) => ({ type: item.type, config: item.config })),
    selected: nodes.find((item) => item.id === selectedNodeId)?.type ?? null,
    phase: useExecutionStore.getState().snapshot?.status ?? "idle",
    user: appStorage.getItem("currentUser"),
    chartData: series?.map((item) => item.data ?? []) ?? [],
  };
}

function passes(check: TutorialCheck) {
  const facts = tutorialFacts();
  if (check.selectedId && useCanvasStore.getState().selectedNodeId !== check.selectedId) return false;
  if (check.nodeParameter) {
    const [id, key, value] = check.nodeParameter;
    if (useCanvasStore.getState().nodes.find(node => node.id === id)?.config?.[key] !== value) return false;
  }
  if (
    check.nodeTypes &&
    JSON.stringify(check.nodeTypes) !==
      JSON.stringify(facts.nodes.map((item) => item.type))
  )
    return false;
  if (check.parameter) {
    const [type, key, value] = check.parameter;
    if (facts.nodes.find((item) => item.type === type)?.config?.[key] !== value)
      return false;
  }
  if (check.phase && facts.phase !== check.phase) return false;
  if (check.selected && facts.selected !== check.selected) return false;
  if (check.user && facts.user !== check.user) return false;
  if (
    check.chartPoints &&
    !facts.chartData.some((points) => points.length >= check.chartPoints!)
  )
    return false;
  if (check.selector) {
    const targets = [
      ...document.querySelectorAll<HTMLElement>(check.selector),
    ].filter((element) => element.getClientRects().length > 0);
    if (check.absent) return targets.length === 0;
    if (
      targets.length === 0 ||
      (check.count !== undefined && targets.length !== check.count)
    )
      return false;
    if (
      check.text &&
      !targets.some((element) => element.textContent?.includes(check.text!))
    )
      return false;
  }
  return true;
}

export interface TutorialController {
  send: (command: string) => void;
  stop: () => Promise<void>;
}
export interface TutorialEvent {
  type: string;
  lessonId?: string;
  step?: number;
  phase?: string;
  playing?: boolean;
  error?: string;
  rect?: DOMRect | null;
  facts?: ReturnType<typeof tutorialFacts>;
  backward?: boolean;
}
export default function TutorialRunner({ lessonId, runtime: tutorialRuntime, controller, onEvent }: {
  lessonId: string;
  runtime: TutorialRuntime;
  controller: TutorialController;
  onEvent: (event: TutorialEvent) => void;
}) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const [cursor, setCursor] = useState({ x: -100, y: -100, pressed: false });
  useEffect(() => {
    const lesson = tutorialLessons.find(
      (item) => item.id === lessonId,
    );
    if (!lesson) return;
    let disposed = false;
    const abort = new AbortController();
    const report = (event: TutorialEvent, _origin?: string) => onEvent(event);
    let playing = false;
    let single = false;
    let current = 0;
    let highlighted: HTMLElement | null = null;
    let lastRect: DOMRect | null = null;
    let frame = 0;
    const clearTarget = () => {
      highlighted = null;
    };
    const trackTarget = () => {
      let rect: DOMRect | null = null;
      if (highlighted) {
        const visible = highlighted.isConnected &&
          highlighted.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
          !highlighted.closest('[data-state="closing"], .is-hiding, [aria-hidden="true"]');
        if (visible) {
          const bounds = highlighted.getBoundingClientRect();
          const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          if (bounds.width > 0 && bounds.height > 0 && hit && (highlighted.contains(hit) || hit.closest('[data-tutorial-controls]'))) rect = bounds;
        }
        if (!rect) clearTarget();
      }
      if (rect?.x !== lastRect?.x || rect?.y !== lastRect?.y ||
          rect?.width !== lastRect?.width || rect?.height !== lastRect?.height) {
        lastRect = rect;
        setBox(rect);
        report({ type: "tutorial-target", rect });
      }
      if (!disposed) frame = requestAnimationFrame(trackTarget);
    };
    const focusTarget = (target: HTMLElement) => {
      clearTarget();
      highlighted = target;
    };
    frame = requestAnimationFrame(trackTarget);
    const emit = (phase: string, error?: string) => {
      if (!disposed)
        report(
          {
            type: "tutorial-state",
            lessonId: lesson.id,
            step: current,
            phase,
            playing,
            error,
            facts: tutorialFacts(),
          },
          window.location.origin,
        );
    };
    const sleep = async (ms: number) => {
      await new Promise<void>((resolve) => {
        const done = () => { window.clearTimeout(timer); abort.signal.removeEventListener('abort', done); resolve(); };
        const timer = window.setTimeout(done, ms);
        abort.signal.addEventListener('abort', done, { once: true });
      });
      if (disposed) throw new Error("disposed");
    };
    const until = async <T,>(
      read: () => T | false | null,
      message: string,
      timeout = 30000,
    ): Promise<T> => {
      const start = performance.now();
      while (!disposed) {
        const value = read();
        if (value) return value;
        if (performance.now() - start > timeout) throw new Error(message);
        await sleep(50);
      }
      throw new Error("disposed");
    };
    const find = (selector: string) =>
      until(
        () => document.querySelector<HTMLElement>(selector),
        `未找到操作目标：${selector}`,
      );
    controller.send = (command: string) => {
      if (command === 'play' || command === 'next') {
        playing = true;
        single = command === 'next';
        tutorialRuntime.paused = false;
      }
      if (command === 'pause') playing = false;
    };
    const blockKeyboard = (event: KeyboardEvent) => {
      if (!event.isTrusted) return;
      const inControls = event.target instanceof Element && event.target.closest('[data-tutorial-controls]');
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-tutorial-controls] button:not(:disabled)')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        report({ type: 'tutorial-dismiss' });
      } else if (!inControls) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("keydown", blockKeyboard, true);
    const blockPointer = (event: Event) => {
      if (!event.isTrusted || (event.target instanceof Element && event.target.closest('[data-tutorial-controls]'))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const inputEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart'];
    inputEvents.forEach(name => document.addEventListener(name, blockPointer, { capture: true, passive: false }));
    const act = async (step: TutorialStep) => {
      const target = await find(step.target);
      clearTarget();
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      await sleep(150);
      focusTarget(target);
      await sleep(100);
      const rect = target.getBoundingClientRect();
      const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      setCursor({ ...point, pressed: false });
      await sleep(800);
      if (step.action) {
        await until(
          () => {
            const hit = document.elementFromPoint(point.x, point.y);
            return (
              !!hit &&
              target.contains(hit) &&
              !target.matches(':disabled, [aria-disabled="true"]')
            );
          },
          `目标被其他界面遮挡或禁用：${step.title}`,
          5000,
        );
      }
      if (step.action === "click") {
        setCursor({ ...point, pressed: true });
        const pointer = {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          clientX: point.x,
          clientY: point.y,
        };
        target.dispatchEvent(new PointerEvent("pointerdown", pointer));
        target.dispatchEvent(new MouseEvent("mousedown", pointer));
        target.focus();
        try { await sleep(100); }
        finally {
          target.dispatchEvent(new PointerEvent("pointerup", pointer));
          target.dispatchEvent(new MouseEvent("mouseup", pointer));
        }
        target.click();
      }
      if (step.action === "context") {
        setCursor({ ...point, pressed: true });
        target.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: point.x,
            clientY: point.y,
          }),
        );
      }
      if (step.action === "type") {
        if (!(target instanceof HTMLInputElement))
          throw new Error("教学输入目标必须是实际输入框");
        target.focus();
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!;
        set.call(target, "");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        for (const character of step.value ?? "") {
          set.call(target, target.value + character);
          target.dispatchEvent(new Event("input", { bubbles: true }));
          await sleep(70);
        }
        target.blur();
        await sleep(900);
        if (target.value !== step.value)
          throw new Error("输入值未通过实际组件校验");
      }
      if (step.action === "drag") {
        const destination = await find(step.destination!);
        destination.scrollIntoView({ block: "nearest" });
        const end = destination.getBoundingClientRect();
        const to = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
        const dataTransfer = new DataTransfer();
        target.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            dataTransfer,
            clientX: point.x,
            clientY: point.y,
          }),
        );
        // Browser-generated drag images are not available to synthetic drags. Clone the actual DOM, never re-render a replica node.
        const ghost = target.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("data-tutorial-node");
        ghost.removeAttribute("data-node-type");
        ghost.removeAttribute("data-tutorial-library");
        ghost.classList.add("tutorial-drag-image");
        Object.assign(ghost.style, {
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          opacity: "0.85",
        });
        ghost.style.setProperty("transform-origin", "0 0", "important");
        document.body.appendChild(ghost);
        try {
          setCursor({ ...to, pressed: true });
          const animation = ghost.animate(
            [
              { transform: "translate(0,0)" },
              {
                transform: `translate(${to.x - point.x}px,${to.y - point.y}px)`,
              },
            ],
            { duration: 1200, fill: "forwards", easing: "ease-in-out" },
          );
          await sleep(1200);
          animation.cancel();
          destination.dispatchEvent(
            new DragEvent("dragover", {
              bubbles: true,
              cancelable: true,
              dataTransfer,
              clientX: to.x,
              clientY: to.y,
            }),
          );
          destination.dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer,
              clientX: to.x,
              clientY: to.y,
            }),
          );
        } finally {
          // A drag has one terminal event; cancellation ends at its original position.
          target.dispatchEvent(new DragEvent('dragend', {
            bubbles: true, dataTransfer,
            clientX: disposed ? point.x : to.x,
            clientY: disposed ? point.y : to.y,
          }));
          ghost.remove();
          target.style.opacity = "";
        }
      }
      if (step.action === "hold") {
        setCursor({ ...point, pressed: true });
        const pointer = {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          clientX: point.x,
          clientY: point.y,
        };
        target.dispatchEvent(new PointerEvent("pointerdown", pointer));
        try {
          await sleep(1080);
        } finally {
          target.dispatchEvent(new PointerEvent("pointerup", pointer));
        }
      }
      await sleep(120);
      setCursor((value) => ({ ...value, pressed: false }));
      await until(
        () => passes(step.check),
        `操作结果未达到预期：${step.title}`,
      );
      // The animation-frame tracker follows closing, reflow and unmounting targets.
    };
    const run = async () => {
      await until(
        () => document.querySelector(anchor("station")),
        "应用未能启动",
      );
      await until(() => {
        const splash = document.getElementById('loadingScreen');
        return !splash || getComputedStyle(splash).display === 'none';
      }, '应用仍在加载');
      await sleep(400);
      emit("ready");
      for (current = 0; current < lesson.steps.length; current++) {
        while (!playing) {
          tutorialRuntime.paused = true;
          await sleep(80);
        }
        tutorialRuntime.paused = false;
        emit("acting");
        await act(lesson.steps[current]);
        if (single) playing = false;
        emit("verified");
        // Finish the atomic input before pausing; no half-held mouse or half-committed value.
        tutorialRuntime.paused = !playing;
        let remaining = 2300;
        let reportedPause = false;
        while (remaining > 0) {
          await sleep(50);
          if (playing) {
            remaining -= 50;
            reportedPause = false;
          } else if (!reportedPause) {
            emit("paused");
            reportedPause = true;
          }
        }
      }
      current = lesson.steps.length - 1;
      playing = false;
      tutorialRuntime.paused = true;
      clearTarget();
      setBox(null);
      emit("complete");
    };
    const finished = run().catch((error) => {
      if (!disposed) {
        playing = false;
        tutorialRuntime.paused = true;
        emit("error", error instanceof Error ? error.message : String(error));
      }
    });
    const dispose = () => {
      disposed = true;
      abort.abort();
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
      inputEvents.forEach(name => document.removeEventListener(name, blockPointer, true));
      document.removeEventListener("keydown", blockKeyboard, true);
      cancelAnimationFrame(frame);
      clearTarget();
      setBox(null);
    };
    controller.stop = async () => { dispose(); await finished; };
    return dispose;
  }, [lessonId, tutorialRuntime, controller, onEvent]);
  return (
    <div className="tutorial-annotation" aria-hidden="true">
      {box && (
        <div
          className="tutorial-spotlight"
          style={{
            left: box.x - 5,
            top: box.y - 5,
            width: box.width + 10,
            height: box.height + 10,
          }}
        />
      )}
      <div
        className={`tutorial-cursor ${cursor.pressed ? "is-pressed" : ""}`}
        style={{ left: cursor.x, top: cursor.y }}
      >
        <svg width="28" height="36" viewBox="0 0 28 36">
          <path
            d="M3 2v27l7-7 5 12 5-2-5-12 10-1Z"
            fill="white"
            stroke="#182633"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}
