from __future__ import annotations

import os

import pytest

from devices.zahner import logic
from devices.zahner.real_device import ZahnerDevice
from devices.zahner.simulator_device import ZahnerSimulator
from experiment_worker import (
    build_advanced_node_folder_name,
    build_output_path,
    get_test_type_from_measurement,
)


@pytest.mark.parametrize(
    ("measurement_type", "source", "target", "value", "expected"),
    [
        ("ocp_measurement", "outputPath", "output_path", "/tmp/zahner", "/tmp/zahner"),
        ("ocp_measurement", "measurementDuration", "measurement_duration", "12.5", 12.5),
        ("ocp_measurement", "samplingInterval", "sampling_interval", "0.25", 0.25),
        ("chronoamperometry", "polarizationVoltage", "polarization_voltage", "0.33", 0.33),
        ("chronopotentiometry", "polarizationCurrent", "polarization_current", "0.012", 0.012),
        ("voltage_ramp", "startVoltageReference", "start_voltage_reference", "OCV", "ocv"),
        ("voltage_ramp", "endVoltageReference", "end_voltage_reference", "absolute", "absolute"),
        ("current_ramp", "startCurrent", "start_current", "-0.02", -0.02),
        ("current_ramp", "endCurrent", "end_current", "0.03", 0.03),
        ("eis_potentiostatic", "enableDcBias", "enable_dc_bias", True, True),
        ("eis_potentiostatic", "eisLowerFrequency", "eis_lower_frequency", "0.1", 0.1),
        # The alias is accepted, but scan direction remains authoritative and
        # replaces this stale UI field with the selected boundary.
        ("eis_potentiostatic", "eisStartFrequency", "eis_start_frequency", "100", 100000.0),
        ("eis_potentiostatic", "eisUpperFrequency", "eis_upper_frequency", "300000", 300000.0),
        ("eis_potentiostatic", "eisPotential", "eis_potential", "0.2", 0.2),
        ("eis_galvanostatic", "eisCurrent", "eis_current", "0.01", 0.01),
        ("eis_potentiostatic", "eisLowerPeriods", "eis_lower_periods", "4", 4),
        ("eis_potentiostatic", "eisUpperPeriods", "eis_upper_periods", "20", 20),
        ("eis_potentiostatic", "eisLowerSteps", "eis_lower_steps", "5", 5),
        ("eis_potentiostatic", "eisUpperSteps", "eis_upper_steps", "10", 10),
        ("eis_potentiostatic", "eisScanDirection", "eis_scan_direction", "start_to_max", "START_TO_MAX"),
        ("eis_potentiostatic", "eisScanStrategy", "eis_scan_strategy", "multi_sine", "MULTI_SINE"),
        ("galvanostatic_switching", "holdTime1", "hold_time_1", "3", 3.0),
        ("potentiostatic_switching", "holdTime2", "hold_time_2", "4", 4.0),
        ("galvanostatic_step_ramp", "stepCurrent", "step_current", "0.05", 0.05),
        ("potentiostatic_step_ramp", "stepPotential", "step_potential", "0.1", 0.1),
    ],
)
def test_frontend_measurement_parameter_aliases_are_canonicalized(
    measurement_type,
    source,
    target,
    value,
    expected,
):
    normalized = logic.normalize_measurement_parameters(measurement_type, {source: value})

    assert normalized[target] == expected
    if source != target:
        assert source not in normalized


def test_canonical_parameter_wins_over_alias_independent_of_input_order():
    normalized = logic.normalize_measurement_parameters(
        "chronoamperometry",
        {
            "polarization_voltage": 0.44,
            "polarizationVoltage": 0.33,
        },
    )

    assert normalized["polarization_voltage"] == 0.44
    assert "polarizationVoltage" not in normalized


@pytest.mark.parametrize(
    ("parameters", "message"),
    [
        ({"eisScanDirection": "SIDEWAYS"}, "scan direction"),
        ({"eisScanStrategy": "RANDOM"}, "scan strategy"),
        (
            {"eisLowerFrequency": 1000, "eisUpperFrequency": 10},
            "lower frequency",
        ),
    ],
)
def test_invalid_eis_controls_are_rejected_by_the_parameter_boundary(parameters, message):
    with pytest.raises(ValueError, match=message):
        logic.normalize_measurement_parameters("eis_potentiostatic", parameters)


def test_real_and_simulator_call_the_same_parameter_normalizer(monkeypatch):
    calls = []

    def fake_normalizer(measurement_type, parameters):
        calls.append((measurement_type, parameters))
        return {"output_path": "/tmp", "measurement_duration": 0.0}

    monkeypatch.setattr(logic, "normalize_measurement_parameters", fake_normalizer)
    monkeypatch.setattr(
        logic,
        "measure_ocp",
        lambda wrapper, parameters, callback: {"received": parameters},
    )

    real = ZahnerDevice()
    real.wrapper = object()
    real_result = real.measure("ocp_measurement", {"measurementDuration": 1})

    simulator = ZahnerSimulator()
    monkeypatch.setattr(
        simulator,
        "_measure_dc",
        lambda measurement_type, parameters, callback, mode: {"received": parameters},
    )
    simulator_result = simulator.measure("ocp_measurement", {"measurementDuration": 2})

    assert real_result["received"] == {"output_path": "/tmp", "measurement_duration": 0.0}
    assert simulator_result["received"] == {"output_path": "/tmp", "measurement_duration": 0.0}
    assert calls == [
        ("ocp_measurement", {"measurementDuration": 1}),
        ("ocp_measurement", {"measurementDuration": 2}),
    ]


@pytest.mark.parametrize(
    ("parent_node_type", "config", "expected_fragment"),
    [
        (
            "galvanostatic_step_ramp",
            {"startCurrent": 0.1, "endCurrent": 0.3, "stepCurrent": 0.05, "hold_time": 12},
            "ChronoRamp_100mA-300mA_step50mA_12s_",
        ),
        (
            "potentiostatic_step_ramp",
            {"start_potential": -0.2, "end_potential": 0.8, "stepPotential": 0.1, "hold_time": 15},
            "ChronoRamp_-200mV-800mV_step100mV_15s_",
        ),
        (
            "galvanostatic_switching",
            {"current_1": -0.01, "current_2": 0.02, "holdTime1": 3, "holdTime2": 4, "cycles": 2},
            "ChronoSwitch_-10mA-20mA_3s-4s_cycles_2_",
        ),
        (
            "potentiostatic_switching",
            {"potential_1": -0.1, "potential_2": 0.5, "holdTime1": 6, "holdTime2": 7, "cycles": 3},
            "ChronoSwitch_-100mV-500mV_6s-7s_cycles_3_",
        ),
    ],
)
def test_advanced_output_folder_uses_canonical_parameters(
    parent_node_type,
    config,
    expected_fragment,
):
    folder = build_advanced_node_folder_name(parent_node_type, {"nodeConfig": config})

    assert folder.startswith(expected_fragment)


def test_build_output_path_is_native_and_stays_under_base_directory(tmp_path):
    output_path = build_output_path(
        {
            "basePath": str(tmp_path),
            "projectName": "Project",
            "individualName": "Sample",
            "measurementType": "chronoamperometry",
        }
    )

    assert os.path.commonpath([str(tmp_path), output_path]) == str(tmp_path)
    assert os.path.relpath(output_path, str(tmp_path)).split(os.sep) == [
        "Project",
        "Sample",
        "ca",
    ]


@pytest.mark.parametrize(
    ("measurement_type", "expected_folder"),
    [
        ("eis_potentiostatic", "eis"),
        ("eis_galvanostatic", "eis"),
        ("ocp_measurement", "ocp"),
        ("chronoamperometry", "ca"),
        ("chronopotentiometry", "cp"),
        ("voltage_ramp", "lsv"),
        ("current_ramp", "gsv"),
    ],
)
def test_measurement_output_folder_matches_measurement_semantics(
    measurement_type,
    expected_folder,
):
    assert get_test_type_from_measurement(measurement_type) == expected_folder


@pytest.mark.parametrize(
    ("logical_path", "expected"),
    [
        ("C:/Zahner Data/Run 1", "c:\\zahner data\\run 1"),
        ("D:\\Measurements\\EIS", "d:\\measurements\\eis"),
    ],
)
def test_thales_path_adapter_preserves_windows_drive_semantics(logical_path, expected):
    assert logic._to_thales_windows_path(logical_path) == expected


def test_dc_output_file_keeps_native_logical_path(tmp_path):
    output_file = logic._prepare_output_path(
        {"output_path": str(tmp_path), "measurement_duration": 1},
        "ocp_measurement",
    )

    assert os.path.commonpath([str(tmp_path), output_file]) == str(tmp_path)
    assert output_file.endswith(".csv")
