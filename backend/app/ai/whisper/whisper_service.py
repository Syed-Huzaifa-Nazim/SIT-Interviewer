import os
import time
import requests
from app.config.config import Config


class TranscriptionError(Exception):
    """Raised when real speech-to-text fails in API mode.

    Critically, we raise instead of silently returning a fabricated transcript, so a
    broken STT pipeline can never masquerade as the candidate's actual spoken answer.
    """
    pass


class WhisperService:
    # Audio formats the STT providers accept directly (no local conversion needed).
    _NATIVE_OK = ('.webm', '.m4a', '.mp3', '.wav', '.ogg', '.flac', '.mp4', '.mpeg', '.mpga')

    @staticmethod
    def is_configured():
        """True when a real STT API is wired up and enabled."""
        return Config.AI_MODE == 'api' and bool(Config.WHISPER_API_KEY)

    @staticmethod
    def transcribe(audio_path, question_text=None):
        """Transcribe the audio file at ``audio_path``.

        - In explicit dev mode (AI_MODE='mock' or no key), returns a clearly simulated
          transcript for offline development.
        - In API mode, performs a real STT call and RAISES ``TranscriptionError`` on
          failure — it never fabricates an answer.
        """
        if Config.AI_MODE == 'mock' or not Config.WHISPER_API_KEY:
            print("[Whisper] AI_MODE=mock or no key -> returning simulated dev transcript.")
            return WhisperService._get_mock_transcription(question_text)

        if not audio_path or not os.path.exists(audio_path):
            raise TranscriptionError("Audio file was not found for transcription.")

        return WhisperService._transcribe_api(audio_path)

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
    def _transcribe_api(audio_path):
        converted_path, temp_created = WhisperService._maybe_convert(audio_path)
        headers = {"Authorization": f"Bearer {Config.WHISPER_API_KEY}"}
        model_name = 'whisper-large-v3' if 'groq' in Config.WHISPER_API_URL.lower() else 'whisper-1'

        size = os.path.getsize(converted_path) if os.path.exists(converted_path) else 0
        print(f"[Whisper] Sending audio to STT: url={Config.WHISPER_API_URL} model={model_name} bytes={size}")

        attempts = Config.LLM_MAX_RETRIES + 1
        last_err = None
        try:
            for attempt in range(attempts):
                try:
                    with open(converted_path, 'rb') as audio_file:
                        response = requests.post(
                            Config.WHISPER_API_URL,
                            headers=headers,
                            files={'file': (os.path.basename(converted_path), audio_file)},
                            data={'model': model_name, 'response_format': 'json'},
                            timeout=Config.LLM_TIMEOUT,
                        )

                    if response.status_code == 200:
                        text = (response.json().get('text') or '').strip()
                        print(f"[Whisper] STT success: {len(text)} chars transcribed.")
                        return text

                    # 401/403 are fatal credential problems — retrying is pointless.
                    if response.status_code in (401, 403):
                        raise TranscriptionError(
                            "Speech-to-text rejected the API credentials. The WHISPER_API_KEY must be a "
                            "Groq or OpenAI key (OpenRouter does not provide audio transcription)."
                        )
                    # 4xx (other than rate limit) are also non-retryable.
                    if 400 <= response.status_code < 500 and response.status_code != 429:
                        raise TranscriptionError(
                            f"Speech-to-text request was rejected (HTTP {response.status_code})."
                        )

                    last_err = f"HTTP {response.status_code}: {response.text[:150]}"
                except requests.RequestException as e:
                    last_err = str(e)

                if attempt < attempts - 1:
                    time.sleep(1.0 * (attempt + 1))

            print(f"[Whisper] STT failed after {attempts} attempt(s): {last_err}")
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
