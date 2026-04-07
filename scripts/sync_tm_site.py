from pathlib import Path
import runpy

ENTRYPOINT = Path(__file__).resolve().parents[1] / "tools" / "site" / "sync-site.py"

runpy.run_path(str(ENTRYPOINT), run_name="__main__")
