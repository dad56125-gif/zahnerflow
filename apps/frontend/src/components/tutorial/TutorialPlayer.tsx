import { ModalLayer } from "../shared/OverlayLayer";
import { TutorialFrame } from "./TutorialFrame";

export default function TutorialPlayer({
  lessonId,
  onClose,
}: {
  lessonId: string;
  onClose: () => void;
}) {
  return (
    <ModalLayer
      id="tutorial-player-overlay"
      onClose={onClose}
      closeOnBackdrop={false}
      contentClassName="overlay-layer__content--fill"
      style={{ top: "var(--app-chrome-h)" }}
      zIndex={15000}
    >
      <TutorialFrame lessonId={lessonId} onExit={onClose} />
      <header className="tutorial-player-banner">
        <span>教学模式 · 示例数据 · 退出后返回原工作区</span>
        <button className="btn btn--sm btn--secondary" onClick={onClose}>
          退出演示
        </button>
      </header>
    </ModalLayer>
  );
}
