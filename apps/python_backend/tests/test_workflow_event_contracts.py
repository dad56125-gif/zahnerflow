from __future__ import annotations

import runtime  # noqa: F401 - bootstraps the sibling apps/shared package path

from shared.contracts.workflow import (
    EnrichedEisData,
    EnrichedStreamData,
    NodeStatusUpdate,
    NodesResetEvent,
)


ITERATION_PATH = [
    {
        "loopNodeId": "loop-1",
        "loopStartIndex": 2,
        "iteration": 3,
        "totalIterations": 5,
    }
]


def test_compact_node_status_and_optional_reset_message_match_runtime_payloads():
    assert NodeStatusUpdate.model_validate({"i": 4, "s": "running", "d": {"ok": True}}).i == 4
    assert NodesResetEvent.model_validate(
        {"targetStatus": "ready", "timestamp": "2026-07-10T00:00:00Z"}
    ).message is None


def test_measurement_and_eis_payloads_share_the_structured_iteration_path():
    stream = EnrichedStreamData.model_validate(
        {
            "executionId": "exec",
            "stepIndex": 4,
            "nodeId": "measure",
            "iterationPath": ITERATION_PATH,
            "data": {"t": 1.0, "v": 0.5, "i": 0.01},
        }
    )
    eis = EnrichedEisData.model_validate(
        {
            "executionId": "exec",
            "nodeIndex": 4,
            "nodeId": "measure",
            "iterationPath": ITERATION_PATH,
            "data": {
                "frequency": [1000.0],
                "z_real": [2.0],
                "z_imag": [-1.0],
                "point_count": 1,
                "csv_path": "/tmp/eis.csv",
            },
        }
    )

    assert stream.iterationPath == eis.iterationPath
    assert eis.data.point_count == 1
