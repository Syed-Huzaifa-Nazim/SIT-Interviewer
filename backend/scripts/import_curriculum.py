"""One-time (and safely repeatable) import of the SMIT curriculum snapshot into the database.

WHAT THIS IS AND ISN'T
-----------------------
Reads ONE local JSON file (data/smit_curriculum_official_scrape.json — a verified snapshot
someone took of SMIT's public course pages) and upserts it into curriculum_courses /
curriculum_modules / curriculum_topics. It never makes a network request to the SMIT website
or anywhere else — that is the whole point of importing the data once instead of the app
reading the live site on every interview.

Run it whenever the snapshot file changes:

    cd backend
    python scripts/import_curriculum.py

IDEMPOTENT
----------
Safe to run twice (or a hundred times). Courses are matched by slug, modules by
(course, module_number), topics by (module, topic_order) — all upserts, never blind inserts —
so re-running never creates duplicates and always leaves the DB matching the file exactly
(including removing a topic that was deleted FROM the file, so the DB can't drift ahead of
the source of truth in the other direction either).

NEVER INVENTS DATA
-------------------
A module whose source page only ever exposed a name and a topic COUNT (not the individual
topic names) gets a CurriculumModule row with that count and zero CurriculumTopic children —
never fabricated topic names padding it out to match the count. See models.py's own
docstring on CurriculumModule/CurriculumTopic for why that gap is stored explicitly rather
than papered over.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database.db import db
from app.models import CurriculumCourse, CurriculumModule, CurriculumTopic
from app.utils.curriculum import CATEGORY_TO_CURRICULUM_SLUG
from app.utils.interview_types import SMIT_SUFFIX

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          'data', 'smit_curriculum_official_scrape.json')

# course_name (the JSON file's own label, e.g. "AI & Data Science" — the JSON never carries
# the " — SMIT" interview-category marker, only the plain SMIT course name) -> the curriculum
# slug it must land under. Built from the same category mapping the rest of the app uses (via
# each SMIT interview type's category, with the marker stripped back off), rather than a
# second hand-typed table that could silently name a different slug.
_UI_LABEL_TO_SLUG = {}
for _category, _slug in CATEGORY_TO_CURRICULUM_SLUG.items():
    _UI_LABEL_TO_SLUG[_category[: -len(SMIT_SUFFIX)]] = _slug


def _slug_for(ui_label):
    slug = _UI_LABEL_TO_SLUG.get(ui_label)
    if not slug:
        raise ValueError(
            f"'{ui_label}' has no entry in app.utils.curriculum.CATEGORY_TO_CURRICULUM_SLUG "
            f"— add it there first so this course has somewhere to map to."
        )
    return slug


def _validate(data):
    """Fail loudly before touching the database rather than silently importing a snapshot
    that doesn't match what it claims to — the spec's own validation summary is the contract."""
    courses = data.get('courses') or []
    if not isinstance(courses, list) or not courses:
        raise ValueError("JSON has no 'courses' list")

    total_modules = 0
    total_official_topics = 0
    total_exact_topics = 0
    for course in courses:
        modules = course.get('modules') or []
        total_modules += len(modules)
        for module in modules:
            total_official_topics += module.get('official_topic_count') or 0
            total_exact_topics += len(module.get('topics_exposed_on_public_page') or [])

    return {
        'courses': len(courses),
        'modules': total_modules,
        'official_topic_count': total_official_topics,
        'exact_topic_names': total_exact_topics,
    }


def import_curriculum(path=DATA_FILE, dry_run=False):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    summary = _validate(data)
    print(f"[curriculum-import] Read {path}")
    print(f"[curriculum-import] Found: {summary['courses']} course(s), "
          f"{summary['modules']} module(s), "
          f"{summary['official_topic_count']} official topic count, "
          f"{summary['exact_topic_names']} exact topic name(s) exposed.")

    if dry_run:
        print("[curriculum-import] Dry run — nothing written.")
        return summary

    courses_written = modules_written = topics_written = 0

    for course_data in data['courses']:
        slug = _slug_for(course_data['ui_label'])
        course = CurriculumCourse.query.filter_by(slug=slug).first()
        if not course:
            course = CurriculumCourse(slug=slug)
            db.session.add(course)
        course.ui_label = course_data['ui_label']
        course.official_name = course_data['course_name']
        course.source = data.get('source')
        course.source_url = course_data.get('source_url')
        course.official_module_count = course_data.get('official_module_count')
        course.official_topic_count = course_data.get('official_topic_count')
        course.is_active = True
        db.session.flush()
        courses_written += 1

        seen_module_numbers = set()
        for module_data in course_data.get('modules') or []:
            module_number = module_data['module_number']
            seen_module_numbers.add(module_number)
            module = CurriculumModule.query.filter_by(
                course_id=course.id, module_number=module_number
            ).first()
            if not module:
                module = CurriculumModule(course_id=course.id, module_number=module_number)
                db.session.add(module)
            module.module_name = module_data['module_name']
            module.official_topic_count = module_data.get('official_topic_count')
            module.is_active = True
            db.session.flush()
            modules_written += 1

            exact_topics = module_data.get('topics_exposed_on_public_page') or []
            seen_topic_orders = set()
            for order, topic_name in enumerate(exact_topics, start=1):
                seen_topic_orders.add(order)
                topic = CurriculumTopic.query.filter_by(
                    module_id=module.id, topic_order=order
                ).first()
                if not topic:
                    topic = CurriculumTopic(module_id=module.id, topic_order=order)
                    db.session.add(topic)
                topic.topic_name = topic_name
                topic.source_verified = True
                topics_written += 1

            # A topic removed FROM the source file must not linger in the DB — otherwise a
            # re-import can only ever add rows, and the database silently drifts ahead of
            # the file it's supposed to mirror. Filtered in Python (never a SQL IN over a
            # possibly-empty set, which SQLAlchemy warns about and some dialects mishandle).
            for existing in CurriculumTopic.query.filter_by(module_id=module.id).all():
                if existing.topic_order not in seen_topic_orders:
                    db.session.delete(existing)

        # Same for a module removed from the source file — deactivate rather than delete, so
        # a question already generated from it doesn't lose its history.
        for existing in CurriculumModule.query.filter_by(course_id=course.id).all():
            if existing.module_number not in seen_module_numbers:
                existing.is_active = False

    db.session.commit()
    print(f"[curriculum-import] Wrote {courses_written} course(s), {modules_written} "
          f"module(s), {topics_written} topic row(s).")
    return summary


if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    # Builds the schema (including the curriculum tables, if this is the first run since
    # they were added to models.py) exactly as production boot would — same pattern as
    # scripts/migrate_to_supabase.py. This is FastAPI, not Flask: there is no app-context
    # manager to enter, db.session is a plain SQLAlchemy scoped_session usable right away.
    create_app()
    import_curriculum(dry_run=dry_run)
