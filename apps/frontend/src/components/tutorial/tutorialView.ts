import type { WorkflowNode, NodeType } from "@zahnerflow/types";
import { NODE_CONFIGS } from "../../types/NodeConfiguration";
import type { TutorialFrame } from "./tutorialLessons";

export interface TutorialCanvasView {
  nodes: WorkflowNode[];
  selectedNodeId: string | null;
  status?: string;
}
const types: Record<string, NodeType> = {
  ocp: "ocp_measurement",
  wait: "wait_delay",
  eis: "eis_potentiostatic",
  loop: "loop_start",
  end: "loop_end",
};
export function tutorialCanvasView(frame: TutorialFrame): TutorialCanvasView {
  return {
    nodes: (frame.nodes || ["ocp", "wait", "eis"]).map((id) => ({
      id: `tutorial-${id}`,
      type: types[id],
      config: {
        ...NODE_CONFIGS[types[id]].defaultParameters,
        ...(id === "ocp"
          ? { measurementDuration: Number(frame.value || 30) }
          : {}),
        ...(id === "loop" ? { loopCount: Number(frame.value || 3) } : {}),
      },
    })),
    selectedNodeId: frame.selected ? `tutorial-${frame.selected}` : null,
    status: frame.status,
  };
}
