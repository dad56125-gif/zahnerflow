"""Furnace safety limits shared by runtime write paths."""

FURNACE_MAX_TEMPERATURE_C = 1100


def validate_furnace_temperature(value: float, context: str = "temperature") -> float:
    temperature = float(value)
    if temperature > FURNACE_MAX_TEMPERATURE_C:
        raise ValueError(f"Furnace {context} exceeds {FURNACE_MAX_TEMPERATURE_C} C")
    return temperature
