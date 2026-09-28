"""Direct Blockchain question selection, restricted to imported curriculum topics."""
import json
from functools import lru_cache
import random
from pathlib import Path

BANK_FILE = Path(__file__).resolve().parents[2] / 'data' / 'blockchain_questions.json'
CONTEXT_PREFIX = 'Approved curriculum for Blockchain:'

def is_blockchain_context(context):
    return bool(context and context.startswith(CONTEXT_PREFIX))

@lru_cache(maxsize=1)
def _question_bank():
    return tuple(json.loads(BANK_FILE.read_text(encoding='utf-8')))


def questions_for_context(context, count, mcq=False):
    bank = _question_bank()
    topics = set()
    for line in context.splitlines()[1:]:
        if ': ' in line:
            topics.update(line.split(': ', 1)[1].split('; '))
    bank = [row for row in bank if row['topic'] in topics]
    if not bank:
        raise ValueError('Blockchain curriculum has no supported active topics. Re-import its curriculum.')
    result = []
    while len(result) < count:
        random.shuffle(bank)
        for row in bank:
            if len(result) >= count:
                break
            if mcq:
                question = row['mcq']
                indices = list(range(4))
                random.shuffle(indices)
                result.append(dict(question_text=question['question_text'],
                    options=[question['options'][i] for i in indices],
                    correct_index=indices.index(question['correct_index'])))
            else:
                result.append(dict(question_text=row['question_text'], question_type='conceptual',
                    code_snippet=None, order_num=len(result) + 1))
    return result
