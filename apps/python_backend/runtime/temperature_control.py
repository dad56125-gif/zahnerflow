"""Temperature control timing helpers for workflow execution."""

from __future__ import annotations

import math
from typing import Sequence


MIN_COOLING_DELTA_C = 0.1


def estimate_temperature_ramp_minutes(
    current_temp: float,
    target_temp: float,
    rate: float,
    ambient_temperature: float = 25.0,
    cooling_linear_floor: float = 500.0,
) -> float:
    """Estimate ramp time.

    Heating and high-temperature cooling are treated as linear ramps. Cooling
    below ``cooling_linear_floor`` uses a Newton-cooling approximation so the
    effective cooling rate naturally decreases near ambient temperature.
    """
    current = float(current_temp)
    target = float(target_temp)
    requested_rate = float(rate)
    if requested_rate <= 0:
        raise ValueError("Temperature rate must be greater than 0")

    if current == target:
        return 0.0

    if target > current:
        return (target - current) / requested_rate

    ambient = min(float(ambient_temperature), current - MIN_COOLING_DELTA_C, target - MIN_COOLING_DELTA_C)
    linear_floor = max(float(cooling_linear_floor), ambient + MIN_COOLING_DELTA_C)

    minutes = 0.0
    cooling_start = current
    if cooling_start > linear_floor:
        linear_target = max(target, linear_floor)
        minutes += (cooling_start - linear_target) / requested_rate
        cooling_start = linear_target

    if target < cooling_start:
        cooling_constant = requested_rate / max(linear_floor - ambient, MIN_COOLING_DELTA_C)
        start_delta = max(cooling_start - ambient, MIN_COOLING_DELTA_C)
        target_delta = max(target - ambient, MIN_COOLING_DELTA_C)
        minutes += math.log(start_delta / target_delta) / cooling_constant

    return max(0.0, minutes)


def estimate_temperature_wait_seconds(
    current_temp: float,
    target_temp: float,
    rate: float,
    stabilization_time: float = 30.0,
    ambient_temperature: float = 25.0,
    cooling_linear_floor: float = 500.0,
) -> float:
    ramp_minutes = estimate_temperature_ramp_minutes(
        current_temp=current_temp,
        target_temp=target_temp,
        rate=rate,
        ambient_temperature=ambient_temperature,
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
