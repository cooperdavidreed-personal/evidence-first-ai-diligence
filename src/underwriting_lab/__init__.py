"""Deterministic synthetic underwriting analytics and workbench compiler."""

from .analysis import analyze_room
from .generator import generate_room

__all__ = ["analyze_room", "generate_room"]
__version__ = "0.1.0"
