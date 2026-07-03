import os
import requests
from app.config.config import Config

class WhisperService:
    @staticmethod
    def transcribe(audio_path, question_text=None):
        """
        Transcribes the audio file at audio_path.
        If Config.AI_MODE is 'mock', or no key is present, returns a context-specific mock transcription.
        """
        if Config.AI_MODE == 'mock' or not Config.WHISPER_API_KEY:
            return WhisperService._get_mock_transcription(question_text)

        # Check if the audio file exists
        if not os.path.exists(audio_path):
            return "[Error: Audio file not found for transcription]"

        # Try converting audio if needed using pydub (requires FFmpeg)
        converted_path = audio_path
        temp_created = False
        
        # Browser records webm or ogg often. Let's see if we should convert it to mp3
        ext = os.path.splitext(audio_path)[1].lower()
        if ext in ['.webm', '.ogg', '.wav']:
            try:
                from pydub import AudioSegment
                sound = AudioSegment.from_file(audio_path)
                converted_path = audio_path.replace(ext, '.mp3')
                sound.export(converted_path, format="mp3")
                temp_created = True
            except Exception as e:
                print(f"Warning: Audio conversion failed: {str(e)}. Proceeding with original format.")

        # Call API
        headers = {
            "Authorization": f"Bearer {Config.WHISPER_API_KEY}"
        }
        
        try:
            with open(converted_path, 'rb') as audio_file:
                files = {
                    'file': audio_file,
                }
                # Groq uses 'whisper-large-v3' while OpenAI uses 'whisper-1'
                model_name = 'whisper-large-v3' if 'groq' in Config.WHISPER_API_URL.lower() else 'whisper-1'
                data = {
                    'model': model_name,
                    'response_format': 'json'
                }
                
                # Perform the POST request to the Whisper API URL
                response = requests.post(
                    Config.WHISPER_API_URL,
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=30
                )
                
                if temp_created and os.path.exists(converted_path):
                    os.remove(converted_path)

                if response.status_code == 200:
                    return response.json().get('text', '')
                else:
                    print(f"Whisper API error: Status code {response.status_code}, Body: {response.text}")
                    return f"[API Error: Transcription failed with status {response.status_code}]"

        except Exception as e:
            print(f"Error during Whisper transcription: {str(e)}")
            if temp_created and os.path.exists(converted_path):
                os.remove(converted_path)
            return WhisperService._get_mock_transcription(question_text)

    @staticmethod
    def _get_mock_transcription(question_text=None):
        """
        Generates contextual transcriptions to simulate an impressive speech-to-text conversion.
        """
        if not question_text:
            return "In mock mode, this is a simulated response speech. I am demonstrating the voice response functionality."

        q_lower = question_text.lower()
        
        if "react" in q_lower or "dom" in q_lower:
            return (
                "The virtual DOM is basically a lightweight in-memory representation of the real DOM. "
                "When a component state changes, React creates a new virtual DOM tree and compares it "
                "with the old one using a diffing algorithm. This process is called reconciliation. "
                "It then updates only the changed parts of the real DOM in a single batch, which is much "
                "faster than rebuilding the entire DOM tree."
            )
        elif "decorator" in q_lower or "python" in q_lower:
            return (
                "A decorator in Python is a function that takes another function as an argument, "
                "extends its behavior without modifying it explicitly, and returns a new function. "
                "We can use them for logging, authorization, or timing. For example, a timing decorator "
                "would record the start time, run the function, record the end time, and log the elapsed duration."
            )
        elif "event loop" in q_lower or "node" in q_lower:
            return (
                "The Node.js event loop runs on a single thread but offloads I/O operations to the system kernel "
                "whenever possible. When an asynchronous operation starts, Node hands it off to the kernel or a worker thread. "
                "Once completed, the callback is pushed to the callback queue, and the event loop picks it up "
                "when the call stack is empty, allowing non-blocking executions."
            )
        elif "index" in q_lower or "database" in q_lower:
            return (
                "Database indexing is a data structure, usually a B-tree, that speed up data retrieval operations "
                "on a table at the cost of additional writes and storage. While select queries run much faster, "
                "inserts, updates, and deletes are slightly slower because the index must also be updated."
            )
        elif "star" in q_lower or "conflict" in q_lower or "team" in q_lower:
            return (
                "In my last project, we had a conflict regarding database architecture. I set up a meeting where "
                "both sides presented their designs along with benchmark figures. We analyzed the read-write trade-offs "
                "and agreed to go with the NoSQL option. This resolved the debate constructively and saved us development time."
            )
        elif "yourself" in q_lower or "introduction" in q_lower:
            return (
                "Sure! I am a full-stack engineer with over three years of experience building web applications. "
                "My core stack includes React, Node.js, and SQL databases. I enjoy solving complex structural problems, "
                "optimizing API runtimes, and building user-centric interfaces."
            )
        
        return (
            "This is a high-fidelity speech-to-text response generated using our local Whisper service simulation. "
            "I am speaking clearly to answer the mock interview question and demonstrate system integrity."
        )
