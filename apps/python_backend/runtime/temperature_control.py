"""Temperature program and ETA helpers for workflow execution."""

from __future__ import annotations

from typing import Sequence


# Each tuple is ``(lower_temperature, maximum_achievable_rate)`` for the
# interval below the previous boundary.  The first interval starts at the
# configurable linear cooling floor (500C by default).  These conservative
# defaults are intentionally independent from the requested program rate and
# can be recalibrated when real-furnace history is available.
DEFAULT_COOLING_RATE_BANDS: tuple[tuple[float, float], ...] = (
    (300.0, 3.0),
    (150.0, 1.5),
    (80.0, 0.8),
    (25.0, 0.4),
)


def estimate_temperature_program_minutes(
    current_temp: float,
    target_temp: float,
    rate: float,
) -> float:
    """Return the linear duration that must be programmed into the furnace."""
    requested_rate = float(rate)
    if requested_rate <= 0:
        raise ValueError("Temperature rate must be greater than 0")
    return abs(float(target_temp) - float(current_temp)) / requested_rate


def estimate_temperature_ramp_minutes(
    current_temp: float,
    target_temp: float,
    rate: float,
    tolerance: float = 0.5,
    cooling_linear_floor: float = 500.0,
    cooling_rate_bands: Sequence[tuple[float, float]] = DEFAULT_COOLING_RATE_BANDS,
) -> float:
    """Estimate when the measured temperature will enter the target band.

    The program setpoint remains a linear ramp.  ETA uses conservative,
    temperature-banded cooling capabilities below ``cooling_linear_floor`` so
    a target at ambient temperature does not create a logarithmic singularity.
    """
    current = float(current_temp)
    target = float(target_temp)
    requested_rate = float(rate)
    tolerance_value = max(0.0, float(tolerance))
    if requested_rate <= 0:
        raise ValueError("Temperature rate must be greater than 0")

    if current == target:
        return 0.0

    if target > current:
        completion_target = max(current, target - tolerance_value)
        return (completion_target - current) / requested_rate

    completion_target = min(current, target + tolerance_value)
    linear_floor = float(cooling_linear_floor)

    minutes = 0.0
    cooling_start = current
    if cooling_start > linear_floor:
        linear_target = max(completion_target, linear_floor)
        minutes += (cooling_start - linear_target) / requested_rate
        cooling_start = linear_target

    last_capability = requested_rate
    for lower_temperature, maximum_rate in cooling_rate_bands:
        lower = float(lower_temperature)
        capability = float(maximum_rate)
        if capability <= 0:
            raise ValueError("Cooling band rate must be greater than 0")
        last_capability = capability
        segment_target = max(completion_target, lower)
        if cooling_start > segment_target:
            effective_rate = min(requested_rate, capability)
            minutes += (cooling_start - segment_target) / effective_rate
            cooling_start = segment_target
        if cooling_start <= completion_target:
            break

    if cooling_start > completion_target:
        minutes += (cooling_start - completion_target) / min(requested_rate, last_capability)

    return max(0.0, minutes)


def estimate_temperature_wait_seconds(
    current_temp: float,
    target_temp: float,
    rate: float,
    stabilization_time: float = 30.0,
    tolerance: float = 0.5,
    cooling_linear_floor: float = 500.0,
) -> float:
    ramp_minutes = estimate_temperature_ramp_minutes(
        current_temp=current_temp,
        target_temp=target_temp,
        rate=rate,
        tolerance=tolerance,
        cooling_linear_floor=cooling_linear_floor,
    )
    return ramp_minutes * 60.0 + max(0.0, float(stabilization_time))


def estimate_remaining_temperature_seconds(
    samples: Sequence[tuple[float, float]],
    target_temp: float,
    tolerance: float,
) -> float | None:
    """Estimate remaining seconds from observed progress toward target."""
    if len(samples) < 2:
        return None

    target = float(target_temp)
    tolerance_value = max(0.0, float(tolerance))
    end_time, end_temp = samples[-1]
    end_distance = max(0.0, abs(end_temp - target) - tolerance_value)
    if end_distance <= 0:
        return 0.0

    start_time = end_time
    start_temp = end_temp
    for sample_time, sample_temp in reversed(samples[:-1]):
        if end_time - sample_time >= 60.0 or sample_time == samples[0][0]:
            start_time = sample_time
            start_temp = sample_temp
            break

    elapsed_seconds = end_time - start_time
    if elapsed_seconds <= 0:
        return None

    start_distance = max(0.0, abs(start_temp - target) - tolerance_value)
    progress = start_distance - end_distance
    if progress <= 0:
        return None

    return end_distance / (progress / elapsed_seconds)
