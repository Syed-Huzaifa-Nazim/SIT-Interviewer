import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.ai.mixtral.mixtral_service import MixtralService
from app.utils.blockchain import questions_for_context
from app.utils.curriculum import curriculum_context_to_prompt_text, curriculum_slug_for_category, sandbox_eligible_category
from app.utils.interview_types import SMIT_SUFFIX

DATA = Path(__file__).resolve().parents[1] / 'data'
CATEGORY = 'Blockchain' + SMIT_SUFFIX

def context():
    course = json.loads((DATA / 'blockchain_curriculum.json').read_text())['courses'][0]
    return curriculum_context_to_prompt_text(dict(course_label=course['ui_label'], modules=[
        dict(name=m['module_name'], topics=m['topics_exposed_on_public_page']) for m in course['modules']]))

def test_registry_and_domain():
    assert curriculum_slug_for_category(CATEGORY) == 'blockchain'
    assert MixtralService.classify_domain('Blockchain Developer')['is_technical']
    assert not sandbox_eligible_category(CATEGORY)

def test_full_syllabus_has_questions_and_valid_mcqs():
    bank = json.loads((DATA / 'blockchain_questions.json').read_text())
    course = json.loads((DATA / 'blockchain_curriculum.json').read_text())['courses'][0]
    topics = {t for m in course['modules'] for t in m['topics_exposed_on_public_page']}
    assert {q['topic'] for q in bank} == topics
    for q in bank:
        assert q['question_text'].strip()
        assert len(set(q['mcq']['options'])) == 4
        assert 0 <= q['mcq']['correct_index'] < 4

def test_offline_questions_and_mcqs_stay_in_syllabus():
    ctx = context()
    bank = json.loads((DATA / 'blockchain_questions.json').read_text())
    questions = MixtralService.generate_questions('technical', 'Blockchain Developer', 'Entry', 'Medium', 10, curriculum_context=ctx)
    assert len(questions) == 10
    assert {q['question_text'] for q in questions} <= {q['question_text'] for q in bank}
    assert len({q['question_text'] for q in questions}) == 10
    mcqs = MixtralService.generate_mcqs('Blockchain Developer', 'Entry', 'Hard', curriculum_context=ctx)
    assert len(mcqs) == 10
    expected = {q['mcq']['question_text']: q['mcq']['options'][q['mcq']['correct_index']] for q in bank}
    for q in mcqs:
        assert q['options'][q['correct_index']] == expected[q['question_text']]

def test_blockchain_never_calls_ai_even_in_api_mode(monkeypatch):
    from app.config.config import Config
    monkeypatch.setattr(Config, 'AI_MODE', 'api')
    monkeypatch.setattr(Config, 'MIXTRAL_API_KEY', 'unused-test-key')
    llm = MagicMock(side_effect=AssertionError('Blockchain must not call AI'))
    monkeypatch.setattr(MixtralService, '_call_llm', llm)
    assert len(MixtralService.generate_questions('technical', 'Blockchain Developer', 'Entry', 'Medium', 5, curriculum_context=context())) == 5
    assert len(MixtralService.generate_mcqs('Blockchain Developer', 'Entry', 'Hard', curriculum_context=context())) == 10
    llm.assert_not_called()


def test_offline_bank_respects_active_db_topics():
    ctx = curriculum_context_to_prompt_text(dict(course_label='Blockchain', modules=[dict(name='Platforms', topics=['Solana'])]))
    bank = json.loads((DATA / 'blockchain_questions.json').read_text())
    expected = next(q['question_text'] for q in bank if q['topic'] == 'Solana')
    assert questions_for_context(ctx, 1)[0]['question_text'] == expected

def test_background_mcqs_receive_candidate_curriculum(monkeypatch):
    from app.routes import interview_routes as routes
    import app.utils.curriculum as curriculum
    questions = MagicMock()
    questions.filter_by.return_value.count.return_value = 0
    monkeypatch.setattr(routes, 'InterviewQuestion', MagicMock(query=questions))
    monkeypatch.setattr(routes, 'Interview', SimpleNamespace(query=SimpleNamespace(get=lambda _: SimpleNamespace(user_id=7))))
    monkeypatch.setattr(routes, 'User', SimpleNamespace(query=SimpleNamespace(get=lambda _: SimpleNamespace(course_category=CATEGORY))))
    monkeypatch.setattr(curriculum, 'build_curriculum_context', lambda _: dict(course_label='Blockchain', modules=[dict(name='Platforms', topics=['Solana'])]))
    generated = MagicMock(return_value=[dict(question_text='Solana?', options=['a','b','c','d'], correct_index=2)])
    monkeypatch.setattr(routes.MixtralService, 'generate_mcqs', generated)
    session = MagicMock()
    monkeypatch.setattr(routes, 'db', SimpleNamespace(session=session))
    routes._generate_and_save_mcqs(1, 'Blockchain Developer', 'Entry', 'Medium')
    assert 'Solana' in generated.call_args.kwargs['curriculum_context']
    session.add.assert_called_once()
    session.commit.assert_called_once()


def test_missing_curriculum_blocks_start_before_token_charge(monkeypatch):
    import pytest
    from fastapi import HTTPException
    from app.routes import interview_routes as routes
    import app.utils.curriculum as curriculum
    monkeypatch.setattr(routes, 'User', SimpleNamespace(query=SimpleNamespace(get=lambda _: SimpleNamespace(course_category=CATEGORY))))
    monkeypatch.setattr(curriculum, 'build_curriculum_context', lambda _: None)
    tokens = MagicMock()
    monkeypatch.setattr(routes, 'Token', tokens)
    with pytest.raises(HTTPException) as exc:
        routes.start_interview(dict(type='technical', job_role='Blockchain Developer', experience_level='Entry'), user_id=7)
    assert exc.value.status_code == 503
    tokens.query.filter_by.assert_not_called()


def test_other_courses_keep_their_existing_ai_generation(monkeypatch):
    llm = MagicMock(return_value=None)
    monkeypatch.setattr(MixtralService, '_call_llm', llm)
    MixtralService.generate_questions('technical', 'AI Engineer', 'Entry', 'Medium', 5,
        curriculum_context='Approved curriculum for AI & Data Science:\n- Python: Loops')
    assert llm.call_count == 1
    MixtralService.generate_mcqs('AI Engineer', 'Entry', 'Hard')
    assert llm.call_count == 2
