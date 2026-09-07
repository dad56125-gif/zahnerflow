import { useEffect, useRef, useState } from 'react';
import type { WorkflowNode, WorkflowUnrollPreview } from '@zahnerflow/types';
import { runtimeClient } from '../runtimeClient';
import type { NodeParameters } from '../types/NodeConfiguration';
type PreviewState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; preview: WorkflowUnrollPreview }
    | { status: 'error'; message: string };

const EMPTY_PREVIEW: WorkflowUnrollPreview = {
    nodeCount: 0,
    steps: [],
    summary: {},
};


export function useUnrollPreview(isOpen: boolean, nodes: WorkflowNode[], autoStartupConfig?: NodeParameters) {
    const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });
    const [retryVersion, setRetryVersion] = useState(0);
    const requestIdRef = useRef(0);
    useEffect(() => {
        if (!isOpen) return;

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        if (nodes.length === 0) {
            setPreviewState({ status: 'success', preview: EMPTY_PREVIEW });
            return;
        }

        let active = true;
        setPreviewState({ status: 'loading' });

        runtimeClient.executions
            .unrollPreview({
                nodes,
                autoStartupConfig: autoStartupConfig || {},
            })
            .then((preview) => {
                if (active && requestIdRef.current === requestId) {
                    setPreviewState({ status: 'success', preview });
                }
            })
            .catch((error) => {
                if (active && requestIdRef.current === requestId) {
                    setPreviewState({ status: 'error', message: error instanceof Error ? error.message : '无法生成执行计划' });
                }
            });

        return () => {
            active = false;
        };
    }, [autoStartupConfig, isOpen, nodes, retryVersion]);

    return { previewState, retry: () => setRetryVersion(value => value + 1), preview: previewState.status === 'success' ? previewState.preview : EMPTY_PREVIEW };
}
