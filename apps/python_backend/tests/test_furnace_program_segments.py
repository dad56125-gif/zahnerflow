from __future__ import annotations

import pytest

from device_data_service import FurnaceDataService
from devices.furnace.limits import (
    FURNACE_HARDWARE_SEGMENT_COUNT,
    FURNACE_PROGRAM_SEGMENT_COUNT,
    FURNACE_TRANSIENT_SEGMENT_IDS,
    validate_furnace_program_segments,
)


def test_furnace_hardware_and_public_program_segment_boundaries_are_distinct():
    assert FURNACE_HARDWARE_SEGMENT_COUNT == 30
    assert FURNACE_PROGRAM_SEGMENT_COUNT == 27
    assert FURNACE_TRANSIENT_SEGMENT_IDS == (28, 29, 30)


def test_program_segment_validation_normalizes_and_rejects_duplicates():
    assert validate_furnace_program_segments(
        [{"id": "1", "temperature": "800", "time": "30"}]
    ) == [{"id": 1, "temperature": 800.0, "time": 30}]

    with pytest.raises(ValueError, match="unique"):
        validate_furnace_program_segments(
            [
                {"id": 1, "temperature": 800, "time": 30},
                {"id": 1, "temperature": 900, "time": 30},
            ]
        )


def test_partial_preset_matches_only_the_segments_it_addresses():
    service = FurnaceDataService()
    actual = [
        {"id": segment_id, "temperature": 25.0, "time": 0}
        for segment_id in range(1, FURNACE_PROGRAM_SEGMENT_COUNT + 1)
    ]
    actual[4] = {"id": 5, "temperature": 800.0, "time": 30}

    assert service.segments_match(
        actual,
        [{"id": 5, "temperature": 800.0, "time": 30}],
    )
    assert not service.segments_match(
        actual,
        [{"id": 5, "temperature": 801.0, "time": 30}],
    )
