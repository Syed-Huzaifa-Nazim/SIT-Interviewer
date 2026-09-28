"""Live E2E test: generate REAL Urdu + English TTS audio, run it through the real
WhisperService (real Groq keys from backend/.env), and verify the transcripts.

Run from repo root:  python scripts/live_stt_test.py
"""
import asyncio
import os
import sys

# Windows consoles default to cp1252 which cannot print Urdu script.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(HERE, 'backend')
sys.path.insert(0, BACKEND)

import edge_tts  # noqa: E402
from app.config.config import Config  # noqa: E402
from app.ai.whisper.whisper_service import WhisperService, TranscriptionError  # noqa: E402

TMP = os.path.join(HERE, 'scripts', 'tmp_stt')
os.makedirs(TMP, exist_ok=True)

URDU_TEXT = (
    "ری ایکٹ ایک جاوا اسکرپٹ لائبریری ہے جو یوزر انٹرفیس بنانے کے لیے استعمال ہوتی ہے۔ "
    "اس میں ورچوئل ڈوم ہوتا ہے جو ری رینڈرنگ کو تیز بناتا ہے۔"
)
ENGLISH_TEXT = (
    "React is a JavaScript library for building user interfaces, and it uses a virtual "
    "DOM to make re-rendering fast."
)

if not Config.WHISPER_API_KEY and not Config.GROQ_API_KEYS:
    print("NO KEYS configured — aborting live test.")
    sys.exit(1)
print(f"Keys configured: {len(WhisperService._stt_keys())} | AI_MODE={Config.AI_MODE}")
Config.AI_MODE = 'api'


async def gen(text, voice, path):
    await edge_tts.Communicate(text, voice).save(path)


def run_case(name, text, voice, hint):
    audio = os.path.join(TMP, f'{name}.mp3')
    asyncio.run(gen(text, voice, audio))
    size = os.path.getsize(audio)
    print(f"\n--- {name} ({size} bytes, language_hint={hint}) ---")
    out = WhisperService.transcribe(audio, language_hint=hint)
    print(f"TRANSCRIPT: {out}")
    return out


fails = []

# Urdu, with the pre-interview 'ur' choice
u = run_case('urdu_ur', URDU_TEXT, 'ur-PK-AsadNeural', 'ur')
if not any('\u0600' <= ch <= '\u06FF' for ch in (u or '')):
    fails.append('urdu_ur: no Urdu script in transcript')

# Urdu, without any hint (auto path must still land on Urdu)
u2 = run_case('urdu_auto', URDU_TEXT, 'ur-PK-AsadNeural', None)
if not any('\u0600' <= ch <= '\u06FF' for ch in (u2 or '')):
    fails.append('urdu_auto: no Urdu script in transcript')

# English, with the 'en' choice
e = run_case('english_en', ENGLISH_TEXT, 'en-US-GuyNeural', 'en')
if not (e or '').strip().lower().startswith('react'):
    fails.append('english_en: unexpected transcript')

print("\n==============================")
if fails:
    print("LIVE TEST FAILURES:", fails)
    sys.exit(1)
print("LIVE TEST: ALL PASSED")
