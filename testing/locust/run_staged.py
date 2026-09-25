import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOCUST_FILE = ROOT / "testing/locust/locustfile.py"
RESULTS_ROOT = ROOT / "testing/locust/results"


def main():
    stages = [
        int(value.strip())
        for value in os.getenv("LOCUST_STAGES", "10,25,50,100,200").split(",")
        if value.strip()
    ]
    run_time = os.getenv("LOCUST_RUN_TIME", "45s")
    tags = os.getenv("LOCUST_TAGS", "read")
    spawn_divisor = max(int(os.getenv("LOCUST_SPAWN_DIVISOR", "10")), 1)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = RESULTS_ROOT / stamp
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"Locust staged run -> {run_dir}")
    print(f"Stages: {stages} | time/stage: {run_time} | tags: {tags}")

    for users in stages:
        spawn_rate = max(1, users // spawn_divisor)
        prefix = run_dir / f"u{users}"
        html = run_dir / f"u{users}.html"

        cmd = [
            sys.executable,
            "-m",
            "locust",
            "-f",
            str(LOCUST_FILE),
            "--headless",
            "-u",
            str(users),
            "-r",
            str(spawn_rate),
            "-t",
            run_time,
            "--tags",
            tags,
            "--csv",
            str(prefix),
            "--html",
            str(html),
            "--only-summary",
        ]

        print("\n" + "=" * 68)
        print(f"Stage {users} users | spawn {spawn_rate}/s")
        print("=" * 68)
        result = subprocess.run(cmd, cwd=ROOT, env=os.environ.copy())

        if result.returncode != 0:
            print(
                f"STOP: stage {users} failed thresholds or execution "
                f"(exit={result.returncode}). Results remain in {run_dir}."
            )
            return result.returncode

    print(f"\nAll stages completed. Results: {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
