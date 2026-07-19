import requests
import base64
import time
from app.config.config import Config

class SupabaseService:
    @staticmethod
    def _upload_raw(bucket: str, storage_path: str, file_bytes: bytes, content_type: str,
                    timeout: int = 20, retries: int = 2) -> bool:
        """Low-level upload to a Supabase Storage bucket, with retries for transient
        failures (§2.2 upload reliability). Returns True on success, or False if Supabase
        is unconfigured or every attempt fails."""
        url = Config.SUPABASE_URL
        key = Config.SUPABASE_KEY
        if not url or not key:
            return False

        url = url.rstrip('/')
        upload_url = f"{url}/storage/v1/object/{bucket}/{storage_path}"
        headers = {
            "Authorization": f"Bearer {key}",
            "ApiKey": key,
            "Content-Type": content_type
        }
        last_err = None
        for attempt in range(1 + max(0, retries)):
            try:
                response = requests.post(upload_url, headers=headers, data=file_bytes, timeout=timeout)
                if response.status_code in (200, 201):
                    return True
                last_err = f"HTTP {response.status_code}: {response.text[:150]}"
                # 4xx (except rate-limit) won't succeed on retry.
                if 400 <= response.status_code < 500 and response.status_code != 429:
                    break
            except Exception as e:
                last_err = str(e)
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
        print(f"Supabase Storage upload to {bucket}/{storage_path} failed: {last_err}")
        return False

    @staticmethod
    def delete_object(bucket: str, storage_path: str) -> bool:
        """Permanently delete one object from Supabase Storage (Cascade §4.3 — a Postgres
        cascade can't remove storage files, so deletion flows call this explicitly).
        Returns True on success or if the object is already gone; False on real failure
        (caller logs it so orphans can be cleaned up manually)."""
        url = Config.SUPABASE_URL
        key = Config.SUPABASE_KEY
        if not url or not key:
            return False
        url = url.rstrip('/')
        headers = {"Authorization": f"Bearer {key}", "ApiKey": key}
        try:
            response = requests.delete(f"{url}/storage/v1/object/{bucket}/{storage_path}",
                                       headers=headers, timeout=20)
            if response.status_code in (200, 204, 404):
                return True  # 404 = already gone, which is the desired end state
            print(f"Supabase Storage delete {bucket}/{storage_path} failed: "
                  f"HTTP {response.status_code}: {response.text[:150]}")
            return False
        except Exception as e:
            print(f"Supabase Storage delete exception for {bucket}/{storage_path}: {e}")
            return False

    @staticmethod
    def parse_storage_ref(ref: str):
        """Split a stored media reference into (bucket, path), or None if the value
        doesn't point at Supabase Storage. Understands both the internal
        ``supabase://bucket/path`` form (private audio/video) and the public-URL form
        used for profile pictures."""
        if not ref:
            return None
        if ref.startswith('supabase://'):
            bucket, _, path = ref[len('supabase://'):].partition('/')
            return (bucket, path) if bucket and path else None
        public_marker = '/storage/v1/object/public/'
        if Config.SUPABASE_URL and ref.startswith(Config.SUPABASE_URL.rstrip('/')) and public_marker in ref:
            bucket, _, path = ref.split(public_marker, 1)[1].partition('/')
            return (bucket, path) if bucket and path else None
        return None

    @staticmethod
    def upload_profile_picture(user_id: int, file_bytes: bytes, filename: str, content_type: str) -> str:
        """
        Uploads a candidate's profile picture to the PUBLIC profile-pictures bucket
        (avatars are meant to be publicly viewable in the UI). Falls back to a Base64
        Data URI if Supabase settings are unconfigured or failing.
        """
        bucket = Config.SUPABASE_BUCKET or 'profile-pictures'
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'png'
        storage_path = f"user_{user_id}_{int(time.time())}.{ext}"

        if SupabaseService._upload_raw(bucket, storage_path, file_bytes, content_type):
            return f"{Config.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{bucket}/{storage_path}"

        # Small images are fine to inline as a Base64 data URI when Supabase is
        # unavailable — unlike audio, this won't overflow a DB text column.
        print("Falling back to Base64 rendering for profile picture.")
        encoded = base64.b64encode(file_bytes).decode('utf-8')
        return f"data:{content_type};base64,{encoded}"

    @staticmethod
    def upload_interview_audio(user_id: int, interview_id: int, question_id: int, file_bytes: bytes,
                                content_type: str = 'audio/webm') -> str:
        """Uploads a recorded interview answer to a PRIVATE Supabase Storage bucket —
        candidate voice recordings are sensitive personal data, so (unlike profile
        pictures) this never returns a public URL. Returns the bucket-relative storage
        path on success (used with ``get_signed_url`` for authorized
        playback), or None if Supabase is unconfigured/unreachable — callers should fall
        back to local disk storage in that case so no recording is ever lost."""
        bucket = Config.SUPABASE_AUDIO_BUCKET or 'interview-audio'
        storage_path = f"user_{user_id}_int_{interview_id}_q_{question_id}_{int(time.time())}.webm"
        if SupabaseService._upload_raw(bucket, storage_path, file_bytes, content_type):
            return f"supabase://{bucket}/{storage_path}"
        return None

    @staticmethod
    def upload_interview_video(user_id: int, interview_id: int, file_bytes: bytes,
                               content_type: str = 'video/webm') -> str:
        """Uploads a full-session interview video recording to the PRIVATE
        interview-recordings bucket (§2.2). Like answer audio, recordings are sensitive —
        never a public URL; admin playback goes through short-lived signed URLs. Returns a
        ``supabase://bucket/path`` reference, or None if Supabase is unreachable (caller
        logs the failure so the admin isn't left assuming a recording exists). Longer
        timeout than audio: session videos are tens of MB."""
        bucket = Config.SUPABASE_VIDEO_BUCKET or 'interview-recordings'
        storage_path = f"user_{user_id}_int_{interview_id}_{int(time.time())}.webm"
        if SupabaseService._upload_raw(bucket, storage_path, file_bytes, content_type,
                                       timeout=120, retries=2):
            return f"supabase://{bucket}/{storage_path}"
        return None

    @staticmethod
    def get_signed_url(storage_ref: str, expires_in: int = 3600):
        """Generates a short-lived signed URL for any private ``supabase://bucket/path``
        media reference (answer audio, session video), for authorized (admin) playback.
        Returns None if the reference isn't a Supabase pointer or the request fails."""
        if not storage_ref or not storage_ref.startswith('supabase://'):
            return None
        url = Config.SUPABASE_URL
        key = Config.SUPABASE_KEY
        if not url or not key:
            return None

        bucket_and_path = storage_ref[len('supabase://'):]
        bucket, _, storage_path = bucket_and_path.partition('/')
        url = url.rstrip('/')
        sign_url = f"{url}/storage/v1/object/sign/{bucket}/{storage_path}"
        headers = {"Authorization": f"Bearer {key}", "ApiKey": key, "Content-Type": "application/json"}
        try:
            response = requests.post(sign_url, headers=headers, json={"expiresIn": expires_in}, timeout=15)
            if response.status_code == 200:
                signed_path = response.json().get('signedURL')
                return f"{url}/storage/v1{signed_path}" if signed_path else None
            print(f"Supabase sign-URL responded with code {response.status_code}: {response.text}")
            return None
        except Exception as e:
            print(f"Supabase sign-URL exception: {str(e)}")
            return None
