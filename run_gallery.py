from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

APP_PATH = Path(__file__).resolve().with_name("app.py")


def main() -> int:
    command = [sys.executable, "-X", "faulthandler", str(APP_PATH), *sys.argv[1:]]
    print(f"Gallery supervisor PID: {os.getpid()}")
    print("Starting app.py with Python fault diagnostics enabled.")

    while True:
        process = subprocess.Popen(command)
        print(f"Gallery child PID: {process.pid}")
        try:
            return_code = process.wait()
        except KeyboardInterrupt:
            print("\nStopping gallery supervisor.")
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            return 0

        if return_code == 0:
            print("Gallery exited normally; supervisor stopping.")
            return 0

        print(
            f"Gallery exited unexpectedly with code {return_code}. "
            "Restarting in 1 second..."
        )
        time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(main())
