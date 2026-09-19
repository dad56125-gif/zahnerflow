import { useEffect, useState } from "react";
import { ModalLayer } from "../shared/OverlayLayer";
import { TutorialStage } from "./TutorialStage";
import { tutorialLessons } from "./tutorialLessons";

export default function TutorialModal({
  onClose,
  onPlay,
}: {
  onClose: () => void;
  onPlay: (lessonId: string) => void;
}) {
  const [lessonId, setLessonId] = useState("prepare");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [replay, setReplay] = useState(0);
  const lesson = tutorialLessons.find((item) => item.id === lessonId)!;
  const frame = lesson.frames[step];
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (step < lesson.frames.length - 1) setStep(step + 1);
      else {
        setPlaying(false);
        setFinished(true);
      }
    }, frame.duration || 3600);
    return () => window.clearTimeout(timer);
  }, [playing, step, lesson, frame, replay]);
  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);
  const choose = (id: string) => {
    setLessonId(id);
    setStep(0);
    setPlaying(false);
    setFinished(false);
    setReplay((value) => value + 1);
  };
  const move = (index: number) => {
    setStep(index);
    setPlaying(false);
    setFinished(false);
  };
  const start = () => {
    if (finished) {
      setStep(0);
      setFinished(false);
    }
    setPlaying(true);
  };
  return (
    <ModalLayer id="tutorial-overlay" onClose={onClose} closeOnBackdrop={false}>
      <section
        className="tutorial-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
      >
        <header className="tutorial-dialog__header">
          <div>
            <h2 id="tutorial-title">新手教程</h2>
            <p>一次学会一个操作</p>
          </div>
          <button
            className="btn btn--md btn--secondary btn--icon btn--round"
            onClick={onClose}
            aria-label="关闭教程"
          >
            ×
          </button>
        </header>
        <div className="tutorial-dialog__body">
          <nav className="tutorial-dialog__nav" aria-label="教程目录">
            {Array.from(new Set(tutorialLessons.map((item) => item.group))).map(
              (group) => (
                <div key={group}>
                  <h3>{group}</h3>
                  {tutorialLessons
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <button
                        key={item.id}
                        className={`tutorial-dialog__lesson ${item.id === lessonId ? "is-active" : ""}`}
                        aria-current={item.id === lessonId ? "step" : undefined}
                        onClick={() => choose(item.id)}
                      >
                        <span>{item.title}</span>
                        <small>{item.frames.length} 步</small>
                      </button>
                    ))}
                </div>
              ),
            )}
          </nav>
          <main className="tutorial-dialog__main">
            <div className="tutorial-dialog__intro">
              <span className="tutorial-dialog__eyebrow">{lesson.group}</span>
              <h3>{lesson.title}</h3>
              <p>{lesson.summary}</p>
            </div>
            <TutorialStage
              frame={frame}
              playing={playing}
              frameKey={`${lesson.id}-${step}-${replay}`}
            />
            <div className="tutorial-dialog__explanation" aria-live="polite">
              <span className="tutorial-dialog__step-number">
                {String(step + 1).padStart(2, "0")}
              </span>
              <div>
                <h4>{frame.title}</h4>
                <p>{frame.text}</p>
              </div>
            </div>
            <div className="tutorial-dialog__steps" aria-label="演示步骤">
              {lesson.frames.map((item, index) => (
                <button
                  key={item.title}
                  onClick={() => move(index)}
                  aria-label={`第 ${index + 1} 步：${item.title}`}
                  aria-current={index === step ? "step" : undefined}
                  className={index === step ? "is-active" : ""}
                />
              ))}
            </div>
          </main>
        </div>
        <footer className="tutorial-dialog__footer">
          <span>右侧为片段预览；启动后在实际界面演示</span>
          <button
            className="btn btn--md btn--secondary"
            disabled={step === 0}
            onClick={() => move(step - 1)}
          >
            上一步
          </button>
          <button
            className="btn btn--md btn--secondary"
            disabled={step === lesson.frames.length - 1}
            onClick={() => move(step + 1)}
          >
            下一步
          </button>
          <button
            className="btn btn--md btn--secondary"
            onClick={() => (playing ? setPlaying(false) : start())}
          >
            {playing ? "暂停预览" : "播放片段"}
          </button>
          <button
            className="btn btn--md btn--primary"
            onClick={() => onPlay(lessonId)}
          >
            ▶ 开始界面演示
          </button>
        </footer>
      </section>
    </ModalLayer>
  );
}
