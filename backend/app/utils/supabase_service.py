import requests
import base64
import time
from app.config.config import Config

class SupabaseService:
    @staticmethod
    def _upload_raw(bucket: str, storage_path: str, file_bytes: bytes, content_type: str) -> bool:
        """Low-level upload to a Supabase Storage bucket. Returns True on success, or
        False if Supabase is unconfigured or the upload fails."""
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
        try:
            response = requests.post(upload_url, headers=headers, data=file_bytes, timeout=20)
            if response.status_code in (200, 201):
                return True
            print(f"Supabase Storage responded with code {response.status_code}: {response.text}")
            return False
        except Exception as e:
            print(f"Supabase Storage connection exception: {str(e)}")
            return False

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
        path on success (used with ``get_interview_audio_signed_url`` for authorized
        playback), or None if Supabase is unconfigured/unreachable — callers should fall
        back to local disk storage in that case so no recording is ever lost."""
        bucket = Config.SUPABASE_AUDIO_BUCKET or 'interview-audio'
        storage_path = f"user_{user_id}_int_{interview_id}_q_{question_id}_{int(time.time())}.webm"
        if SupabaseService._upload_raw(bucket, storage_path, file_bytes, content_type):
            return f"supabase://{bucket}/{storage_path}"
        return None

    @staticmethod
    def delete_interview_audio(storage_ref: str) -> bool:
        """Permanently deletes a recorded interview answer identified by a
        ``supabase://bucket/path`` reference. Returns True on success (or if it was
        already gone), False if Supabase is unconfigured or the request fails. Local-disk
        references are handled by the caller, not here."""
        if not storage_ref or not storage_ref.startswith('supabase://'):
            return False
        url = Config.SUPABASE_URL
        key = Config.SUPABASE_KEY
        if not url or not key:
            return False

        bucket_and_path = storage_ref[len('supabase://'):]
        bucket, _, storage_path = bucket_and_path.partition('/')
        url = url.rstrip('/')
        delete_url = f"{url}/storage/v1/object/{bucket}/{storage_path}"
        headers = {"Authorization": f"Bearer {key}", "ApiKey": key}
        try:
            response = requests.delete(delete_url, headers=headers, timeout=20)
            # 200 = deleted; 404 = already gone (treat as success so we don't retry forever).
            if response.status_code in (200, 404):
                return True
            print(f"Supabase delete responded with code {response.status_code}: {response.text}")
            return False
        except Exception as e:
            print(f"Supabase delete exception: {str(e)}")
            return False

    @staticmethod
    def get_interview_audio_signed_url(storage_ref: str, expires_in: int = 3600):
        """Generates a short-lived signed URL for a private ``supabase://bucket/path``
        audio reference, for authorized (e.g. admin) playback. Returns None if the
        reference isn't a Supabase pointer or the request fails."""
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
