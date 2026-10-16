import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from classify import classify  # noqa: E402


def event(name, **payload):
    return json.dumps({'ts': 't', 'event': name, 'payload': {'hook_event_name': name, **payload}})


class ClassifyTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.events = os.path.join(self.dir, 'events.jsonl')
        self.status = os.path.join(self.dir, 'entry.status')

    def write_events(self, *lines):
        with open(self.events, 'w') as f:
            f.write(''.join(line + '\n' for line in lines))

    def write_status(self, text):
        with open(self.status, 'w') as f:
            f.write(text)

    def test_given_no_event_after_mark_when_classified_then_running(self):
        self.write_events(event('Stop', last_assistant_message='old', background_tasks=[]))
        sut = classify(self.events, 1, self.status)
        self.assertEqual(sut['verdict'], 'RUNNING')

    def test_given_status_and_final_stop_when_classified_then_finished_with_detail(self):
        self.write_events(event('Stop', last_assistant_message='done', background_tasks=[]))
        self.write_status('FINISHED https://github.com/o/r/pull/7\n')
        sut = classify(self.events, 0, self.status)
        self.assertEqual((sut['verdict'], sut['detail']), ('FINISHED', 'https://github.com/o/r/pull/7'))

    def test_given_status_blocked_and_stop_when_classified_then_blocked(self):
        self.write_events(event('Stop', last_assistant_message='ci red', background_tasks=[]))
        self.write_status('BLOCKED ci red after one fix round\n')
        sut = classify(self.events, 0, self.status)
        self.assertEqual((sut['verdict'], sut['detail']), ('BLOCKED', 'ci red after one fix round'))

    def test_given_status_but_turn_still_open_when_classified_then_running(self):
        self.write_events(event('PermissionRequest', tool_name='Bash'), event('SubagentStop'))
        self.write_status('FINISHED x\n')
        sut = classify(self.events, 0, self.status)
        self.assertEqual(sut['verdict'], 'RUNNING')

    def test_given_stop_without_status_and_no_background_when_classified_then_asked_in_prose(self):
        self.write_events(event('Stop', last_assistant_message='Which option: (a) or (b)?', background_tasks=[]))
        sut = classify(self.events, 0, self.status)
        self.assertEqual((sut['verdict'], sut['detail']), ('ASKED', 'Which option: (a) or (b)?'))

    def test_given_stop_with_background_task_when_classified_then_waiting_on_background(self):
        self.write_events(event('Stop', last_assistant_message='waiting', background_tasks=[{'id': 'b1'}]))
        sut = classify(self.events, 0, self.status)
        self.assertEqual(sut['verdict'], 'WAITING-BG')

    def test_given_pending_ask_user_question_when_classified_then_asked_with_question(self):
        questions = [{'question': 'Merge now?', 'options': []}]
        self.write_events(event('PermissionRequest', tool_name='AskUserQuestion', tool_input={'questions': questions}))
        sut = classify(self.events, 0, self.status)
        self.assertEqual((sut['verdict'], sut['detail']), ('ASKED', 'Merge now?'))

    def test_given_pending_tool_permission_when_classified_then_permission(self):
        self.write_events(event('PermissionRequest', tool_name='Bash', tool_input={'command': 'rm -rf x'}))
        sut = classify(self.events, 0, self.status)
        self.assertEqual((sut['verdict'], sut['detail']), ('PERMISSION', 'Bash'))

    def test_given_events_when_classified_then_index_names_last_event(self):
        self.write_events(event('SessionStart', source='clear'), event('Stop', last_assistant_message='q?', background_tasks=[]))
        sut = classify(self.events, 0, self.status)
        self.assertEqual(sut['index'], 2)


class AnsweredPermissionTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.events = os.path.join(self.dir, 'events.jsonl')
        with open(self.events, 'w') as f:
            f.write(event('PermissionRequest', tool_name='EnterWorktree') + '\n')

    def test_given_permission_request_and_no_waiting_flag_when_classified_then_running(self):
        sut = classify(self.events, 0, os.path.join(self.dir, 'none'), waiting='')
        self.assertEqual(sut['verdict'], 'RUNNING')

    def test_given_permission_request_and_a_waiting_flag_when_classified_then_permission(self):
        sut = classify(self.events, 0, os.path.join(self.dir, 'none'), waiting='permission prompt')
        self.assertEqual(sut['verdict'], 'PERMISSION')


if __name__ == '__main__':
    unittest.main()
