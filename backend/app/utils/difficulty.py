"""Question Difficulty Range: the single place that knows what a range means.

An admin (or an API key, or the Bulk Email Module) can pin a candidate's interview to a
difficulty RANGE at invite time, before an Interview row even exists — see
`User.question_difficulty_range` in app/models/models.py for why that lives on the user
instead of the interview. Everything that needs to turn that stored range into something
concrete (an LLM prompt instruction, a coding-sandbox difficulty filter, a display label)
comes through here, so the mapping from range -> actual difficulty behavior is defined once.

Nullable/None is a first-class value everywhere in this module: it means "no range was set",
which every caller must treat as "fall back to today's pre-feature behavior" (the client's
own difficulty choice), not as an error.
"""

# Ordered low -> high. Order matters: it is the sequence a progressive interview climbs
# through, and the first entry is what a sandbox opener prefers.
DIFFICULTY_RANGES = {
    'EASY_TO_MEDIUM': ['Easy', 'Medium'],
    'MEDIUM_TO_HARD': ['Medium', 'Hard'],
    'EASY_TO_HARD': ['Easy', 'Medium', 'Hard'],
}

RANGE_LABELS = {
    'EASY_TO_MEDIUM': 'Easy to Medium',
    'MEDIUM_TO_HARD': 'Medium to Hard',
    'EASY_TO_HARD': 'Easy to Hard',
}


def is_valid_range(value):
    return bool(value) and value in DIFFICULTY_RANGES


def range_choices():
    """[{value, label}] for a dropdown — one source for both the admin UI and any docs."""
    return [{'value': k, 'label': RANGE_LABELS[k]} for k in DIFFICULTY_RANGES]


def progressive_sequence(range_value, num_questions):
    """Per-question difficulty labels, low -> high, spread evenly across num_questions.

    e.g. EASY_TO_HARD over 5 questions -> ['Easy', 'Easy', 'Medium', 'Medium', 'Hard']. Each
    question is at least as hard as the one before it, which is what "progressive sequence"
    means for this feature — a candidate should not see a Hard question before an Easy one.
    """
    if not is_valid_range(range_value) or num_questions <= 0:
        return []
    levels = DIFFICULTY_RANGES[range_value]
    n_levels = len(levels)
    return [levels[min(n_levels - 1, (i * n_levels) // num_questions)] for i in range(num_questions)]


def resolve_prompt_difficulty(range_value, num_questions):
    """A difficulty instruction to hand to MixtralService.generate_questions, or None.

    None means "no range set" — the caller keeps using whatever difficulty it already had
    (the client's own choice), which is exactly today's behavior.
    """
    if not is_valid_range(range_value):
        return None
    sequence = progressive_sequence(range_value, num_questions)
    per_question = ', '.join(f"Q{i + 1}: {d}" for i, d in enumerate(sequence))
    return (
        f"Progressive difficulty ranging from {RANGE_LABELS[range_value]} across the "
        f"{num_questions} questions — each later question must be at least as hard as the "
        f"one before it, never easier. Target per-question difficulty: {per_question}."
    )


def resolve_storage_label(range_value):
    """Short label to store on Interview.difficulty, or None to keep the caller's own value."""
    return RANGE_LABELS.get(range_value) if is_valid_range(range_value) else None


def resolve_sandbox_difficulties(range_value):
    """Allowed coding-sandbox difficulties, low -> high, or None for no restriction."""
    return DIFFICULTY_RANGES.get(range_value) if is_valid_range(range_value) else None
