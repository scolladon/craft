#!/usr/bin/env python3
"""Counts how often past craft runs stopped for a person, from main-thread transcripts.

usage: ask-frequency.py <projects-dir-glob>...   (top-level <session>.jsonl files; sub-agents excluded)

Per session that invoked craft:run, after the first invocation:
  asks      AskUserQuestion tool calls, attributed to the phase last announced (PHASE-START(<p>) in a
            Bash command, or a Skill call to craft:<phase>);
  prose     turns that ended in a question mark right before a typed user message (upper bound on
            prose asks — some are rhetorical);
  typed     typed user messages (answers to prose asks, steering, unprompted interjections).
"""
import glob
import json
import re
import sys
from collections import Counter

RUN_SKILL = 'craft:run'
PHASE_START = re.compile(r'PHASE-START\((\w[\w-]*)\)')
NOT_TYPED = ('<task-notification>', '<local-command', '<command-name>', '<system-reminder>', '[Request interrupted')


def blocks(entry):
    content = (entry.get('message') or {}).get('content')
    if isinstance(content, str):
        return [{'type': 'text', 'text': content}]
    return content if isinstance(content, list) else []


def is_typed(entry):
    if entry.get('type') != 'user' or entry.get('isMeta'):
        return False
    texts = [b.get('text', '') for b in blocks(entry) if b.get('type') == 'text']
    if not texts or any(b.get('type') == 'tool_result' for b in blocks(entry)):
        return False
    text = '\n'.join(texts).strip()
    return bool(text) and not text.startswith(NOT_TYPED)


def is_run_start(entry):
    for block in blocks(entry):
        if block.get('type') == 'tool_use' and block.get('name') == 'Skill' and (block.get('input') or {}).get('skill') == RUN_SKILL:
            return True
        if block.get('type') == 'text' and '<command-name>/craft:run</command-name>' in block.get('text', ''):
            return True
    return False


def phase_signal(block):
    if block.get('type') != 'tool_use':
        return None
    data = block.get('input') or {}
    if block.get('name') == 'Skill' and str(data.get('skill', '')).startswith('craft:') and data.get('skill') != RUN_SKILL:
        return data['skill'].split(':', 1)[1]
    if block.get('name') == 'Bash':
        found = PHASE_START.findall(str(data.get('command', '')))
        return found[-1] if found else None
    return None


def survey(path):
    started, phase, last_text = False, 'pre-phase', ''
    asks, headers, prose, typed = Counter(), [], 0, 0
    for line in open(path):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not started:
            started = is_run_start(entry)
            continue
        if entry.get('type') == 'assistant':
            for block in blocks(entry):
                phase = phase_signal(block) or phase
                if block.get('type') == 'tool_use' and block.get('name') == 'AskUserQuestion':
                    asks[phase] += 1
                    headers.append(f"{phase}:{','.join(q.get('header', '?') for q in (block.get('input') or {}).get('questions', []))}")
                if block.get('type') == 'text' and block.get('text', '').strip():
                    last_text = block['text'].strip()
        elif is_typed(entry):
            typed += 1
            prose += last_text.endswith('?') or last_text[-300:].count('?') > 0
            last_text = ''
    return started, asks, headers, prose, typed


def main(globs):
    paths = sorted({p for g in globs for p in glob.glob(g)})
    runs, by_phase, sessions_with_ask = 0, Counter(), 0
    totals = Counter()
    for path in paths:
        started, asks, headers, prose, typed = survey(path)
        if not started:
            continue
        runs += 1
        by_phase.update(asks)
        sessions_with_ask += bool(asks)
        totals.update({'asks': sum(asks.values()), 'prose': prose, 'typed': typed, 'silent': not asks and not typed})
        print(json.dumps({'session': path.split('/')[-1][:8], 'project': path.split('/')[-2][len('-Users-scolladon-workspace-perso-'):],
                          'asks': sum(asks.values()), 'prose_candidates': prose, 'typed': typed, 'headers': headers}))
    print(json.dumps({'runs': runs, 'sessions_with_ask': sessions_with_ask, 'totals': totals, 'asks_by_phase': by_phase}))


if __name__ == '__main__':
    main(sys.argv[1:])
