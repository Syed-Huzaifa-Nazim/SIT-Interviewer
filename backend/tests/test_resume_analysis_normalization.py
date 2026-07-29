"""Regression tests for the blank-screen bug on the Resume & JD Analyzer.

THE BUG
-------
`extracted_skills` (and its sibling list fields) are persisted into TEXT columns, and the
client calls JSON.parse() on them. The mock path already json.dumps()'d those fields, but
the live-LLM path returned real Python lists which were written to the column raw. Read
back, they became a str(list) — "['React', 'Node']", single-quoted — which is NOT valid
JSON, so JSON.parse threw DURING RENDER and React unmounted the tree: a blank/black page.

The fix normalises every list field to a JSON string inside the service, so the mock and
live paths are byte-compatible. These tests pin that guarantee.
"""

import json

import pytest

from app.ai.mixtral.mixtral_service import MixtralService


LIST_FIELDS = [
    'extracted_skills',
    'extracted_experience',
    'extracted_education',
    'missing_skills',
    'suggestions',
]


def _llm_style_result():
    """What the live LLM actually returns: real Python lists, not JSON strings."""
    return {
        'extracted_skills': ['React', 'Node'],
        'extracted_experience': ['Built a thing'],
        'extracted_education': ['BS Computer Science'],
        'missing_skills': ['Docker'],
        'resume_score': 82,
        'suggestions': ['Add metrics'],
    }


@pytest.mark.parametrize('field', LIST_FIELDS)
def test_live_llm_lists_become_json_strings(field):
    """The regression itself — a Python list must not reach the database as a list."""
    result = MixtralService._normalize_resume_analysis(_llm_style_result())

    assert isinstance(result[field], str)
    assert isinstance(json.loads(result[field]), list)  # i.e. JSON.parse would succeed


@pytest.mark.parametrize('field', LIST_FIELDS)
def test_normalized_output_is_valid_json_the_client_can_parse(field):
    """The client does JSON.parse on these; anything that fails here blanks the page."""
    result = MixtralService._normalize_resume_analysis(_llm_style_result())

    json.loads(result[field])  # raises if the bug is back


def test_list_contents_survive_normalization():
    """Normalising must not quietly drop the candidate's actual skills."""
    result = MixtralService._normalize_resume_analysis(_llm_style_result())

    assert json.loads(result['extracted_skills']) == ['React', 'Node']


def test_already_json_string_is_left_parseable():
    """The mock path already sends JSON strings — it must not get double-encoded."""
    result = MixtralService._normalize_resume_analysis({
        'extracted_skills': json.dumps(['React']),
        'resume_score': 70,
        'suggestions': json.dumps(['Add metrics']),
    })

    assert json.loads(result['extracted_skills']) == ['React']


def test_plain_text_is_wrapped_as_a_single_item_list():
    """A model that answers with prose instead of a list must still render."""
    result = MixtralService._normalize_resume_analysis({
        'extracted_skills': 'React and Node',
        'resume_score': 70,
        'suggestions': 'Add metrics',
    })

    assert json.loads(result['extracted_skills']) == ['React and Node']


@pytest.mark.parametrize('field', LIST_FIELDS)
def test_missing_field_becomes_an_empty_list(field):
    """An omitted key must become '[]', never null — the client maps over the result."""
    payload = {'resume_score': 70}
    result = MixtralService._normalize_resume_analysis(payload)

    assert json.loads(result[field]) == []


def test_none_value_becomes_an_empty_list():
    """covers the null case explicitly — JSON.parse(null) would throw on the client."""
    result = MixtralService._normalize_resume_analysis({
        'extracted_skills': None,
        'resume_score': 70,
    })

    assert json.loads(result['extracted_skills']) == []


def test_non_string_list_entries_are_stringified():
    """A model returning numbers/objects in the list must not break JSON round-tripping."""
    result = MixtralService._normalize_resume_analysis({
        'extracted_skills': ['React', 5, None],
        'resume_score': 70,
    })

    assert json.loads(result['extracted_skills']) == ['React', '5', 'None']


@pytest.mark.parametrize('raw,expected', [(150, 100), (-10, 0), ('88', 88), ('abc', 0), (None, 0)])
def test_resume_score_is_coerced_into_range(raw, expected):
    """The score drives a percentage-width bar; out-of-range values break the layout."""
    result = MixtralService._normalize_resume_analysis({
        'extracted_skills': ['React'],
        'resume_score': raw,
    })

    assert result['resume_score'] == expected


def test_mock_and_live_paths_produce_the_same_field_types():
    """The two paths must be interchangeable — that mismatch WAS the bug."""
    mock_result = MixtralService._generate_mock_resume_analysis('React developer with Node')
    live_result = MixtralService._normalize_resume_analysis(_llm_style_result())

    for field in LIST_FIELDS:
        assert type(mock_result[field]) is type(live_result[field])
        assert isinstance(json.loads(mock_result[field]), list)
        assert isinstance(json.loads(live_result[field]), list)
