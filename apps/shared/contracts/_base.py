"""Shared helpers for contract models and code generation."""

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    """Convert snake_case names to camelCase."""
    if "_" not in value:
        return value

    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


class ContractModel(BaseModel):
    """Base model for shared contracts with camelCase aliases."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
