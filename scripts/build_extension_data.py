from pathlib import Path
import runpy

ENTRYPOINT = Path(__file__).resolve().parents[1] / "tools" / "data" / "build-extension.py"

runpy.run_path(str(ENTRYPOINT), run_name="__main__")
