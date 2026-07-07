import requests
import base64
import time
from app.config.config import Config

class SupabaseService:
    @staticmethod
    def upload_profile_picture(user_id: int, file_bytes: bytes, filename: str, content_type: str) -> str:
        """
        Uploads a candidate's profile picture to Supabase Storage.
        Falls back to a Base64 Data URI if Supabase settings are unconfigured or failing.
        """
        url = Config.SUPABASE_URL
        key = Config.SUPABASE_KEY
        bucket = Config.SUPABASE_BUCKET or 'profile-pictures'

        if not url or not key:
            print("Supabase credentials unconfigured. Falling back to local Base64 rendering.")
            encoded = base64.b64encode(file_bytes).decode('utf-8')
            return f"data:{content_type};base64,{encoded}"

        # Sanitize project URL prefix
        url = url.rstrip('/')
        
        # Build structured storage file name (e.g. user_3_178302000.png)
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'png'
        storage_path = f"user_{user_id}_{int(time.time())}.{ext}"
        
        upload_url = f"{url}/storage/v1/object/{bucket}/{storage_path}"
        
        headers = {
            "Authorization": f"Bearer {key}",
            "ApiKey": key,
            "Content-Type": content_type
        }
        
        try:
            # Dispatch binary payload to Supabase API
            response = requests.post(upload_url, headers=headers, data=file_bytes, timeout=12)
            if response.status_code == 200:
                # Return the resolved public access link
                return f"{url}/storage/v1/object/public/{bucket}/{storage_path}"
            else:
                print(f"Supabase Storage responded with code {response.status_code}: {response.text}. Fallback to Base64.")
                encoded = base64.b64encode(file_bytes).decode('utf-8')
                return f"data:{content_type};base64,{encoded}"
        except Exception as e:
            print(f"Supabase Storage connection exception: {str(e)}. Fallback to Base64.")
            encoded = base64.b64encode(file_bytes).decode('utf-8')
            return f"data:{content_type};base64,{encoded}"
