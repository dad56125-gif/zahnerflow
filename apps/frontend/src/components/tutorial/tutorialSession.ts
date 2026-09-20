import type { WorkflowNode, NodeType } from '@zahnerflow/types';
import { createWorkflowNode } from '../../utils/nodeUtilities';
import { tutorialLessons } from './tutorialLessons';
import scenario from './tutorialScenario.json';
import { appStorage, enterWorkspaceParticipants, enterTutorialStorage, setTutorialTransport, tutorialTransport, settleWorkspaceEdits } from '../../tutorialEnvironment';
import { runtimeSocket, settleRuntimeRequests, cancelTeachingRequests } from '../../runtimeClient';
import { useCanvasStore } from '../../state/canvasStore';
import { useExecutionStore } from '../../state/executionStateBridge';
import { useWorkflowStore } from '../../state/currentWorkflowStore';
import { useAppStore } from '../../state/appStore';
import { TutorialRuntime } from './tutorialRuntime';

export async function createTutorialSession(lessonId: string) {
  await settleWorkspaceEdits();
  await settleRuntimeRequests();
  if (tutorialTransport) throw new Error('教学正在进行');
  const lesson = tutorialLessons.find(item => item.id === lessonId);
  if (!lesson) throw new Error('未找到教程');
  const execution = useExecutionStore.getState();
  if (execution.command.pending || ['running', 'paused', 'cancelling'].includes(execution.snapshot?.status ?? 'idle')) {
    throw new Error('请先结束当前执行，再开始教学');
  }
  const canvas = useCanvasStore.getState();
  const workflow = useWorkflowStore.getState();
  const app = useAppStore.getState();
  const scrollPositions = [...document.querySelectorAll<HTMLElement>('.app-root, .app-root *')]
    .filter(element => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
    .map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
  const restoreStorage = enterTutorialStorage();
  if (lessonId !== 'prepare') appStorage.setItem('currentUser', '教学用户');
  const runtime = new TutorialRuntime(lessonId);
  setTutorialTransport(runtime);
  const restoreParticipants = enterWorkspaceParticipants(lessonId);
  const create = (type: NodeType, id: string): WorkflowNode => ({ ...createWorkflowNode(type), id });
  const ocp = structuredClone(scenario.final.nodes[0]) as WorkflowNode;
  const nodes = lesson.initialNodes ? structuredClone(lesson.initialNodes) : lesson.seed === 'empty' ? [] : lesson.seed === 'ocp' ? [ocp] : lesson.seed === 'sequence'
    ? [ocp, create('wait_delay', 'tutorial-wait'), create('eis_potentiostatic', 'tutorial-eis')]
    : [{ ...create('loop_start', 'tutorial-loop'), config: { loopCount: 3 } }, ocp, create('loop_end', 'tutorial-end')];
  useCanvasStore.setState({ nodes, selectedNodeId: null, validationError: null });
  useWorkflowStore.getState().setDraftWorkflowName(null);
  useAppStore.setState({ notifications: [], notificationPanelOpen: false, leftPanelOpen: true });
  await settleRuntimeRequests();
  let ended = false;
  return {
    runtime,
    async close() {
      if (ended) return;
      ended = true;
      runtime.disconnect();
      cancelTeachingRequests();
      await settleRuntimeRequests();
      restoreParticipants();
      useExecutionStore.setState(execution);
      useCanvasStore.setState(canvas);
      useWorkflowStore.setState(workflow);
      useAppStore.setState(app);
      document.documentElement.setAttribute('data-theme', app.theme);
      // Restoration above still writes only the memory storage.
      restoreStorage();
      setTutorialTransport(null);
      runtimeSocket.restoreLiveEvents(execution.snapshot?.runtimeId ?? null);
      await new Promise<void>(resolve => requestAnimationFrame(() => {
        scrollPositions.forEach(({ element, top, left }) => {
          if (element.isConnected) element.scrollTo({ top, left, behavior: 'instant' });
        });
        resolve();
      }));
    },
  };
}
export type TutorialSession = Awaited<ReturnType<typeof createTutorialSession>>;
