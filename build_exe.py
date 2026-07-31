import PyInstaller.__main__
import shutil
import os

# Clean dist/build
if os.path.exists("dist"):
    shutil.rmtree("dist")
if os.path.exists("build"):
    shutil.rmtree("build")

print("Starting build...")

PyInstaller.__main__.run([
    'gui.py',
    '--name=ArchiveDownloader',
    '--onefile',
    '--noconsole',
    '--collect-all=customtkinter',
    '--hidden-import=Crypto',
    '--icon=app.ico',
    '--add-data=app.ico;.',
    '--clean',
])

print("Build complete. Check dist/ArchiveDownloader.exe")
