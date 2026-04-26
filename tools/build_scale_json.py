"""Convert Resource/Scales/Song_Info ({SP,DP}).csv into the JSON files
consumed by the Scale analyzer page (assets/js/site-interactions.js).

Run from the repository root:

    python tools/build_scale_json.py

Outputs (overwritten):
    Resource/Scales/scale-analyzer-sp.json
    Resource/Scales/scale-analyzer-dp.json

CSV schema (current):
    Song Title, Song MD5 hash, Song difficulty,
    Song-wise discrimination,
    Song-wise EASY-clear difficulty,
    Song-wise HARD-clear difficulty,
    Low-sample low-confidence flag

JSON schema (one object per chart):
    title, difficulty, discrimination, easy, hard, md5, lowConfidence,
    previousDiscrimination?, previousEasy?, previousHard?

The `previous*` fields are attached when the same MD5 existed in the
last *committed* (HEAD) version of the JSON. The UI uses them to render
delta indicators (↑/↓) so users can see what shifted between pushes.
Songs that did not exist in HEAD have no `previous*` fields — the UI
treats them as new rows.
"""

from __future__ import annotations

import csv
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCALES = ROOT / "Resource" / "Scales"
USERS = ROOT / "Resource" / "Users"

SOURCES = {
    "sp": SCALES / "Song_Info (SP).csv",
    "dp": SCALES / "Song_Info (DP).csv",
}
OUTPUTS = {
    "sp": SCALES / "scale-analyzer-sp.json",
    "dp": SCALES / "scale-analyzer-dp.json",
}

USER_SOURCES = {
    "sp": USERS / "User_Info (SP).csv",
    "dp": USERS / "User_Info (DP).csv",
}
USER_OUTPUTS = {
    "sp": USERS / "scale-analyzer-players-sp.json",
    "dp": USERS / "scale-analyzer-players-dp.json",
}


def _to_float(raw: str) -> float | None:
    raw = raw.strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _to_bool(raw: str) -> bool:
    return raw.strip().lower() == "true"


def convert(csv_path: Path) -> list[dict]:
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            rows.append(
                {
                    "title": row["Song Title"],
                    "difficulty": row["Song difficulty"],
                    "discrimination": _to_float(row["Song-wise discrimination"]),
                    "easy": _to_float(row["Song-wise EASY-clear difficulty"]),
                    "hard": _to_float(row["Song-wise HARD-clear difficulty"]),
                    "md5": row["Song MD5 hash"],
                    "lowConfidence": _to_bool(row.get("Low-sample low-confidence flag", "")),
                }
            )
    return rows


def load_committed_json(path: Path) -> dict:
    """Return the HEAD-committed version of ``path`` as an md5->row map.

    Returns an empty dict if the file is not tracked, the repository has no
    HEAD yet, or the committed contents are not valid JSON. Any failure is
    silently treated as "no baseline" so the build still produces output.
    """
    rel = path.relative_to(ROOT).as_posix()
    try:
        result = subprocess.run(
            ["git", "show", f"HEAD:{rel}"],
            capture_output=True,
            check=True,
            cwd=str(ROOT),
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {}
    try:
        rows = json.loads(result.stdout.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}
    return {r["md5"]: r for r in rows if isinstance(r, dict) and r.get("md5")}


def attach_previous(rows: list[dict], previous: dict) -> tuple[int, int]:
    """Annotate rows with previous values from the HEAD-committed JSON.

    Returns ``(matched, new)`` counts for logging.
    """
    matched = 0
    new = 0
    for r in rows:
        prev = previous.get(r["md5"])
        if prev is None:
            new += 1
            continue
        matched += 1
        if prev.get("discrimination") is not None:
            r["previousDiscrimination"] = prev["discrimination"]
        if prev.get("easy") is not None:
            r["previousEasy"] = prev["easy"]
        if prev.get("hard") is not None:
            r["previousHard"] = prev["hard"]
    return matched, new


def convert_user(csv_path: Path) -> list[dict]:
    """Convert User_Info.csv into the compact JSON consumed by the player table.

    Schema per row:
        nick    : Player nickname
        dani    : Player dani rank string ('SP/DP' format) or None if missing/'-/-'
        skill   : Player quantitative skill (float, -inf filtered)
        ceiling : Player ceiling skill (float)
        ir      : List of IR sources contributing records for the player
                  (e.g. ["lr2"], ["lr2","tachi"]); empty list if none.

    Player IDs and the diligence / contribution / peak fields are intentionally
    excluded — the table is meant for "where do I sit on the curve" lookup,
    not as a full data dump.
    """
    rows: list[dict] = []
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                skill = float(row["Player quantitative skill"])
                ceiling = float(row["Player ceiling skill"])
            except (TypeError, ValueError, KeyError):
                continue
            dani_raw = (row.get("Player dani rank") or "").strip()
            dani = dani_raw if dani_raw and dani_raw != "-/-" else None
            ir_raw = (row.get("Player IR sources") or "").strip()
            ir = [tag.strip() for tag in ir_raw.split(",") if tag.strip()]
            rows.append(
                {
                    "nick": row.get("Player nickname") or "",
                    "dani": dani,
                    "skill": skill,
                    "ceiling": ceiling,
                    "ir": ir,
                }
            )
    return rows


def main() -> None:
    for mode, src in SOURCES.items():
        if not src.exists():
            raise FileNotFoundError(f"Missing source CSV: {src}")
        rows = convert(src)
        dst = OUTPUTS[mode]
        previous = load_committed_json(dst)
        matched, new = attach_previous(rows, previous)
        dst.write_text(
            json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        flagged = sum(1 for r in rows if r["lowConfidence"])
        baseline = (
            f"baseline=HEAD ({len(previous)} rows, {matched} matched, {new} new)"
            if previous
            else "baseline=none (no committed JSON to diff against)"
        )
        print(
            f"{mode.upper()}: wrote {len(rows)} rows ({flagged} low-confidence) "
            f"-> {dst.relative_to(ROOT)} | {baseline}"
        )

    for mode, src in USER_SOURCES.items():
        if not src.exists():
            print(f"[WARN] Skipping player JSON for {mode.upper()}: {src} not found")
            continue
        rows = convert_user(src)
        dst = USER_OUTPUTS[mode]
        dst.write_text(
            json.dumps(rows, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        with_dani = sum(1 for r in rows if r["dani"])
        print(
            f"{mode.upper()} players: wrote {len(rows)} rows "
            f"({with_dani} with dani) -> {dst.relative_to(ROOT)}"
        )


if __name__ == "__main__":
    main()
