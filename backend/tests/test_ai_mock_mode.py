"""AI mock-mode and anti-fabrication tests (TEST_CASES.md §8).

These cover the project's core design principle: the platform must run fully offline with
no API keys, and it must NEVER invent a score or a transcript when the model is
unavailable — it flags for manual review or raises instead.

No database is touched: only the AI service classes are exercised.
"""

import pytest

from app.config.config import Config
from app.ai.mixtral.mixtral_service import MixtralService
from app.ai.whisper.whisper_service import WhisperService, TranscriptionError


# --------------------------------------------------------------------------- mock mode

def test_services_report_not_configured_in_mock_mode():
    """covers TC-AI-001 — with AI_MODE=mock and no keys, no provider is considered live."""
    assert MixtralService.is_configured() is False
    assert WhisperService.is_configured() is False


# ------------------------------------------------------------------ domain classification

def test_known_technical_role_is_accepted():
    """covers TC-AI-002 (technical half) — a preset role short-circuits the LLM entirely."""
    result = MixtralService.classify_domain('Software Engineer')

    assert result['is_technical'] is True
    assert result['confidence'] == 100
    assert result['source'] == 'preset'


@pytest.mark.parametrize('domain', ['Dentistry', 'Medicine', 'Lawyer', 'Nursing', 'Pharmacy'])
def test_non_technical_field_is_rejected_offline(domain):
    """covers TC-AI-002 (non-technical half) — the offline keyword list blocks known
    non-technical FIELDS without any model call."""
    result = MixtralService.classify_domain(domain)

    assert result['is_technical'] is False
    assert result['confidence'] == 75
    assert result['source'] == 'fallback'


@pytest.mark.parametrize('domain', ['Dentistry', 'Medicine', 'Lawyer'])
def test_rejected_domain_confidence_clears_the_blocking_threshold(domain):
    """covers TC-INT-006 — /start only blocks at confidence >= 50, so 75 must block."""
    result = MixtralService.classify_domain(domain)

    assert result['is_technical'] is False
    assert result['confidence'] >= 50


@pytest.mark.parametrize('job_title', ['Dentist', 'Doctor', 'Nurse', 'Chef'])
def test_offline_fallback_does_not_catch_job_title_forms(job_title):
    """FINDING F1 (documented, not a fix) — the offline keyword list holds FIELD names
    ('dentistry', 'medicine', 'nursing') but not the JOB-TITLE forms candidates actually
    type ('Dentist', 'Doctor', 'Nurse').

    Those fall through to the best-effort branch at confidence 40, which is BELOW the
    50-point bar /start uses — so with the LLM unavailable these are let through. The live
    LLM path classifies them correctly; only the offline fallback has this gap.

    This test pins the CURRENT behaviour so the gap is visible and any future fix is a
    deliberate, reviewed change rather than a silent one.
    """
    result = MixtralService.classify_domain(job_title)

    assert result['is_technical'] is True
    assert result['confidence'] == 40
    assert result['confidence'] < 50  # i.e. /start will NOT block this


def test_classification_is_deterministic():
    """covers TC-AI-003 — repeated calls in mock mode must not vary."""
    results = [MixtralService.classify_domain('Dentist') for _ in range(5)]

    assert all(r == results[0] for r in results)


def test_empty_domain_is_rejected_with_full_confidence():
    """covers TC-AI-004."""
    result = MixtralService.classify_domain('')

    assert result['is_technical'] is False
    assert result['confidence'] == 100
    assert result['source'] == 'fallback'


def test_unknown_domain_is_allowed_as_best_effort():
    """covers TC-INT-009 / TC-AI-002 — an unrecognised domain passes with low confidence,
    which stays under the 50-point bar /start uses to block."""
    result = MixtralService.classify_domain('Quantum Widget Tuner')

    assert result['is_technical'] is True
    assert result['confidence'] < 50


# -------------------------------------------------------------------- question generation

def test_mock_question_generation_returns_the_requested_count():
    """covers TC-AI-005 / TC-INT-011."""
    questions = MixtralService.generate_questions(
        interview_type='technical',
        job_role='Software Engineer',
        experience_level='Entry',
        difficulty='Medium',
        num_questions=5,
    )

    assert len(questions) == 5
    for q in questions:
        assert q['question_text'].strip()
        assert q['question_type'] in MixtralService.ALLOWED_QUESTION_TYPES


def test_mock_question_generation_is_stable_in_shape_but_not_in_order():
    """FINDING F2 (documented, not a fix) — PROJECT_SUMMARY.md calls the mock question
    bank 'deterministic', but `generate_questions` calls `random.shuffle` on the pool, so
    the SELECTION and ORDER vary between runs.

    What is actually guaranteed — and what this test pins — is the shape: the requested
    count, non-empty text, and a recognised question type every time. Tests must therefore
    never assert an exact question list.
    """
    kwargs = dict(
        interview_type='technical',
        job_role='Software Engineer',
        experience_level='Entry',
        difficulty='Medium',
        num_questions=5,
    )

    runs = [MixtralService.generate_questions(**kwargs) for _ in range(5)]

    for questions in runs:
        assert len(questions) == 5
        for q in questions:
            assert q['question_text'].strip()
            assert q['question_type'] in MixtralService.ALLOWED_QUESTION_TYPES


def test_mock_question_generation_never_repeats_a_question_within_a_session():
    """covers TC-AI-005 / TC-INT-011 — a candidate must not be asked the same thing twice."""
    questions = MixtralService.generate_questions(
        interview_type='technical',
        job_role='Software Engineer',
        experience_level='Entry',
        difficulty='Medium',
        num_questions=5,
    )

    texts = [q['question_text'] for q in questions]
    assert len(set(texts)) == len(texts)


# ---------------------------------------------------------- difficulty range filtering

def test_allowed_difficulties_never_empties_an_untagged_pool():
    """Every question in the mock library predates per-question difficulty tagging, so it
    carries no tag and must stay eligible under ANY range — a range must never make the
    offline fallback come up short."""
    questions = MixtralService._generate_mock_questions(
        'technical', 'React Developer', 'Entry', 'Medium', 5, None,
        allowed_difficulties=['Medium', 'Hard'],
    )

    assert len(questions) == 5
    for q in questions:
        assert q['question_text'].strip()


def test_allowed_difficulties_filters_a_known_hard_tagged_entry():
    """A react question tagged 'Hard' in the shipped bank must never surface when the range
    excludes Hard. Runs enough trials that random selection would very likely have picked it
    at least once if the filter were not actually applied."""
    hard_snippet = "Explain React's Fiber architecture and how time-slicing lets concurrent rendering interrupt a render pass."

    seen = False
    for _ in range(60):
        qs = MixtralService._generate_mock_questions(
            'technical', 'React Developer', 'Entry', 'Medium', 3, None,
            allowed_difficulties=['Easy', 'Medium'],
        )
        if any(hard_snippet in q['question_text'] for q in qs):
            seen = True
            break
    assert not seen

def test_empty_answer_scores_zero_without_a_model_call():
    """covers TC-AI-006 — a genuinely empty answer is a confident 0, not a review flag."""
    result = MixtralService.evaluate_response('Explain indexing.', '')

    assert result['score'] == 0.0
    assert result['technical_score'] == 0.0
    assert result['communication_score'] == 0.0
    assert result['confidence_score'] == 100.0
    assert result['needs_manual_review'] is False


def test_failed_evaluation_never_fabricates_a_score():
    """covers TC-AI-007 — THE core anti-fabrication rule.

    When the model is unavailable the fallback must flag for manual review, report zero
    confidence, and say plainly that its placeholder is not final.
    """
    result = MixtralService._fallback_evaluation()

    assert result['needs_manual_review'] is True
    assert result['confidence_score'] == 0.0
    assert 'not final' in result['feedback'].lower()
    assert 'manual review' in result['feedback'].lower()


def test_low_confidence_is_flagged_for_manual_review():
    """covers TC-AI-008."""
    result = MixtralService._normalize_evaluation({'score': 70, 'confidence_score': 39})

    assert result['needs_manual_review'] is True


@pytest.mark.parametrize('confidence,expected_flag', [(39, True), (40, False)])
def test_manual_review_threshold_is_exactly_forty(confidence, expected_flag):
    """covers TC-AI-009 — the boundary must be < 40, not <= 40."""
    result = MixtralService._normalize_evaluation({'score': 70, 'confidence_score': confidence})

    assert result['needs_manual_review'] is expected_flag


@pytest.mark.parametrize('raw', [-20, 250])
def test_scores_are_clamped_to_zero_hundred(raw):
    """covers TC-AI-010 — a misbehaving model must never produce an out-of-range score."""
    result = MixtralService._normalize_evaluation({
        'score': raw,
        'technical_score': raw,
        'communication_score': raw,
        'confidence_score': raw,
    })

    for key in ('score', 'technical_score', 'communication_score', 'confidence_score'):
        assert 0.0 <= result[key] <= 100.0


def test_evaluation_always_carries_a_rationale():
    """covers TC-AI-007 — a scored answer is never returned without an explanation."""
    result = MixtralService._normalize_evaluation({'score': 70, 'confidence_score': 80})

    assert result['feedback'].strip()


# ------------------------------------------------------------------------- transcription

def test_whisper_returns_a_simulated_transcript_in_mock_mode():
    """covers TC-AI-011 — offline transcription works and needs no audio file on disk."""
    transcript = WhisperService.transcribe('/nonexistent/audio.webm', 'Explain indexing.')

    assert isinstance(transcript, str)
    assert transcript.strip()


def test_whisper_raises_rather_than_fabricating_in_live_mode():
    """covers TC-AI-012 — THE core anti-fabrication rule for speech-to-text.

    With a real key configured and the audio missing, it must raise; returning invented
    text here would silently put words in a candidate's mouth.
    """
    Config.AI_MODE = 'api'
    Config.WHISPER_API_KEY = 'test-key-not-used-for-a-real-call'

    with pytest.raises(TranscriptionError):
        WhisperService.transcribe('/nonexistent/audio.webm', 'Explain indexing.')
