"""Furnace domain limits shared by every public program write path.

The AI-518P exposes 30 hardware segments. Segments 1-27 belong to user
programs and presets; segments 28-30 are reserved scratch segments used by the
``change_temperature`` workflow node for direct point-to-point temperature
changes. Public program APIs must never overwrite those scratch segments.
"""

from __future__ import annotations

from typing import Any


FURNACE_MIN_TEMPERATURE_C = 25
FURNACE_MAX_TEMPERATURE_C = 1100
FURNACE_HARDWARE_SEGMENT_COUNT = 30
FURNACE_PROGRAM_SEGMENT_COUNT = 27
FURNACE_TRANSIENT_SEGMENT_IDS = (28, 29, 30)
FURNACE_STOP_TIME = -121
FURNACE_MAX_SEGMENT_TIME = 9999


def validate_furnace_temperature(value: float, context: str = "temperature") -> float:
    try:
        temperature = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Furnace {context} must be a number") from exc
    if temperature < FURNACE_MIN_TEMPERATURE_C or temperature > FURNACE_MAX_TEMPERATURE_C:
        raise ValueError(
            f"Furnace {context} must be between "
            f"{FURNACE_MIN_TEMPERATURE_C} and {FURNACE_MAX_TEMPERATURE_C} C"
        )
    return temperature


def validate_furnace_program_segment(segment: dict[str, Any]) -> dict[str, int | float]:
    """Validate and normalize one user-editable segment (1-27)."""

    if not isinstance(segment, dict):
        raise ValueError("Furnace program segment must be an object")
    try:
        segment_id = int(segment.get("id"))
    except (TypeError, ValueError) as exc:
        raise ValueError("Furnace segment id must be an integer") from exc
    if segment_id < 1 or segment_id > FURNACE_PROGRAM_SEGMENT_COUNT:
        raise ValueError(
            f"Furnace program segment id must be between 1 and {FURNACE_PROGRAM_SEGMENT_COUNT}; "
            f"segments {FURNACE_TRANSIENT_SEGMENT_IDS[0]}-{FURNACE_TRANSIENT_SEGMENT_IDS[-1]} are reserved"
        )

    temperature = validate_furnace_temperature(
        segment.get("temperature"),
        "program segment temperature",
    )
    try:
        raw_time = float(segment.get("time"))
    except (TypeError, ValueError) as exc:
        raise ValueError("Furnace segment time must be an integer") from exc
    if not raw_time.is_integer():
        raise ValueError("Furnace segment time must be an integer")
    segment_time = int(raw_time)
    if segment_time not in (FURNACE_STOP_TIME, 0) and not 1 <= segment_time <= FURNACE_MAX_SEGMENT_TIME:
        raise ValueError(
            f"Furnace segment time must be {FURNACE_STOP_TIME}, 0, or between 1 and "
            f"{FURNACE_MAX_SEGMENT_TIME}"
        )

    return {
        "id": segment_id,
        "temperature": temperature,
        "time": segment_time,
    }


def validate_furnace_program_segments(segments: list[dict[str, Any]]) -> list[dict[str, int | float]]:
    """Validate a public program/preset payload and reject duplicate ids."""

    if not isinstance(segments, list):
        raise ValueError("Furnace program segments must be an array")
    normalized = [validate_furnace_program_segment(segment) for segment in segments]
    ids = [int(segment["id"]) for segment in normalized]
    if len(ids) != len(set(ids)):
        raise ValueError("Furnace program segment ids must be unique")
    return normalized
