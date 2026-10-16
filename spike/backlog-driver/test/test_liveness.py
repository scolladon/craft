import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from liveness import liveness  # noqa: E402


def listing(*sessions):
    return json.dumps(list(sessions))


def alive_pids(*pids):
    return lambda pid: pid in pids


class LivenessTest(unittest.TestCase):
    def test_given_listed_session_with_running_pid_when_judged_then_alive(self):
        sut = liveness(listing({'id': 'abc', 'pid': 7, 'state': 'working'}), 'abc', alive_pids(7))
        self.assertEqual(sut, 'alive')

    def test_given_session_absent_from_listing_when_judged_then_unknown(self):
        sut = liveness(listing({'id': 'other', 'pid': 7}), 'abc', alive_pids(7))
        self.assertEqual(sut, 'unknown')

    def test_given_unparseable_listing_when_judged_then_unknown(self):
        sut = liveness('warning: something\n[', 'abc', alive_pids())
        self.assertEqual(sut, 'unknown')

    def test_given_listed_session_without_pid_when_judged_then_dead(self):
        sut = liveness(listing({'id': 'abc', 'pid': None, 'state': 'working'}), 'abc', alive_pids())
        self.assertEqual(sut, 'dead')

    def test_given_listed_pid_that_no_longer_runs_when_judged_then_dead(self):
        sut = liveness(listing({'id': 'abc', 'pid': 7, 'state': 'working'}), 'abc', alive_pids())
        self.assertEqual(sut, 'dead')

    def test_given_stopped_session_when_judged_then_dead(self):
        sut = liveness(listing({'id': 'abc', 'pid': None, 'state': 'stopped'}), 'abc', alive_pids())
        self.assertEqual(sut, 'dead')


if __name__ == '__main__':
    unittest.main()
