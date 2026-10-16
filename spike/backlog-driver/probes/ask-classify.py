#!/usr/bin/env python3
"""Classifies the asks ask-frequency.py found: could a pre-approval policy have answered them?

usage: ask-classify.py <ask-frequency.jsonl> [session-prefix-to-exclude ...]
outward   every question is a push/PR/merge/bookkeeping confirmation — a policy pre-approval covers it
paid      a paid eval / paid model run — needs a budget pre-approval or a person
env       auth, network or tooling the person has to fix
judgment  anything else: a design fork, review/scope call, next-step choice — needs a person
"""
import json
import re
import sys
from collections import Counter

CLASSES = [
    ('outward', re.compile(r'^(push|merge|pr\b|bookkeeping|main push|metrics push|push main)', re.I)),
    ('paid', re.compile(r'paid|before (opus|haiku|run)|after haiku|haiku regr', re.I)),
    ('env', re.compile(r'auth|network|docker|bats/yq', re.I)),
]


def classify(questions):
    kinds = {next((name for name, pattern in CLASSES if pattern.search(q.strip())), 'judgment') for q in questions}
    for name in ('judgment', 'env', 'paid'):
        if name in kinds:
            return name
    return 'outward'


def main(path, excluded):
    per_class, runs_needing_person, runs = Counter(), 0, 0
    for line in open(path):
        row = json.loads(line)
        if 'session' not in row or row['session'].startswith(tuple(excluded)):
            continue
        runs += 1
        kinds = [classify(h.split(':', 1)[1].split(',')) for h in row['headers']]
        per_class.update(kinds)
        blocking = [k for k in kinds if k != 'outward']
        runs_needing_person += bool(blocking) or row['prose_candidates'] > 0
        print(row['session'], row['project'][:28].ljust(28), Counter(kinds).most_common(), 'prose', row['prose_candidates'])
    print(json.dumps({'runs': runs, 'asks_by_class': per_class, 'runs_with_a_non_outward_ask_or_prose_ask': runs_needing_person}))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
