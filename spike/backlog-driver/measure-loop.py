#!/usr/bin/env python3
"""Reports time and token consumption per driven entry from a driver state dir.

usage: measure-loop.py <state-dir> <ledger-snapshot-dir>

Time: entry wall-clock from the driver log (started -> FINISHED), hand-off gap to the next entry,
per-phase durations from the run ledger's PHASE-START lines (next start, or the finish, closes one).
Tokens: equiv (input + 0.1 cache_read + 1.25 cache_creation + 5 output) per entry session, split
main thread vs sub-agents, from the transcripts the hook events name.
"""
import glob
import json
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from budget import equiv, transcripts_of, usage_by_message  # noqa: E402

STARTED = re.compile(r'^(\S+) entry (\d+) started')
FINISHED = re.compile(r'^(\S+) entry (\d+) FINISHED')
ATTENTION = re.compile(r'^(\S+) NOTIFY entry (\d+) (ASKED|PERMISSION)')
RESUMED = re.compile(r'^(\S+) entry (\d+) resume prompt sent')
PHASE_START = re.compile(r'PHASE-START\((\w+)\): (\S+)')


def at(stamp):
    return datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%SZ')


def minutes(start, end):
    return round((at(end) - at(start)).total_seconds() / 60, 1)


def driver_timeline(log_path):
    entries = {}
    for line in open(log_path):
        for pattern, key in ((STARTED, 'started'), (FINISHED, 'finished')):
            match = pattern.match(line)
            if match:
                entries.setdefault(int(match.group(2)), {}).setdefault(key, match.group(1))
        for pattern, key in ((ATTENTION, 'attention'), (RESUMED, 'resumes')):
            match = pattern.match(line)
            if match:
                entry = entries.setdefault(int(match.group(2)), {})
                entry[key] = entry.get(key, 0) + 1
    return entries


def entry_sessions(events_path):
    """Maps entry number -> transcript paths: a 'clear' SessionStart opens the next entry."""
    sessions, number = {}, 1
    for line in open(events_path):
        event = json.loads(line)
        payload = event['payload'] or {}
        if event['event'] == 'SessionStart' and payload.get('source') == 'clear':
            number += 1
        if payload.get('transcript_path'):
            sessions.setdefault(number, set()).add(payload['transcript_path'])
    return sessions


def tokens(transcript_paths):
    main_total, sub_total, sub_count = 0, 0, 0
    for main_path in transcript_paths:
        for path in transcripts_of(main_path):
            if not os.path.exists(path):
                continue
            spent = sum(equiv(u) for u in usage_by_message(path).values())
            if path == main_path:
                main_total += spent
            else:
                sub_total, sub_count = sub_total + spent, sub_count + 1
    return {'main': int(main_total), 'subagents': int(sub_total), 'subagent_count': sub_count}


def phase_durations(ledger_path, finished):
    starts = [m.groups() for m in map(PHASE_START.search, open(ledger_path)) if m]
    closes = [stamp for _, stamp in starts[1:]] + [finished]
    return [(phase, stamp, minutes(stamp, close)) for (phase, stamp), close in zip(starts, closes) if close]


def main(state_dir, ledger_dir):
    timeline = driver_timeline(os.path.join(state_dir, 'driver.log'))
    sessions = entry_sessions(os.path.join(state_dir, 'events.jsonl'))
    ledgers = sorted(glob.glob(os.path.join(ledger_dir, '*.md')), key=os.path.getmtime)
    previous_finish = None
    for number in sorted(timeline):
        entry = timeline[number]
        spent = tokens(sorted(sessions.get(number, ())))
        report = {
            'entry': number,
            'started': entry.get('started'),
            'finished': entry.get('finished'),
            'wall_min': minutes(entry['started'], entry['finished']) if 'finished' in entry else None,
            'handoff_gap_s': int((at(entry['started']) - at(previous_finish)).total_seconds()) if previous_finish else None,
            'attention_events': entry.get('attention', 0),
            'resumes': entry.get('resumes', 0),
            'equiv': {**spent, 'total': spent['main'] + spent['subagents']},
        }
        if number <= len(ledgers):
            report['ledger'] = os.path.basename(ledgers[number - 1])
            report['phases_min'] = phase_durations(ledgers[number - 1], entry.get('finished'))
        print(json.dumps(report, indent=1))
        previous_finish = entry.get('finished')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
