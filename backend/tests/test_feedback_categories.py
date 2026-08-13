"""Guards on the per-category ratings attached to post-interview feedback.

The scores arrive as a JSON object of {category_key: 1-5} from the thank-you screen and are
stored in one column. The admin dashboard reads that object back to draw a star row per
category, so anything unrecognised that got stored would surface as a category no UI has a
label for. These tests pin the sanitising, and the round trip back out through to_dict.

No database: Feedback is exercised as a plain object, which is all the JSON handling needs.
"""

import json

import pytest

from app.models import Feedback
from app.routes.feedback_routes import CATEGORY_KEYS, _clean_category_ratings


class TestCleanCategoryRatings:
    def test_keeps_known_categories_with_valid_scores(self):
        cleaned = _clean_category_ratings({'questions': 4, 'proctoring': 1, 'platform': 5})
        assert cleaned == {'questions': 4, 'proctoring': 1, 'platform': 5}

    def test_drops_unknown_categories_but_keeps_the_rest(self):
        # A stale or tampered client must not cost the candidate their whole submission.
        cleaned = _clean_category_ratings({'questions': 5, 'not_a_category': 3})
        assert cleaned == {'questions': 5}

    @pytest.mark.parametrize('score', [0, 6, -1, 99])
    def test_drops_out_of_range_scores(self, score):
        assert _clean_category_ratings({'questions': score}) is None

    @pytest.mark.parametrize('score', [None, 'four', [], {}])
    def test_drops_non_numeric_scores(self, score):
        assert _clean_category_ratings({'questions': score}) is None

    def test_accepts_numeric_strings(self):
        # <select> and some form serialisers hand back strings; the score is still valid.
        assert _clean_category_ratings({'questions': '4'}) == {'questions': 4}

    @pytest.mark.parametrize('raw', [None, {}, 'nope', [], 5])
    def test_returns_none_for_anything_unusable(self, raw):
        # None, not {} — "no categories rated" should leave the column NULL rather than
        # storing an empty object that reads as a deliberate blank.
        assert _clean_category_ratings(raw) is None

    def test_every_advertised_category_survives(self):
        # The frontend's FEEDBACK_CATEGORIES keys must all be accepted here; a key renamed
        # on one side only would be silently dropped on submit.
        submitted = {key: 3 for key in CATEGORY_KEYS}
        assert _clean_category_ratings(submitted) == submitted


class TestFeedbackToDict:
    def test_decodes_stored_categories(self):
        f = Feedback(user_id=1, rating=4, category_ratings=json.dumps({'questions': 4}))
        assert f.to_dict()['category_ratings'] == {'questions': 4}

    def test_missing_categories_read_as_empty(self):
        # Feedback left through the report page, and everything predating categories.
        f = Feedback(user_id=1, rating=4, category_ratings=None)
        assert f.to_dict()['category_ratings'] == {}

    def test_malformed_blob_does_not_raise(self):
        # One corrupt row must not take down the whole admin feedback list.
        f = Feedback(user_id=1, rating=4, category_ratings='{not json')
        assert f.to_dict()['category_ratings'] == {}
