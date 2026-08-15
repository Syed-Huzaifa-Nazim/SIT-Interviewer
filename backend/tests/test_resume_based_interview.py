"""The Resume-Based Interview category (Resume §1-§5).

This category is the only one whose questions are generated from a per-candidate document
rather than a fixed domain, which gives it two failure modes nothing else here has:

  1. The generator can drift off the resume and ask about things the candidate never wrote
     down, while the traceability field still claims otherwise.
  2. The account can end up in a state where no interview can ever be produced — no course
     status, no domain, and nothing to build questions from.

These tests pin both, plus the parsing guards on the one endpoint a stranger can reach.
No database: the suite's conftest blocks real connections, and everything below is pure.
"""

import json

import pytest
from fastapi import HTTPException

from app.ai.mixtral.mixtral_service import MixtralService
from app.coding.problem_bank import pick_opening_problem
from app.routes.interview_routes import _resume_profile_from
from app.utils.candidate import (
    RESUME_CATEGORY,
    SIGNUP_CATEGORIES,
    CATEGORY_JOB_ROLES,
    is_resume_category,
    requires_course_status,
)
from app.utils.resume_text import (
    MAX_RESUME_BYTES,
    extract_resume_text,
    looks_like_a_resume,
)


RESUME_PROFILE = {
    'skills': ['React', 'PostgreSQL', 'Docker'],
    'projects': [
        'MediTrack - clinic appointment booking, Django and Postgres',
        'Chatly - realtime chat on React and Socket.IO',
    ],
    'experience': ['Intern at ACME'],
}


# --------------------------------------------------------------------- the category itself

def test_the_category_is_selectable_at_signup():
    assert RESUME_CATEGORY in SIGNUP_CATEGORIES


def test_the_category_has_no_course_status():
    """The enrolment form skips the field, so every backend guard must agree it is not
    applicable — one that still demanded 'completed' would make these accounts un-invitable."""
    assert requires_course_status(RESUME_CATEGORY) is False
    assert is_resume_category(RESUME_CATEGORY)


def test_course_categories_still_require_a_status():
    """The statusless exemption must not have leaked onto the real courses."""
    for category in ('AI', 'Cloud & Data Engineering', 'Web and Mobile App Development'):
        assert requires_course_status(category) is True


def test_the_category_has_a_job_role_for_session_creation():
    """start_interview creates the Interview row under this label. A missing entry would
    silently fall back to a default and make the session's role field meaningless."""
    assert CATEGORY_JOB_ROLES.get(RESUME_CATEGORY)


# ------------------------------------------------------------------------- traceability

def test_a_question_traces_back_to_a_real_resume_entry():
    anchors = MixtralService._resume_anchors(RESUME_PROFILE)
    assert MixtralService._verify_derived_from('PostgreSQL', anchors) == 'PostgreSQL'


def test_a_near_miss_still_counts_as_traceable():
    """The model paraphrases. 'React.js' against a resume that says 'React' is the generator
    working correctly, and rejecting it would flood the Admin Hub with false warnings."""
    anchors = MixtralService._resume_anchors(RESUME_PROFILE)
    assert MixtralService._verify_derived_from('React.js', anchors) == 'React'


def test_an_invented_topic_is_not_reported_as_traceable():
    """THE POINT OF THE FIELD. A generator that drifted onto Kubernetes — which appears
    nowhere on this resume — must not hand back a derived_from that looks legitimate."""
    anchors = MixtralService._resume_anchors(RESUME_PROFILE)
    assert MixtralService._verify_derived_from('Kubernetes', anchors) is None


def test_an_empty_claim_is_not_traceable():
    anchors = MixtralService._resume_anchors(RESUME_PROFILE)
    assert MixtralService._verify_derived_from('', anchors) is None
    assert MixtralService._verify_derived_from(None, anchors) is None


def test_longer_anchors_win_over_shorter_ones():
    """'React Native' must not be credited to a resume that only says 'React'."""
    profile = {'skills': ['React', 'React Native'], 'projects': []}
    anchors = MixtralService._resume_anchors(profile)
    assert MixtralService._verify_derived_from('React Native', anchors) == 'React Native'


# --------------------------------------------------------------- offline question generation

def test_offline_questions_come_from_the_candidates_own_resume():
    """AI_MODE=mock must still produce an interview about THIS candidate. Generic filler
    would make the whole category pointless exactly when the model is unavailable."""
    questions = MixtralService._generate_mock_resume_questions(RESUME_PROFILE, 5)

    assert len(questions) == 5
    anchors = MixtralService._resume_anchors(RESUME_PROFILE)
    for q in questions:
        assert q['derived_from'] in anchors, q
        assert q['question_text'].strip()


def test_offline_questions_are_weighted_towards_projects():
    questions = MixtralService._generate_mock_resume_questions(RESUME_PROFILE, 6)
    projects = set(RESUME_PROFILE['projects'])
    from_projects = sum(1 for q in questions if q['derived_from'] in projects)
    assert from_projects >= len(questions) // 2


def test_offline_questions_are_deterministic():
    """Every other AI_MODE=mock path here is reproducible; this one must be too."""
    first = MixtralService._generate_mock_resume_questions(RESUME_PROFILE, 5)
    second = MixtralService._generate_mock_resume_questions(RESUME_PROFILE, 5)
    assert first == second


def test_offline_questions_are_numbered_in_order():
    questions = MixtralService._generate_mock_resume_questions(RESUME_PROFILE, 4)
    assert [q['order_num'] for q in questions] == [1, 2, 3, 4]


def test_offline_questions_use_only_allowed_types():
    """An unrecognised type would get no timer budget and would not score correctly."""
    questions = MixtralService._generate_mock_resume_questions(RESUME_PROFILE, 6)
    for q in questions:
        assert q['question_type'] in MixtralService.ALLOWED_QUESTION_TYPES, q


def test_a_resume_with_only_skills_still_produces_an_interview():
    questions = MixtralService._generate_mock_resume_questions(
        {'skills': ['Python'], 'projects': []}, 3
    )
    assert len(questions) == 3
    assert all(q['derived_from'] == 'Python' for q in questions)


def test_generate_questions_takes_the_resume_path_when_given_a_profile():
    """The routing decision itself: a profile must not fall through to the domain path."""
    questions = MixtralService.generate_questions(
        interview_type='resume_based', job_role='Software Engineer',
        experience_level='Entry', difficulty='Medium', num_questions=5,
        resume_profile=RESUME_PROFILE,
    )
    anchors = MixtralService._resume_anchors(RESUME_PROFILE)
    assert questions and all(q.get('derived_from') in anchors for q in questions)


def test_generate_questions_ignores_an_empty_profile():
    """An empty profile must not silently produce a resume-shaped interview with nothing
    behind it — it falls through to the normal domain path."""
    questions = MixtralService.generate_questions(
        interview_type='technical', job_role='AI Engineer',
        experience_level='Entry', difficulty='Medium', num_questions=3,
        resume_profile={'skills': [], 'projects': []},
    )
    assert questions
    assert all(not q.get('derived_from') for q in questions)


# ------------------------------------------------------------------------ resume extraction

def test_projects_are_extracted_as_their_own_list():
    """Blended into the experience bullets they cannot be asked about individually."""
    analysis = MixtralService._generate_mock_resume_analysis(
        "Skills\nPython\n\nProjects\n- MediTrack: clinic booking, Django\n\nExperience\nACME"
    )
    assert 'extracted_projects' in analysis
    # Every list field leaves the service as a JSON string or the client's JSON.parse throws.
    assert json.loads(analysis['extracted_projects']) == [
        'MediTrack: clinic booking, Django'
    ]


def test_the_projects_section_is_read_from_the_document():
    text = (
        "Jane\n\nProjects\n"
        "- MediTrack: clinic booking, Django and Postgres\n"
        "- Chatly: realtime chat, React\n"
        "\nExperience\n- Worked at ACME on unrelated things\n"
    )
    projects = MixtralService._scrape_project_lines(text)
    assert projects == [
        'MediTrack: clinic booking, Django and Postgres',
        'Chatly: realtime chat, React',
    ]


def test_scraping_stops_at_the_next_section():
    """Experience bullets swept in as projects would generate questions about the wrong
    thing entirely."""
    text = "Projects\n- Alpha: a real project\n\nEducation\n- BS Computer Science, 2019\n"
    assert MixtralService._scrape_project_lines(text) == ['Alpha: a real project']


def test_scraping_skips_bare_urls():
    text = "Projects\n- https://github.com/jane\n- Alpha: a real project\n"
    assert MixtralService._scrape_project_lines(text) == ['Alpha: a real project']


def test_a_resume_with_no_projects_section_scrapes_nothing():
    assert MixtralService._scrape_project_lines("Skills\nPython\n\nExperience\nACME") == []


# --------------------------------------------------------------- upload guards (public route)

def _resume_bytes(body=None):
    return (body or (
        "Jane Doe\nSummary\nEngineer\nSkills\nPython, React\n"
        "Experience\nBuilt things at ACME\nEducation\nBS Computer Science\n"
    )).encode('utf-8')


def test_a_valid_text_resume_is_accepted():
    text = extract_resume_text(_resume_bytes(), 'jane.txt')
    assert 'Jane Doe' in text


def test_an_unsupported_format_is_rejected():
    with pytest.raises(HTTPException) as exc:
        extract_resume_text(_resume_bytes(), 'jane.docx')
    assert exc.value.status_code == 400


def _oversized_resume_bytes():
    """Derived from the constant rather than hardcoded, so raising the cap cannot leave
    these two tests quietly asserting nothing."""
    header = b'Skills\nPython\nExperience\nACME\n'
    return header + b'filler line\n' * ((MAX_RESUME_BYTES // 12) + 1)


def test_an_oversized_upload_is_rejected():
    """The endpoint is unauthenticated and calls an LLM, so the cap has to bite before any
    parsing happens."""
    with pytest.raises(HTTPException) as exc:
        extract_resume_text(_oversized_resume_bytes(), 'huge.txt')
    assert exc.value.status_code == 400


def test_the_size_cap_is_not_applied_to_the_authenticated_analyzer():
    """The Resume & JD Analyzer never had a cap; quietly rejecting a CV that used to work
    would be a regression for its existing users."""
    big = _oversized_resume_bytes()
    assert len(big) > MAX_RESUME_BYTES
    assert extract_resume_text(big, 'big.txt', enforce_size_limit=False)


def test_a_document_that_is_not_a_resume_is_rejected():
    body = b'INVOICE 4471\nAmount due: 200\nPlease remit within 30 days.\n' * 4
    with pytest.raises(HTTPException) as exc:
        extract_resume_text(body, 'invoice.txt')
    assert exc.value.status_code == 400


def test_an_empty_extraction_is_rejected():
    with pytest.raises(HTTPException) as exc:
        extract_resume_text(b'hi', 'tiny.txt')
    assert exc.value.status_code == 400


def test_a_cv_is_recognised_by_its_sections():
    assert looks_like_a_resume('Experience at ACME. Education: BS.')
    assert not looks_like_a_resume('The quick brown fox jumped over the lazy dog.')


# --------------------------------------------------------------------- profile read-back

def test_a_stored_analysis_becomes_a_usable_profile():
    class Row:
        extracted_skills = json.dumps(['React', 'SQL'])
        extracted_projects = json.dumps(['MediTrack - clinic booking'])
        extracted_experience = json.dumps(['Intern at ACME'])

    assert _resume_profile_from(Row()) == {
        'skills': ['React', 'SQL'],
        'projects': ['MediTrack - clinic booking'],
        'experience': ['Intern at ACME'],
    }


def test_a_missing_analysis_yields_no_profile():
    """start_interview refuses rather than charging a token for an interview it cannot
    build — a generic session would not be the thing the candidate signed up for."""
    assert _resume_profile_from(None) is None


def test_an_empty_analysis_yields_no_profile():
    class Row:
        extracted_skills = '[]'
        extracted_projects = None
        extracted_experience = '[]'

    assert _resume_profile_from(Row()) is None


def test_a_malformed_analysis_does_not_take_the_interview_down():
    """These are TEXT columns. A row written before list normalisation, or hand-edited,
    must read as empty rather than raising inside interview start."""
    class Row:
        extracted_skills = "['React']"   # str(list), not JSON
        extracted_projects = 'garbage{'
        extracted_experience = None

    assert _resume_profile_from(Row()) is None


def test_a_partially_malformed_analysis_keeps_what_parsed():
    class Row:
        extracted_skills = json.dumps(['React'])
        extracted_projects = 'garbage{'
        extracted_experience = None

    profile = _resume_profile_from(Row())
    assert profile['skills'] == ['React']
    assert profile['projects'] == []


# ------------------------------------------------------------------- coding-sandbox opener

def test_a_data_resume_opens_on_a_sql_problem():
    """These candidates never picked a domain, so their own skills are the only signal for
    whether a query exercise is the relevant opener."""
    problem = pick_opening_problem(
        job_role='Software Engineer', resume_skills=['SQL', 'PostgreSQL']
    )
    assert problem['id'].startswith('sql-')


def test_a_web_resume_does_not_open_on_a_sql_problem():
    problem = pick_opening_problem(
        job_role='Software Engineer', resume_skills=['React', 'Node']
    )
    assert not problem['id'].startswith('sql-')


def test_the_opener_is_unchanged_for_every_other_category():
    """Purely additive: passing no resume skills must behave exactly as before."""
    assert pick_opening_problem(
        job_role='Cloud & Data Engineer', course_category='Cloud & Data Engineering'
    )['id'].startswith('sql-')
    assert not pick_opening_problem(
        job_role='Web & Mobile App Developer',
        course_category='Web and Mobile App Development',
    )['id'].startswith('sql-')
