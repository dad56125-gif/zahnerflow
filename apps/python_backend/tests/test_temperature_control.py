from __future__ import annotations

import pytest

from runtime.temperature_control import (
    estimate_remaining_temperature_seconds,
    estimate_temperature_ramp_minutes,
)


def test_temperature_cooling_estimate_slows_below_linear_floor():
    assert estimate_temperature_ramp_minutes(700, 500, 5) == pytest.approx(40.0)
    assert estimate_temperature_ramp_minutes(300, 500, 5) == pytest.approx(40.0)

    low_temperature_cooling = estimate_temperature_ramp_minutes(500, 300, 5)
    assert low_temperature_cooling > 40.0
    assert low_temperature_cooling == pytest.approx(51.9, abs=0.1)

    mixed_cooling = estimate_temperature_ramp_minutes(700, 300, 5)
    assert mixed_cooling == pytest.approx(40.0 + low_temperature_cooling, abs=0.1)


def test_temperature_remaining_estimate_uses_observed_progress():
    samples = [
        (0.0, 500.0),
        (60.0, 496.0),
        (120.0, 493.0),
        (180.0, 491.0),
    ]

    remaining = estimate_remaining_temperature_seconds(samples, target_temp=300, tolerance=0.5)

    assert remaining is not None
    assert remaining > 0
