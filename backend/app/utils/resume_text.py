"""Turning an uploaded CV into text, shared by both features that do it (Resume §2).

The Resume & JD Analyzer already had this logic inline. The Resume-Based Interview
enrolment upload needs exactly the same checks, and the requirement for that category is
explicit that it reuses the existing parsing pipeline instead of growing a second one
beside it — so the logic moved here and both callers use it.

Everything here works on bytes rather than a path: the enrolment upload is
unauthenticated, and not putting anonymous uploads on disk at all is the safer default.
"""
from fastapi import HTTPException

from app.utils.pdf_parser import PDFParser

RESUME_EXTENSIONS = {'pdf', 'txt'}

# An honest CV is comfortably under this. The cap matters most on the enrolment upload,
# which anyone can call without an account — the global 32MB body limit is far too generous
# to be the only thing standing between a stranger and the PDF parser.
MAX_RESUME_BYTES = 5 * 1024 * 1024

# Extraction below this is treated as a failure rather than a very short CV: it means the
# PDF was scanned images, or encrypted, or simply empty.
MIN_RESUME_CHARS = 50

# Sections a real CV has. Two hits is deliberately a low bar — this is here to reject the
# wrong file entirely (an invoice, a photo, a bank statement), not to grade the resume.
_RESUME_KEYWORDS = (
    'experience', 'education', 'skills', 'projects', 'employment',
    'history', 'summary', 'contact', 'qualification', 'certifications',
    'cv', 'resume', 'work history', 'professional experience',
    'academic', 'courses', 'achievements', 'objective',
)


def file_extension(filename):
    return filename.rsplit('.', 1)[-1].lower() if filename and '.' in filename else ''


def looks_like_a_resume(text):
    lowered = (text or '').lower()
    if 'curriculum vitae' in lowered or 'resume' in lowered:
        return True
    return sum(1 for kw in _RESUME_KEYWORDS if kw in lowered) >= 2


def extract_resume_text(contents, filename, *, enforce_size_limit=True):
    """Bytes of an uploaded CV -> its text.

    Raises HTTPException with a message the candidate can act on, because every caller is a
    route and the distinction between "wrong format", "scanned PDF" and "not a resume" is
    the difference between them fixing it themselves and them giving up.

    ``enforce_size_limit`` is False for the authenticated Resume & JD Analyzer, which never
    had a size cap and is not the endpoint a stranger can reach.
    """
    ext = file_extension(filename)
    if ext not in RESUME_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF and TXT formats are supported")

    if enforce_size_limit and len(contents) > MAX_RESUME_BYTES:
        mb = MAX_RESUME_BYTES // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"Resume must be smaller than {mb}MB")

    if ext == 'pdf':
        try:
            text = PDFParser.extract_text_from_bytes(contents)
        except Exception:
            # The underlying pypdf message names internal structures and helps nobody.
            raise HTTPException(
                status_code=400,
                detail="That PDF could not be read. If it is scanned or password-protected, "
                       "please upload a text-based PDF or a .txt file instead."
            )
    else:
        text = contents.decode('utf-8', errors='ignore')

    if not text or len(text.strip()) < MIN_RESUME_CHARS:
        raise HTTPException(
            status_code=400,
            detail="Failed to extract text from that file. It may be blank or a scanned image."
        )

    if not looks_like_a_resume(text):
        raise HTTPException(
            status_code=400,
            detail="That document does not look like a resume or CV. Please upload one with "
                   "the usual sections such as Experience, Education, Skills or Projects."
        )

    return text.strip()
