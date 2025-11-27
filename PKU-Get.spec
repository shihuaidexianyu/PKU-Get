# PKU-Get PyInstaller Spec File
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['gui.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('gui/dist', 'gui/dist'),  # Include built frontend files
    ],
    hiddenimports=[
        'pywebview',
        'pywebview.platforms.winforms',  # Windows
        'pywebview.platforms.cocoa',     # macOS
        'pywebview.platforms.qt',        # Linux
        'selenium',
        'webdriver_manager',
        'beautifulsoup4',
        'bs4',
        'requests',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='PKU-Get',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window (GUI app)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='gui/public/vite.svg' if os.path.exists('gui/public/vite.svg') else None,
)
