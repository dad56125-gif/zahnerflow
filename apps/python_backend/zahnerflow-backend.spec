# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

repo_root = Path(SPECPATH).parents[1]
backend_root = repo_root / "apps" / "python_backend"


a = Analysis(
    [str(backend_root / "main.py")],
    pathex=[str(backend_root), str(repo_root / "apps")],
    binaries=[],
    datas=[],
    hiddenimports=[
        "engineio.async_drivers.asgi",
        "serial.tools.list_ports",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="zahnerflow-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="zahnerflow-backend",
    distpath=str(backend_root / "dist"),
    workpath=str(repo_root / ".codex-run" / "pyinstaller-build"),
)
