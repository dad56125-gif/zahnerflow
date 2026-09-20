import { useState } from "react";
import { SplitPaneModal, SplitPaneModalItem } from "../shared/SplitPaneModal";
import { tutorialLessons } from "./tutorialLessons";

export default function TutorialModal({
  onClose,
  onPlay,
  preparing = false,
}: {
  onClose: () => void;
  onPlay: (lessonId: string) => void;
  preparing?: boolean;
}) {
  const [lessonId, setLessonId] = useState("prepare");
  const lesson = tutorialLessons.find((item) => item.id === lessonId)!;
  return (
    <SplitPaneModal
      id="tutorial-overlay"
      className="tutorial-dialog"
      title="新手教程"
      closeLabel="关闭教程"
      onClose={onClose}
      sidebarLabel="教程目录"
      actions={
        <button className="btn btn--sm btn--primary is-prominent" disabled={preparing} onClick={() => onPlay(lessonId)}>
          {preparing ? '正在准备…' : '▶ 开始界面演示'}
        </button>
      }
      sidebar={
        <nav className="tutorial-dialog__nav">
          {[...new Set(tutorialLessons.map((item) => item.group))].map((group) => (
            <section className="tutorial-dialog__group" key={group}>
              <h3>{group}</h3>
              {tutorialLessons.filter((item) => item.group === group).map((item) => (
                <SplitPaneModalItem
                  key={item.id}
                  selected={item.id === lessonId}
                  aria-current={item.id === lessonId ? "step" : undefined}
                  onClick={() => setLessonId(item.id)}
                >
                  <span>{item.title}</span>
                  <small>{item.steps.length} 步</small>
                </SplitPaneModalItem>
              ))}
            </section>
          ))}
        </nav>
      }
    >
      <div className="tutorial-dialog__overview">
        <h3>{lesson.title}</h3>
        <p>{lesson.summary}</p>
      </div>
      <video key={lessonId} className="tutorial-preview-video" controls muted playsInline preload="metadata" src={`./tutorial/${lessonId}.webm`} aria-label={`${lesson.title}片段预览`} />
    </SplitPaneModal>
  );
}
