#!/usr/bin/env python3
"""Judges whether a background session is alive from `claude agents --json --all` output on stdin.

usage: claude agents --json --all | liveness.py <session id>   → prints alive | dead | unknown

unknown — the listing failed to parse or does not name the session. A lookup gap is not a death:
treating it as one would start the supervisor grace timer and, past it, fork a live session.
"""
import json
import os
import sys

ALIVE, DEAD, UNKNOWN = 'alive', 'dead', 'unknown'


def pid_runs(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def liveness(listing_text, session_id, runs=pid_runs):
    try:
        sessions = json.loads(listing_text)
    except json.JSONDecodeError:
        return UNKNOWN
    match = next((s for s in sessions if isinstance(s, dict) and s.get('id') == session_id), None)
    if match is None:
        return UNKNOWN
    pid = match.get('pid')
    return ALIVE if pid and runs(pid) else DEAD


if __name__ == '__main__':
    print(liveness(sys.stdin.read(), sys.argv[1]))
