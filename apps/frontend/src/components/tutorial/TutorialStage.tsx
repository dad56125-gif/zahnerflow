import { useLayoutEffect, useRef, useState } from "react";
import type { NodeType } from "@zahnerflow/types";
import { NodeIconSvg } from "../NodeIconSvg";
import { NODE_CONFIGS } from "../../types/NodeConfiguration";
import type { TutorialFrame } from "./tutorialLessons";

const nodeTypes: Record<string, NodeType> = {
  ocp: "ocp_measurement",
  wait: "wait_delay",
  eis: "eis_potentiostatic",
  loop: "loop_start",
  end: "loop_end",
};

export function TutorialStage({
  frame,
  playing,
  frameKey,
}: {
  frame: TutorialFrame;
  playing: boolean;
  frameKey: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState({ x: 0, y: 0, width: 0, height: 0 });
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const update = () => {
      const element = root.querySelector<HTMLElement>(
        `[data-tutorial-target="${frame.target === "parameter-tab" ? "parameter" : frame.target}"]`,
      );
      if (!element) {
        setTarget({ x: 0, y: 0, width: 0, height: 0 });
        return;
      }
      const box = element.getBoundingClientRect();
      const origin = root.getBoundingClientRect();
      setTarget({
        x: box.left - origin.left,
        y: box.top - origin.top,
        width: box.width,
        height: box.height,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    root
      .querySelectorAll("[data-tutorial-target]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [frame]);

  const scene = frame.scene || "workflow";
  const nodes = frame.nodes || ["ocp", "wait", "eis"];
  const label =
    frame.status === "running"
      ? "■ 停止"
      : frame.status === "cancelling"
        ? "停止中…"
        : frame.status === "cancelled"
          ? "↻ 重置"
          : "▶ 运行";
  return (
    <div
      ref={stage}
      className={`tutorial-stage ${playing ? "is-playing" : "is-paused"}`}
      aria-label="教学动画，使用独立示例数据"
    >
      <div className="tutorial-stage__chrome">
        <span>ZahnerFlow</span>
        <span>教学演示 · 示例数据</span>
      </div>
      {scene === "workflow" && (
        <>
          <div className="tutorial-stage__workspace">
            <aside className="tutorial-stage__library">
              <small>节点</small>
              <div data-tutorial-target="library">
                <NodeIconSvg fallback={null} nodeType="ocp_measurement" />
                <span>开路电位测量</span>
              </div>
              <div>
                <NodeIconSvg fallback={null} nodeType="eis_potentiostatic" />
                <span>恒电位 EIS</span>
              </div>
              <div>
                <NodeIconSvg fallback={null} nodeType="wait_delay" />
                <span>等待</span>
              </div>
            </aside>
            <div className="tutorial-stage__canvas">
              <div className="tutorial-stage__tools">
                <span data-tutorial-target="records">▤ 实验记录</span>
                <span
                  data-tutorial-target="run"
                  className="tutorial-stage__run"
                >
                  {label}
                  {frame.action === "hold" && (
                    <svg
                      key={frameKey}
                      className="tutorial-stage__hold"
                      viewBox="0 0 40 40"
                    >
                      <circle cx="20" cy="20" r="17" pathLength="100" />
                    </svg>
                  )}
                </span>
              </div>
              <div className="tutorial-stage__nodes">
                {nodes.length === 0 ? (
                  <span className="tutorial-stage__empty">
                    从左侧添加第一个节点
                  </span>
                ) : (
                  nodes.map((node, index) => (
                    <div
                      key={node}
                      data-tutorial-target={node}
                      className={`tutorial-stage__node ${frame.selected === node ? "is-selected" : ""}`}
                    >
                      <span className="tutorial-stage__number">
                        {index + 1}
                      </span>
                      <NodeIconSvg fallback={null} nodeType={nodeTypes[node]} />
                      <span>{NODE_CONFIGS[nodeTypes[node]].name}</span>
                      {frame.action === "drag" && node === frame.selected && (
                        <small>按住拖动</small>
                      )}
                    </div>
                  ))
                )}
              </div>
              <span
                data-tutorial-target="preview"
                className="tutorial-stage__preview"
              >
                ⊕ 展开步骤
              </span>
            </div>
            <aside className="tutorial-stage__properties">
              <small>属性</small>
              {frame.selected ? (
                <>
                  <strong>
                    {NODE_CONFIGS[nodeTypes[frame.selected]].name}
                  </strong>
                  <div data-tutorial-target="parameter">
                    <span>
                      {frame.selected === "loop" ? "循环次数" : "测量时间 (s)"}
                    </span>
                    <output
                      key={frameKey}
                      className={frame.action === "type" ? "is-typing" : ""}
                    >
                      {frame.value || "60"}
                    </output>
                  </div>
                </>
              ) : (
                <span>选择节点后查看参数</span>
              )}
            </aside>
          </div>
          <div
            data-tutorial-target="progress"
            className="tutorial-stage__progress"
          >
            <span>
              {frame.status === "running" ? "正在执行 · 开路电位测量" : "就绪"}
            </span>
            <div>
              <i style={{ width: frame.status === "running" ? "38%" : "0%" }} />
            </div>
            <small>点击查看测量曲线</small>
          </div>
          {frame.status === "confirm" && (
            <div
              data-tutorial-target="confirm"
              className="tutorial-stage__confirm"
            >
              <strong>确定要删除等待节点吗？</strong>
              <span>取消 确认删除</span>
            </div>
          )}
        </>
      )}
      {scene === "setup" && (
        <div className="tutorial-stage__sheet">
          <div className="tutorial-stage__tools">
            <span data-tutorial-target="user">用户：演示用户 ＋</span>
            <span data-tutorial-target="station">ZAHNER ZENNIUM ▾</span>
          </div>
          <div data-tutorial-target="settings" className="tutorial-stage__form">
            <h4>用户配置 / 文件路径</h4>
            {[
              ["基础路径", "D:\\实验数据"],
              ["项目名称", "入门练习"],
              ["样品编号", "Sample-01"],
            ].map(([name, value]) => (
              <label key={name}>
                {name}
                <output>{value}</output>
              </label>
            ))}
            <small>✓ 自动保存 · 请检查预览路径</small>
          </div>
        </div>
      )}
      {scene === "preview" && (
        <div className="tutorial-stage__sheet">
          <h4>展开后的执行步骤</h4>
          <div className="tutorial-stage__split">
            <div data-tutorial-target="sequence">
              {[
                "启动程序 · 系统",
                "开路电位测量",
                "等待",
                "恒电位 EIS",
                "停止程序 · 系统",
              ].map((name, index) => (
                <p key={name}>
                  {index + 1} {name}
                </p>
              ))}
            </div>
            <div data-tutorial-target="detail">
              <h4>开路电位测量</h4>
              <p>测量时间 30 s</p>
              <p>采样间隔 1 s</p>
              <small>参数与执行顺序以展开预览为准</small>
            </div>
          </div>
        </div>
      )}
      {scene === "chart" && (
        <div className="tutorial-stage__sheet">
          <div
            data-tutorial-target="chart-tabs"
            className="tutorial-stage__tools"
          >
            <span>开路电位测量</span>
            <span>节点 1 / 第 1 轮</span>
          </div>
          <div data-tutorial-target="curve" className="tutorial-stage__chart">
            <span>电位 / V · 教学示意</span>
            <svg
              viewBox="0 0 600 200"
              role="img"
              aria-label="示意开路电位随时间趋于稳定的曲线"
            >
              <path className="tutorial-stage__axis" d="M40 15V175H580" />
              <path
                className="tutorial-stage__curve"
                d="M40 150 Q70 70 100 85 T160 70 T220 65 T280 61 T340 60 T400 59 T460 58 T520 58 L580 58"
              />
            </svg>
            <small>时间 / s</small>
          </div>
        </div>
      )}
      {scene === "records" && (
        <div className="tutorial-stage__sheet">
          <h4>实验记录</h4>
          <div className="tutorial-stage__split">
            <div>
              <p>入门练习</p>
              <p>└ 第一次执行 · 已完成</p>
              <span data-tutorial-target="load" className="tutorial-stage__run">
                加载到画布
              </span>
            </div>
            <div data-tutorial-target="report">
              <h4>执行报告</h4>
              <p>开路电位测量 已完成</p>
              <p>等待 已完成</p>
              <p>恒电位 EIS 已完成</p>
              <span>导出 HTML 导出 PDF</span>
            </div>
          </div>
        </div>
      )}
      {target.width > 0 && (
        <>
          <div
            className="tutorial-stage__spotlight"
            style={{
              left: target.x - 5,
              top: target.y - 5,
              width: target.width + 10,
              height: target.height + 10,
            }}
          />
          <div
            className="tutorial-stage__cursor"
            style={{
              left: target.x + target.width * 0.65,
              top: target.y + target.height * 0.6,
            }}
          >
            <svg viewBox="0 0 32 38" aria-hidden="true">
              <path d="M3 2L26 22L16 23L22 34L17 37L11 25L3 32Z" />
            </svg>
            {frame.action && frame.action !== "point" && (
              <i
                key={frameKey}
                className={`tutorial-stage__gesture tutorial-stage__gesture--${frame.action}`}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
