"""Runtime package bootstrap for the script-style backend entrypoint."""

from __future__ import annotations

import sys
from pathlib import Path


# The backend is launched as ``python apps/python_backend/main.py`` while the
# shared Python contracts live next to it under ``apps/shared``.  Keep the
# existing top-level imports (``runtime``, ``devices``, etc.) working and make
# the sibling shared package available in both development and packaged runs.
_apps_dir = str(Path(__file__).resolve().parents[2])
if _apps_dir not in sys.path:
    sys.path.insert(0, _apps_dir)
