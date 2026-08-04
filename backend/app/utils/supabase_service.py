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

    # ---------------------------------------------------------------- chunked recording
    # A session recording is uploaded in parts WHILE the interview runs, not as one large
    # file at the end. A single end-of-session upload of tens of MB routinely died in
    # flight — the candidate reached the report screen and closed the tab long before it
    # finished, and because nothing had reached the server there was no trace of it either.
    # Parts are small, land continuously, and are stitched server-side afterwards, so the
    # most that can ever be lost is the final unflushed slice.

    @staticmethod
    def _video_parts_prefix(user_id: int, interview_id: int) -> str:
        # Zero-padded index keeps lexical order identical to numeric order, so parts can be
        # reassembled straight from a sorted storage listing with no extra bookkeeping.
        return f"parts/user_{user_id}_int_{interview_id}/"

    @staticmethod
    def upload_interview_video_part(user_id: int, interview_id: int, part_index: int,
                                    file_bytes: bytes, content_type: str = 'video/webm') -> str:
        """Store one slice of an in-progress session recording. Returns its
        ``supabase://`` reference, or None if the upload failed."""
        bucket = Config.SUPABASE_VIDEO_BUCKET or 'interview-recordings'
        prefix = SupabaseService._video_parts_prefix(user_id, interview_id)
        storage_path = f"{prefix}{part_index:05d}.webm"
        if SupabaseService._upload_raw(bucket, storage_path, file_bytes, content_type,
                                       timeout=60, retries=2):
            return f"supabase://{bucket}/{storage_path}"
        return None

    @staticmethod
    def list_interview_video_parts(user_id: int, interview_id: int) -> list:
        """Names of every stored part for this interview, in playback order."""
        bucket = Config.SUPABASE_VIDEO_BUCKET or 'interview-recordings'
        url, key = Config.SUPABASE_URL, Config.SUPABASE_KEY
        if not url or not key:
            return []
        prefix = SupabaseService._video_parts_prefix(user_id, interview_id)
        try:
            r = requests.post(
                f"{url.rstrip('/')}/storage/v1/object/list/{bucket}",
                headers={"Authorization": f"Bearer {key}", "ApiKey": key,
                         "Content-Type": "application/json"},
                json={"prefix": prefix, "limit": 1000,
                      "sortBy": {"column": "name", "order": "asc"}},
                timeout=30,
            )
            if r.status_code != 200:
                print(f"Supabase part listing failed: HTTP {r.status_code} {r.text[:150]}")
                return []
            # Sorted explicitly rather than trusting the API's ordering — assembling parts
            # out of order silently produces a corrupt, unplayable file.
            return sorted(f"{prefix}{o['name']}" for o in r.json() if o.get('name'))
        except Exception as e:
            print(f"Supabase part listing exception: {e}")
            return []

    @staticmethod
    def download_object(bucket: str, storage_path: str, timeout: int = 60) -> bytes:
        """Fetch one object's raw bytes, or None on failure."""
        url, key = Config.SUPABASE_URL, Config.SUPABASE_KEY
        if not url or not key:
            return None
        try:
            r = requests.get(f"{url.rstrip('/')}/storage/v1/object/{bucket}/{storage_path}",
                             headers={"Authorization": f"Bearer {key}", "ApiKey": key},
                             timeout=timeout)
            if r.status_code == 200:
                return r.content
            print(f"Supabase download {bucket}/{storage_path} failed: HTTP {r.status_code}")
        except Exception as e:
            print(f"Supabase download exception: {e}")
        return None

    @staticmethod
    def assemble_interview_video(user_id: int, interview_id: int) -> str:
        """Join every stored part into one recording and return its ``supabase://`` ref.

        MediaRecorder timeslice chunks concatenate byte-for-byte into a valid WebM (the
        first slice carries the header, the rest are clusters), which is exactly what the
        browser itself does when building a Blob from them — so a plain ordered join is
        correct here, no transcoding involved. Parts are left in place on failure so a
        retry is always possible; they are only removed once the joined file is safely
        stored.
        """
        bucket = Config.SUPABASE_VIDEO_BUCKET or 'interview-recordings'
        parts = SupabaseService.list_interview_video_parts(user_id, interview_id)
        if not parts:
            return None

        buf = bytearray()
        for path in parts:
            chunk = SupabaseService.download_object(bucket, path)
            if chunk is None:
                # A missing middle part would yield a truncated/corrupt file. Better to
                # keep every part and report failure than to store something unplayable.
                print(f"[assemble] Missing part {path} for interview {interview_id} — aborting join.")
                return None
            buf.extend(chunk)

        if len(buf) < 1024:
            print(f"[assemble] Joined recording for interview {interview_id} is too small ({len(buf)}B).")
            return None

        final_ref = SupabaseService.upload_interview_video(user_id, interview_id, bytes(buf))
        if not final_ref:
            return None

        for path in parts:
            SupabaseService.delete_object(bucket, path)
        return final_ref

    @staticmethod
    def upload_proctor_image(user_id: int, interview_id: int, kind: str, file_bytes: bytes,
                             content_type: str = 'image/jpeg') -> str:
        """Uploads a proctoring image (termination webcam frame or monitored screenshot) to
        the PRIVATE proctor-snapshots bucket, filed under a ``user_<id>/<date>/`` folder tree
        so the admin archive stays organized by candidate and day. Returns a
        ``supabase://bucket/path`` reference, or None if Supabase is unreachable."""
        import datetime as _dt
        bucket = Config.SUPABASE_SNAPSHOT_BUCKET or 'proctor-snapshots'
        safe_kind = (kind or 'snapshot').replace('/', '_')
        date_folder = _dt.datetime.utcnow().strftime('%Y-%m-%d')
        storage_path = (f"user_{user_id}/{date_folder}/"
                        f"{safe_kind}_int_{interview_id}_{int(time.time() * 1000)}.jpg")
        if SupabaseService._upload_raw(bucket, storage_path, file_bytes, content_type):
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
