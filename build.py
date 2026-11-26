"""Static web build: copies web/ to dist/."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent

shutil.rmtree(ROOT / "dist", ignore_errors=True)
shutil.copytree(ROOT / "web", ROOT / "dist")
print("Static web build ready in dist/")
