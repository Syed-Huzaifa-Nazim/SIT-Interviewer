"""Guards on the background recording assembler.

/finalize-video is issued by the candidate's browser, and for a one-time candidate it races
the forced logout that the same navigation triggers: the thank-you screen wipes the token
and revokes the session server-side while the assemble request is still downloading and
joining parts. It 401s, and its retries cannot recover because the token is already gone.
Ten interviews were found with every part uploaded and no assembled recording.

The sweeper removes the race by owning assembly server-side. What it must never do is
assemble something that is not finished — that would produce a truncated, unplayable file
out of a recording that was fine. These tests pin those refusals.

No database: the ORM entry points are stubbed, which is enough to exercise the decisions.
"""

import sys
import types
from unittest import mock

import pytest

import app.routes.interview_routes as ir


class FakeInterview:
    def __init__(self, status='completed', video_path=None):
        self.id = 190
        self.status = status
        self.video_path = video_path


@pytest.fixture
def rig(monkeypatch):
    """Wires the module's collaborators to fakes and records what got called."""
    calls = types.SimpleNamespace(assembled=[], committed=0, added=[])

    monkeypatch.setattr(
        ir.SupabaseService, 'list_interviews_with_pending_parts',
        staticmethod(lambda: [(255, 190)]),
    )

    def _assemble(user_id, interview_id):
        calls.assembled.append((user_id, interview_id))
        return f'supabase://interview-recordings/user_{user_id}_int_{interview_id}.webm'

    monkeypatch.setattr(ir.SupabaseService, 'assemble_interview_video', staticmethod(_assemble))

    session = mock.MagicMock()
    session.commit.side_effect = lambda: setattr(calls, 'committed', calls.committed + 1)
    session.add.side_effect = calls.added.append
    monkeypatch.setattr(ir.db, 'session', session)

    monkeypatch.setattr(ir.User, 'query', mock.MagicMock(get=lambda _id: None))

    # Default: comfortably under the storage limit, and nothing previously given up on.
    monkeypatch.setattr(ir.SupabaseService, 'pending_parts_total_bytes', staticmethod(lambda *_: 5 * 1024 * 1024))
    monkeypatch.setattr(ir.RecordingLog, 'query', mock.MagicMock(
        filter=mock.MagicMock(return_value=mock.MagicMock(first=lambda: None))
    ))
    return calls


def _with_interview(monkeypatch, interview, age_seconds):
    monkeypatch.setattr(ir.Interview, 'query', mock.MagicMock(get=lambda _id: interview))
    monkeypatch.setattr(
        ir.SupabaseService, 'newest_part_age_seconds',
        staticmethod(lambda *_: age_seconds),
    )


def test_assembles_a_finished_interview(rig, monkeypatch):
    interview = FakeInterview()
    _with_interview(monkeypatch, interview, ir.ASSEMBLY_QUIET_PERIOD_SECONDS + 1)

    ir.assemble_pending_recordings()

    assert rig.assembled == [(255, 190)]
    assert interview.video_path.startswith('supabase://')
    assert rig.committed == 1
    assert len(rig.added) == 1, 'a RecordingLog row should record the assembled recording'


def test_refuses_while_parts_are_still_arriving(rig, monkeypatch):
    """The whole point of the quiet period: joining mid-upload yields a truncated file."""
    _with_interview(monkeypatch, FakeInterview(), ir.ASSEMBLY_QUIET_PERIOD_SECONDS - 1)

    ir.assemble_pending_recordings()

    assert rig.assembled == []


def test_refuses_an_interview_that_is_still_running(rig, monkeypatch):
    _with_interview(monkeypatch, FakeInterview(status='active'), 9999)

    ir.assemble_pending_recordings()

    assert rig.assembled == []


def test_leaves_an_already_assembled_recording_alone(rig, monkeypatch):
    existing = 'supabase://interview-recordings/already.webm'
    interview = FakeInterview(video_path=existing)
    _with_interview(monkeypatch, interview, 9999)

    ir.assemble_pending_recordings()

    assert rig.assembled == []
    assert interview.video_path == existing


def test_ignores_parts_whose_interview_no_longer_exists(rig, monkeypatch):
    _with_interview(monkeypatch, None, 9999)

    ir.assemble_pending_recordings()

    assert rig.assembled == []


def test_a_failed_assembly_does_not_write_a_video_path(rig, monkeypatch):
    """assemble_interview_video keeps every part on failure, so the next sweep retries.
    Recording a path for a file that was never stored would break playback permanently."""
    interview = FakeInterview()
    _with_interview(monkeypatch, interview, 9999)
    monkeypatch.setattr(ir.SupabaseService, 'assemble_interview_video', staticmethod(lambda *_: None))

    ir.assemble_pending_recordings()

    assert interview.video_path is None
    assert rig.committed == 0


def test_one_bad_interview_does_not_stop_the_others(rig, monkeypatch):
    """A sweep is a batch: an exception on one session must not strand the rest."""
    monkeypatch.setattr(
        ir.SupabaseService, 'list_interviews_with_pending_parts',
        staticmethod(lambda: [(255, 190), (256, 191)]),
    )
    good = FakeInterview()
    good.id = 191

    def _get(interview_id):
        if interview_id == 190:
            raise RuntimeError('boom')
        return good

    monkeypatch.setattr(ir.Interview, 'query', mock.MagicMock(get=_get))
    monkeypatch.setattr(ir.SupabaseService, 'newest_part_age_seconds', staticmethod(lambda *_: 9999))

    ir.assemble_pending_recordings()

    assert rig.assembled == [(256, 191)]


def test_storage_being_unreachable_is_not_fatal(rig, monkeypatch):
    monkeypatch.setattr(
        ir.SupabaseService, 'list_interviews_with_pending_parts',
        staticmethod(mock.Mock(side_effect=OSError('storage down'))),
    )

    ir.assemble_pending_recordings()  # must not raise

    assert rig.assembled == []


def test_refuses_a_recording_larger_than_storage_accepts(rig, monkeypatch):
    """Supabase caps object size project-wide, so an over-limit join is refused with a 413
    only AFTER the whole file has been downloaded and assembled. Interview 176 (65.5 MB)
    hit exactly that. Checking the size first avoids the wasted transfer entirely."""
    interview = FakeInterview()
    _with_interview(monkeypatch, interview, 9999)
    monkeypatch.setattr(
        ir.SupabaseService, 'pending_parts_total_bytes',
        staticmethod(lambda *_: ir.Config.MAX_RECORDING_UPLOAD_BYTES + 1),
    )

    ir.assemble_pending_recordings()

    assert rig.assembled == [], 'must not download and join a file storage will reject'
    assert interview.video_path is None
    # The admin has to be able to see WHY there is no video for this interview.
    assert len(rig.added) == 1
    logged = rig.added[0]
    assert logged.status == 'failed'
    assert ir._TOO_LARGE_PREFIX in logged.error


def test_does_not_retry_a_recording_it_already_gave_up_on(rig, monkeypatch):
    """Without this the sweep re-downloads and re-joins the same oversized recording every
    five minutes forever, for a file that can never be stored."""
    _with_interview(monkeypatch, FakeInterview(), 9999)
    monkeypatch.setattr(ir.RecordingLog, 'query', mock.MagicMock(
        filter=mock.MagicMock(return_value=mock.MagicMock(first=lambda: object()))
    ))

    ir.assemble_pending_recordings()

    assert rig.assembled == []
    assert rig.added == [], 'the give-up marker should be written once, not on every sweep'


def test_worker_is_registered_at_startup():
    """A worker nobody starts fixes nothing."""
    from pathlib import Path
    src = (Path(ir.__file__).resolve().parent.parent / '__init__.py').read_text(encoding='utf-8')
    assert 'start_recording_assembly_worker()' in src
