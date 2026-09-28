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

# Pass-1 prompt: bilingual by design. Candidates mix Urdu and English (code-switching),
# so the prompt conditions Whisper to write Urdu speech in proper Urdu script instead of
# a Roman-English guess, while keeping English technical terms intact.
BILINGUAL_PROMPT = (
    "This is a job interview answer from a Pakistani candidate and may be in Urdu or "
    "English. Transcribe exactly what is said in the language actually spoken: Urdu "
    "speech must be written in proper Urdu (Arabic) script with correct punctuation, "
    "NOT in Roman letters. English technical terms (HTML, CSS, React, Python, API, "
    "database) are written in English letters."
)

# Used when the candidate explicitly chose Urdu on the pre-interview screen — the audio
# is pinned to Urdu on the FIRST pass (no guessing needed) while still allowing English
# technical terms to surface in Latin letters as spoken.
URDU_PINNED_PROMPT = (
    "This is a job interview answer spoken in Urdu by a Pakistani candidate about "
    "software development. Transcribe exactly what is said in native Urdu script, "
    "properly punctuated. Technical terms (HTML, CSS, React, Python, API, database) "
    "may be spoken in English and should be written in English letters."
)

# Used when the candidate explicitly chose English on the pre-interview screen.
ENGLISH_PROMPT = (
    "This is a job interview answer about software development. Transcribe exactly "
    "what is said in English, properly punctuated. Technical terms (HTML, CSS, React, "
    "Python, API, database) must be spelled correctly."
)

# Roman Urdu written out in Latin letters ("yeh ek library hai") is the most common
# misfire for Urdu audio even after the bilingual prompt. These markers are words that
# only occur in Urdu/Roman-Urdu speech (postpositions ka/ki/ke/ko/se, verbs like
# karta/hota/hai, etc.), so two or more of them strongly indicate Urdu spoken in Latin
# script — worth one explicit Urdu-pinned retry. English homographs that happen to also
# be Urdu words ("main", "tab") are deliberately NOT counted so ordinary English
# answers are never sent through an unnecessary retry.
_ROMAN_URDU_MARKERS = frozenset(
    'hai hain nahi nahin nai kya kyun kyu aur kar karna karta karti karte karo '
    'hota hoti hote tha thi hoon hun mein mujhe aap tum yeh ye woh wo '
    'kaise kaisa kaisi kitna kitni bohat bahut bahot zaroor bhi tou ka ki ke ko se '
    'liya diya kiya chahiye sakta sakti sakte raha rahi rahe gaya gayi gaye '
    'hoga hogi honge wala wali wale jaisa jaise sab hum abhi jab agar '
    'lekin magar matlab zyada bana banaya banate chalta chal parta jata jati '
    'lagta lagti milta milti saath sath kaam pehle baad wahan yahan kuch'
    .split()
)
_MAX_ROMAN_URDU_MARKER_HITS = 2


def _looks_like_roman_urdu(text):
    """True when a Latin-script transcript is actually Roman Urdu.

    Counts standalone Urdu-marker words; Urdu (Arabic) script anywhere in the text
    immediately disqualifies it. Used only to decide whether the Urdu-pinned repair
    pass is worth running — never to fabricate or discard an answer.
    """
    t = (text or '').strip()
    if len(t) < 2:
        return False
    if re.search(r'[\u0600-\u06FF]', t):
        return False  # already proper Urdu script
    tokens = re.findall(r"[A-Za-z']+", t.lower())
    hits = sum(1 for tok in tokens if tok in _ROMAN_URDU_MARKERS)
    return hits >= _MAX_ROMAN_URDU_MARKER_HITS


def _looks_like_hindi_script(text):
    """True when the transcript came back in Devanagari (Hindi) script.

    Spoken Urdu and Hindi are near-identical, so Whisper's auto-detect frequently
    picks 'hi' and writes Devanagari — confirmed on live Groq tests — which Pakistani
    candidates cannot read. Detected in the auto/English paths so the Urdu-pinned
    repair pass can rewrite the same audio in proper Urdu script.
    """
    t = (text or '').strip()
    if not t:
        return False
    has_devanagari = bool(re.search(r'[\u0900-\u097F]', t))
    has_arabic = bool(re.search(r'[\u0600-\u06FF]', t))
    return has_devanagari and not has_arabic

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
    def transcribe(audio_path, question_text=None, language_hint=None):
        """Transcribe the audio file at ``audio_path``.

        - In explicit dev mode (AI_MODE='mock' or no key), returns a clearly simulated
          transcript for offline development.
        - In API mode, performs a real STT call and RAISES ``TranscriptionError`` on
          failure — it never fabricates an answer.
        - ``language_hint`` comes from the candidate's pre-interview language choice
          ('ur' | 'en' | None=auto). A pinned language is used on the FIRST pass — no
          guessing — so a candidate who declared Urdu gets Urdu script immediately.
        - Even with a hint, an unusable first result still gets one repair retry, and
          unclear/garbled audio is never published as invented text (an empty transcript
          is returned honestly instead).
        """
        if Config.AI_MODE == 'mock' or not WhisperService._stt_keys():
            print("[Whisper] AI_MODE=mock or no key -> returning simulated dev transcript.")
            return WhisperService._get_mock_transcription(question_text)

        if not audio_path or not os.path.exists(audio_path):
            raise TranscriptionError("Audio file was not found for transcription.")

        return WhisperService._transcribe_api(audio_path, language_hint=language_hint)

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
    def _transcribe_api(audio_path, language_hint=None):
        """STT with key fail-over, language handling and a repair pass.

        With ``language_hint`` ('ur'/'en') the first pass is PINNED to that language and
        its prompt — the candidate already declared it, so no detection gamble. Without a
        hint the provider auto-detects (works for both languages), then — if the result
        looks like noise or Roman-Urdu — an explicit Urdu pass repairs it. An honest empty
        result beats an invented transcript.
        """
        if language_hint == 'ur':
            first_language, first_prompt = URDU_LANGUAGES[0], URDU_PINNED_PROMPT
        elif language_hint == 'en':
            first_language, first_prompt = 'en', ENGLISH_PROMPT
        else:
            first_language, first_prompt = None, BILINGUAL_PROMPT
        # Repair pass: an auto/unhinted or English-hinted misfire is most likely Urdu
        # speech, so retry pinned to Urdu. A failed Urdu-PINNED pass, though, usually
        # means the candidate actually spoke English — repair with the bilingual auto
        # pass instead of pinning Urdu a second time.
        if language_hint == 'ur':
            second_language, second_prompt = None, BILINGUAL_PROMPT
        else:
            second_language, second_prompt = URDU_LANGUAGES[0], URDU_TRANSLATION_PROMPT

        converted_path, temp_created = WhisperService._maybe_convert(audio_path)
        keys = WhisperService._stt_keys()
        attempts_per_key = Config.LLM_MAX_RETRIES + 1
        last_err = None
        try:
            for key_index, api_key in enumerate(keys):
                for attempt in range(attempts_per_key):
                    try:
                        # Pass 1: hinted (pinned) or auto-detected language.
                        text, err = WhisperService._stt_request(
                            api_key, converted_path, language=first_language, prompt=first_prompt)

                        if text is not None:
                            misfired = (
                                _looks_like_noise(text)
                                or (language_hint != 'ur' and _looks_like_roman_urdu(text))
                                or _looks_like_hindi_script(text)
                            )
                            if not misfired:
                                print(f"[Whisper] STT success: {len(text)} chars transcribed.")
                                return text

                            # Pass 2: the clip came back as noise/garbage or (auto mode)
                            # as Roman-Urdu ("yeh ek library hai"). One repair retry with
                            # the opposite language pin (see second_language above).
                            print("[Whisper] First pass unusable -> running repair pass.")
                            text, err = WhisperService._stt_request(
                                api_key, converted_path,
                                language=second_language, prompt=second_prompt)
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
