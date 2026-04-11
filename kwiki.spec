# -*- mode: python ; coding: utf-8 -*-
import os, sys

block_cipher = None

a = Analysis(
    ["kwiki.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("config", "config"),
        ("fetchers", "fetchers"),
        ("llm", "llm"),
        ("wiki", "wiki"),
    ],
    hiddenimports=[
        "tkinter", "config", "fetchers", "llm", "wiki",
        "requests", "urllib.parse", "urllib.request",
        "bs4", "beautifulsoup4",
        "fitz", "pymupdf",
        "docx", "lxml", "olefile",
        "yt_dlp",
        "trafilatura",
        "dateutil", "zoneinfo",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "PyQt5", "PyQt5-sip", "PyQt5.QtCore", "PyQt5.QtGui",
        "PySide2", "PySide6", "PySide6_Addons", "PySide6_Essentials",
        "qtpy",
        "matplotlib.tests", "scipy.tests", "sklearn.tests",
        "pytest", "IPython", "notebook", "jupyterlab",
        "tensorflow", "torch", "torchaudio", "torchvision",
        "transformers", "diffusers",
        "numba", "numba.tests",
        "bokeh", "panel", "holoviews",
        "plotly", "dash",
        "pandas", "xarray", "dask", "distributed",
        "psycopg2",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="kwiki",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="kwiki",
)
