"""Company-level "Interview Access" control (curriculum feature, Phase 2):
Company.allowed_interview_types and app.utils.curriculum.company_allows_category, plus the
Bulk Email Module row validation that is the real enforcement point.

Mirrors the User.permissions feature's own null-means-unrestricted contract exactly:
NULL is "no restriction ever set" (every company that existed before this column keeps full
access), and only a company a super admin explicitly narrows — even to an empty list — is
ever refused a category.
"""

import pytest

from app.models import Company
from app.utils.curriculum import company_allows_category


# --------------------------------------------------------------------------- Company model

class TestCompanyAllowedInterviewTypes:
    def test_a_fresh_company_has_no_restriction(self):
        c = Company(name='Acme', slug='acme')
        assert c.allowed_interview_types_list() is None

    def test_setting_none_clears_any_restriction(self):
        c = Company(name='Acme', slug='acme')
        c.set_allowed_interview_types(['AI & Data Science'])
        c.set_allowed_interview_types(None)
        assert c.allowed_interview_types_list() is None

    def test_an_explicit_empty_list_is_not_none(self):
        c = Company(name='Acme', slug='acme')
        c.set_allowed_interview_types([])
        assert c.allowed_interview_types_list() == []

    def test_allows_interview_type_true_when_unrestricted(self):
        c = Company(name='Acme', slug='acme')
        assert c.allows_interview_type('AI & Data Science')
        assert c.allows_interview_type('anything at all')

    def test_allows_interview_type_checks_the_list_once_restricted(self):
        c = Company(name='Acme', slug='acme')
        c.set_allowed_interview_types(['AI & Data Science', 'Cloud & Data Engineering'])
        assert c.allows_interview_type('AI & Data Science')
        assert not c.allows_interview_type('UI/UX Design With AI')

    def test_zero_allowed_types_means_zero(self):
        c = Company(name='Acme', slug='acme')
        c.set_allowed_interview_types([])
        assert not c.allows_interview_type('AI & Data Science')

    def test_a_corrupted_blob_fails_closed_to_zero_not_unrestricted(self):
        c = Company(name='Acme', slug='acme')
        c.allowed_interview_types = '{not valid json'
        assert c.allowed_interview_types_list() == []
        assert not c.allows_interview_type('AI & Data Science')


# --------------------------------------------------------------------------- helper function

class TestCompanyAllowsCategory:
    def test_no_company_id_is_unrestricted(self):
        """A candidate/row with no company yet (legacy unassigned, or a batch that hasn't
        resolved one) must not be blocked by a restriction that cannot even apply to it."""
        assert company_allows_category(None, 'AI & Data Science')
        assert company_allows_category(0, 'AI & Data Science')

    def test_an_unknown_company_id_is_unrestricted(self, monkeypatch):
        monkeypatch.setattr(Company, 'query', type('Q', (), {'get': staticmethod(lambda _id: None)})())
        assert company_allows_category(999999, 'AI & Data Science')

    def test_delegates_to_the_companys_own_check(self, monkeypatch):
        fake = Company(name='Acme', slug='acme')
        fake.set_allowed_interview_types(['AI & Data Science'])
        monkeypatch.setattr(Company, 'query', type('Q', (), {'get': staticmethod(lambda _id: fake)})())
        assert company_allows_category(1, 'AI & Data Science')
        assert not company_allows_category(1, 'Cloud & Data Engineering')


# --------------------------------------------------------------------------- bulk email row

class _NoExistingAccounts:
    def filter_by(self, **kwargs):
        return self

    def first(self):
        return None


class TestBulkRowRespectsCompanyAccess:
    def test_no_company_id_passed_through_is_unrestricted(self, monkeypatch):
        """The existing behavior (no company resolved, e.g. a single-company system with no
        Company rows at all) must be completely unaffected — company_id=None is the default
        and every existing caller that never passed one keeps working exactly as before."""
        from app.models import User
        from app.routes.bulk_email_routes import _validate_row

        monkeypatch.setattr(User, 'query', _NoExistingAccounts())
        raw = {
            'name': 'Ali Khan', 'email': 'access.none@example.com',
            'cnic': '42101-1234567-1', 'category': 'AI & Data Science', 'course_status': 'completed',
        }
        normalized, errors = _validate_row(raw, set(), set())
        assert errors == []
        assert normalized['category'] == 'AI & Data Science'

    def test_a_disallowed_category_is_rejected_with_company_id(self, monkeypatch):
        from app.models import User
        from app.routes.bulk_email_routes import _validate_row

        monkeypatch.setattr(User, 'query', _NoExistingAccounts())
        restricted = Company(name='Acme', slug='acme')
        restricted.set_allowed_interview_types(['Cloud & Data Engineering'])
        monkeypatch.setattr(Company, 'query', type('Q', (), {'get': staticmethod(lambda _id: restricted)})())

        raw = {
            'name': 'Ali Khan', 'email': 'access.blocked@example.com',
            'cnic': '42101-1234567-1', 'category': 'AI & Data Science', 'course_status': 'completed',
        }
        normalized, errors = _validate_row(raw, set(), set(), company_id=1)
        assert normalized is None
        assert any('not enabled for your company' in e for e in errors)

    def test_an_allowed_category_still_passes_with_company_id(self, monkeypatch):
        from app.models import User
        from app.routes.bulk_email_routes import _validate_row

        monkeypatch.setattr(User, 'query', _NoExistingAccounts())
        restricted = Company(name='Acme', slug='acme')
        restricted.set_allowed_interview_types(['AI & Data Science'])
        monkeypatch.setattr(Company, 'query', type('Q', (), {'get': staticmethod(lambda _id: restricted)})())

        raw = {
            'name': 'Ali Khan', 'email': 'access.allowed@example.com',
            'cnic': '42101-1234567-1', 'category': 'AI & Data Science', 'course_status': 'completed',
        }
        normalized, errors = _validate_row(raw, set(), set(), company_id=1)
        assert errors == []
        assert normalized['category'] == 'AI & Data Science'

    def test_instructor_can_still_be_individually_disallowed(self, monkeypatch):
        """Interview access covers the whole SIGNUP_CATEGORIES list, not just the 5
        curriculum tracks — a company can be restricted from Instructor invites too."""
        from app.models import User
        from app.routes.bulk_email_routes import _validate_row

        monkeypatch.setattr(User, 'query', _NoExistingAccounts())
        restricted = Company(name='Acme', slug='acme')
        restricted.set_allowed_interview_types(['AI & Data Science'])
        monkeypatch.setattr(Company, 'query', type('Q', (), {'get': staticmethod(lambda _id: restricted)})())

        raw = {
            'name': 'Some Instructor', 'email': 'access.instructor@example.com',
            'cnic': '42101-7654321-1', 'category': 'Instructor',
        }
        normalized, errors = _validate_row(raw, set(), set(), company_id=1)
        assert normalized is None
        assert any('not enabled for your company' in e for e in errors)
