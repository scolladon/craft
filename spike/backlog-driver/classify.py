#!/usr/bin/env python3
"""Classifies a driven run from the hook events recorded after a mark and its status file.

Prints one JSON object: {"verdict": ..., "detail": ..., "index": <last event line>}.
Verdicts: RUNNING, FINISHED, BLOCKED, ASKED, WAITING-BG, PERMISSION.
"""
import json
import os
import sys

ASK_TOOL = 'AskUserQuestion'
TERMINAL_STATUSES = ('FINISHED', 'BLOCKED')


def events_after(path, mark):
    if not os.path.exists(path):
        return []
    with open(path) as lines:
        return [json.loads(line) for line in lines][mark:]


def read_status(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        verdict, _, detail = f.readline().strip().partition(' ')
    return (verdict, detail) if verdict in TERMINAL_STATUSES else None


def first_question(tool_input):
    questions = (tool_input or {}).get('questions') or [{}]
    return questions[0].get('question', '')


def on_stop(payload, status):
    if status is not None:
        return status
    if payload.get('background_tasks'):
        return ('WAITING-BG', '')
    return ('ASKED', payload.get('last_assistant_message') or '')


def on_permission(payload, waiting):
    # A hook may already have answered the request; only a live waiting flag means a person is needed.
    if waiting == '':
        return ('RUNNING', '')
    if payload.get('tool_name') == ASK_TOOL:
        return ('ASKED', first_question(payload.get('tool_input')))
    return ('PERMISSION', payload.get('tool_name', ''))


def verdict_of(last, status, waiting):
    payload = last.get('payload') or {}
    if last['event'] == 'Stop':
        return on_stop(payload, status)
    if last['event'] == 'PermissionRequest':
        return on_permission(payload, waiting)
    return ('RUNNING', '')


def classify(events_path, mark, status_path, waiting=None):
    """waiting: the session's agents --json waitingFor ('' = none); None when unknown (tmux driver)."""
    events = events_after(events_path, mark)
    if not events:
        return {'verdict': 'RUNNING', 'detail': '', 'index': mark}
    verdict, detail = verdict_of(events[-1], read_status(status_path), waiting)
    return {'verdict': verdict, 'detail': detail, 'index': mark + len(events)}


if __name__ == '__main__':
    print(json.dumps(classify(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)))
