#!/usr/bin/env python3
"""Prints the equiv-token spend of the given main transcripts plus their sub-agent transcripts.

equiv = input + 0.1*cache_read + 1.25*cache_creation + 5*output, folded last-wins per message id,
the same weighting the earlier headless-loop spike used.
"""
import glob
import json
import os
import sys

WEIGHTS = {'input_tokens': 1, 'cache_read_input_tokens': 0.1, 'cache_creation_input_tokens': 1.25, 'output_tokens': 5}


def transcripts_of(main_path):
    sub_dir = os.path.join(main_path[: -len('.jsonl')], 'subagents')
    return [main_path, *sorted(glob.glob(os.path.join(sub_dir, '*.jsonl')))]


def usage_by_message(path):
    folded = {}
    with open(path) as lines:
        for line in lines:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            message = entry.get('message') or {}
            if entry.get('type') == 'assistant' and message.get('usage') and message.get('id'):
                folded[message['id']] = message['usage']
    return folded


def equiv(usage):
    return sum(weight * (usage.get(field) or 0) for field, weight in WEIGHTS.items())


def main(paths):
    total = 0
    for main_path in dict.fromkeys(paths):
        for path in transcripts_of(main_path):
            if os.path.exists(path):
                total += sum(equiv(u) for u in usage_by_message(path).values())
    print(int(total))


if __name__ == '__main__':
    main(sys.argv[1:])
