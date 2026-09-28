import os
import re
import time
import requests
from app.config.config import Config


class TranscriptionError(Exception):
    """Raised when real speech-to-text fails in API mode.

    Critically, we raise instead of silently returning a fabricated transcript, so a
    broken STT pipeline can never masquerade as the candidate's actual spoken answer.
    """
    pass


# Groq's whisper-large-v3 can auto-detect the language, but short Urdu answers are
# frequently misfired as random English fragments (the model locks onto the wrong
# language from the first noisy second). A explicit language hint plus a transcription
# prompt massively stabilises Urdu output while leaving English answers untouched.
URDU_LANGUAGES = ('ur', 'hi')

# Stabilises decoding for Urdu/Hindi answers: naming the script and the expected
# domain steers the model away from guessing English on noisy syllables.
URDU_TRANSLATION_PROMPT = (
    "This is a job interview answer spoken in Urdu by a Pakistani candidate about "
    "software development. Transcribe exactly what is said in native Urdu script, "
    "properly punctuated. Technical terms (HTML, CSS, React, Python, API, database) "
    "may be spoken in English and should be written in English letters."
)

# English interviews get a domain prompt too — it raises spelling accuracy for
# technical vocabulary without forcing any language.
ENGLISH_PROMPT = (
    "This is a job interview answer about software development. Transcribe exactly "
    "what is said, properly punctuated. Technical terms (HTML, CSS, React, Python, "
    "API, database) must be spelled correctly."
)

# A transcript that is real words but carries no information the scorer can use.
# Speaking Urdu is fine — but "...", "um okay" or "Foreign" is not an answer.
_NOISE_PATTERNS = (
    r'^\W*$',                                  # only punctuation/whitespace
)

# Words that are pure filler/function words. A transcript whose EVERY word (up to a
# few) comes from this set carries no answer content — the classic shape of Urdu audio
# mis-detected as English. Any single content word ("loop", "queue", O(n)) rescues it.
_FILLER_WORDS = frozenset(
    'um uh uhm umm hmm ah ahh oh ooh er erm ok okay yes yeah yep no nah '
    'you your yours u thank thanks thank-you welcome sure right hello hi sorry please '
    'foreign so well now then it its this that these those i we my me '
    'the a an and or but is are am was were be been do does did to of in on at for with'.split()
)
_MAX_ALL_FILLER_WORDS = 4


def _looks_like_noise(text):
    """True when a transcript carries no usable answer content.

    Used ONLY to decide whether a *better attempt* is worth trying (Urdu-first
    retry). It never fabricates: if both attempts agree the audio was empty/noise,
    the empty string is returned honestly.
    """
    t = (text or '').strip()
    if len(t) < 2:
        return True
    if any(re.fullmatch(p, t, flags=re.IGNORECASE) for p in _NOISE_PATTERNS):
        return True
    words = re.findall(r"[A-Za-z']+", t)
    if 0 < len(words) <= _MAX_ALL_FILLER_WORDS and \
            all(w.lower() in _FILLER_WORDS for w in words):
        return True
    return False


class WhisperService:
    # Audio formats the STT providers accept directly (no local conversion needed).
    _NATIVE_OK = ('.webm', '.m4a', '.mp3', '.wav', '.ogg', '.flac', '.mp4', '.mpeg', '.mpga')

    # ------------------------------------------------------------------ keys
    @staticmethod
    def _stt_keys():
        """Every usable STT key, best first.

        GROQ_API_KEYS (comma-separated) is the fail-over pool: when one key is
        rate-limited or rejected the next takes over. The single WHISPER_API_KEY is
        still honoured (first, if set) so existing single-key deployments keep working
        with zero configuration change.
        """
        keys = []
        if Config.WHISPER_API_KEY:
            keys.append(Config.WHISPER_API_KEY)
        keys.extend(Config.GROQ_API_KEYS)
        # de-duplicate, preserving order
        seen = set()
        unique = []
        for k in keys:
            if k and k not in seen:
                seen.add(k)
                unique.append(k)
        return unique

    @staticmethod
    def is_configured():
        """True when a real STT API is wired up and enabled."""
        return Config.AI_MODE == 'api' and bool(WhisperService._stt_keys())

    # ------------------------------------------------------------- public API
    @staticmethod
    def transcribe(audio_path, question_text=None):
        """Transcribe the audio file at ``audio_path``.

        - In explicit dev mode (AI_MODE='mock' or no key), returns a clearly simulated
          transcript for offline development.
        - In API mode, performs a real STT call and RAISES ``TranscriptionError`` on
          failure — it never fabricates an answer.
        - Interview answers are frequently spoken in Urdu; the request carries a
          language hint + prompt so Urdu is transcribed as proper Urdu script, and an
          unclear/garbled audio never gets published as invented English text (an
          empty transcript is returned honestly instead).
        """
        if Config.AI_MODE == 'mock' or not WhisperService._stt_keys():
            print("[Whisper] AI_MODE=mock or no key -> returning simulated dev transcript.")
            return WhisperService._get_mock_transcription(question_text)

        if not audio_path or not os.path.exists(audio_path):
            raise TranscriptionError("Audio file was not found for transcription.")

        return WhisperService._transcribe_api(audio_path)

    # ------------------------------------------------------------ internals
    @staticmethod
    def _maybe_convert(audio_path):
        """Best-effort webm/ogg/wav -> mp3 via pydub+FFmpeg. Groq/OpenAI accept these
        formats natively, so if conversion is unavailable we simply send the original."""
        ext = os.path.splitext(audio_path)[1].lower()
        if ext not in ('.webm', '.ogg', '.wav'):
            return audio_path, False
        try:
            from pydub import AudioSegment
            sound = AudioSegment.from_file(audio_path)
            converted = audio_path.replace(ext, '.mp3')
            sound.export(converted, format='mp3')
            return converted, True
        except Exception as e:
            # Not fatal: the STT providers accept webm/ogg/wav directly.
            print(f"[Whisper] Audio conversion skipped ({e}); sending original {ext} file.")
            return audio_path, False

    @staticmethod
    def _stt_request(api_key, audio_path, language, prompt):
        """One STT HTTP call with one key. Returns transcript text on 200.

        Raises TranscriptionError for non-retryable rejections (bad key, bad request)
        and returns (None, error) for retryable ones (rate limits, network, 5xx) so
        the caller can move to the next key/attempt.
        """
        headers = {"Authorization": f"Bearer {api_key}"}
        model_name = 'whisper-large-v3' if 'groq' in Config.WHISPER_API_URL.lower() else 'whisper-1'

        data = {'model': model_name, 'response_format': 'json'}
        if language:
            # Explicit language beats auto-detect for short noisy Urdu clips.
            data['language'] = language
        if prompt:
            # Prompt conditions decoding; ~224 tokens max per provider docs.
            data['prompt'] = prompt[:200]

        with open(audio_path, 'rb') as audio_file:
            response = requests.post(
                Config.WHISPER_API_URL,
                headers=headers,
                files={'file': (os.path.basename(audio_path), audio_file)},
                data=data,
                timeout=Config.LLM_TIMEOUT,
            )

        if response.status_code == 200:
            return (response.json().get('text') or '').strip(), None

        if response.status_code in (401, 403):
            # Credential problem with THIS key. With a fail-over pool the right move
            # is to try the next key, so this is retryable at the pool level — unless
            # it was the last key, where the original clear error is surfaced.
            return None, f"key rejected (HTTP {response.status_code})"

        if 400 <= response.status_code < 500 and response.status_code != 429:
            raise TranscriptionError(
                f"Speech-to-text request was rejected (HTTP {response.status_code})."
            )

        return None, f"HTTP {response.status_code}: {response.text[:150]}"

    @staticmethod
    def _transcribe_api(audio_path):
        """STT with key fail-over, language detection and an Urdu repair pass.

        Attempt order per network try: auto-detect first (works for both languages),
        then — if the result looks like noise/garbage — an explicit Urdu pass, because
        Urdu audio mis-detected as English is the dominant real-world failure here.
        An honest empty result beats an invented transcript.
        """
        converted_path, temp_created = WhisperService._maybe_convert(audio_path)
        keys = WhisperService._stt_keys()
        attempts_per_key = Config.LLM_MAX_RETRIES + 1
        last_err = None
        try:
            for key_index, api_key in enumerate(keys):
                for attempt in range(attempts_per_key):
                    try:
                        # Pass 1: provider auto-detects the language.
                        text, err = WhisperService._stt_request(
                            api_key, converted_path, language=None, prompt=ENGLISH_PROMPT)

                        if text is not None:
                            if not _looks_like_noise(text):
                                print(f"[Whisper] STT success: {len(text)} chars transcribed.")
                                return text

                            # Pass 2: the clip produced no usable answer. The dominant
                            # cause with this user base is Urdu audio auto-detected as
                            # English — retry once pinned to Urdu before giving up.
                            print("[Whisper] First pass unusable -> retrying pinned to Urdu.")
                            text, err = WhisperService._stt_request(
                                api_key, converted_path,
                                language=URDU_LANGUAGES[0], prompt=URDU_TRANSLATION_PROMPT)
                            if text is not None:
                                if not _looks_like_noise(text):
                                    print(f"[Whisper] Urdu retry success: {len(text)} chars.")
                                    return text
                                # Both passes agree: nothing usable was said. Return
                                # honestly — never publish fabricated filler.
                                print("[Whisper] Audio carries no usable answer; returning empty transcript.")
                                return ''
                            last_err = f"urdu retry: {err}"

                        else:
                            last_err = err
                            if attempt == attempts_per_key - 1 and key_index == len(keys) - 1:
                                raise TranscriptionError(
                                    "Speech-to-text rejected the API credentials. The WHISPER_API_KEY "
                                    "must be a Groq or OpenAI key (OpenRouter does not provide audio "
                                    "transcription)."
                                )

                    except TranscriptionError:
                        raise
                    except requests.RequestException as e:
                        last_err = str(e)

                    if attempt < attempts_per_key - 1:
                        time.sleep(1.0 * (attempt + 1))

                if key_index < len(keys) - 1:
                    print(f"[Whisper] Key #{key_index + 1} exhausted -> failing over to next key.")

            print(f"[Whisper] STT failed after all keys/attempts: {last_err}")
            raise TranscriptionError(f"Speech-to-text service is unavailable: {last_err}")
        finally:
            if temp_created and os.path.exists(converted_path):
                try:
                    os.remove(converted_path)
                except OSError:
                    pass

    @staticmethod
    def _get_mock_transcription(question_text=None):
        """DEV-ONLY simulated transcript. Only reached in explicit AI_MODE='mock' — never
        used to mask a real STT failure in API mode."""
        if not question_text:
            return "[DEV MOCK] Simulated voice response for offline development."

        q_lower = question_text.lower()
        if "react" in q_lower or "dom" in q_lower:
            return (
                "The virtual DOM is basically a lightweight in-memory representation of the real DOM. "
                "When a component state changes, React creates a new virtual DOM tree and compares it "
                "with the old one using a diffing algorithm called reconciliation, then updates only the "
                "changed parts of the real DOM in a single batch."
            )
        if "decorator" in q_lower or "python" in q_lower:
            return (
                "A decorator in Python is a function that takes another function, extends its behavior "
                "without modifying it explicitly, and returns a new function — useful for logging, "
                "authorization, or timing."
            )
        if "event loop" in q_lower or "node" in q_lower:
            return (
                "The Node.js event loop runs on a single thread but offloads I/O operations to the kernel "
                "or worker threads, then picks up callbacks from the queue when the call stack is empty, "
                "allowing non-blocking execution."
            )
        if "index" in q_lower or "database" in q_lower:
            return (
                "A database index is usually a B-tree that speeds up reads at the cost of extra writes and "
                "storage, so selects are faster while inserts and updates are slightly slower."
            )
        return "[DEV MOCK] Simulated speech-to-text response for offline development mode."
