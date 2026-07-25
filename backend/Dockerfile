FROM python:3.10-slim

# No system packages needed: every Python dependency installs from a prebuilt wheel
# (no compiler required), and the optional pydub/ffmpeg audio conversion is best-effort
# only — Whisper (Groq/OpenAI) accepts the raw webm/ogg/wav directly, and the code
# no-ops the conversion when ffmpeg is absent. Keeping the image lean (~200MB vs ~1GB
# with ffmpeg+build-essential) makes the build fast and reliable on constrained builders.

# Set working directory
WORKDIR /app

# Copy requirements file first to leverage docker caching
COPY requirements.txt .

# Install Python requirements
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Create directories for uploads and reports
RUN mkdir -p uploads reports

# $PORT is injected by the hosting platform (Railway/Render) at runtime, so we need a
# shell to expand it — but `exec` then replaces the shell with uvicorn so it runs as PID 1
# and receives SIGTERM directly for clean shutdowns on redeploy. The ${PORT:-8000}
# fallback keeps the image runnable locally where PORT isn't set. app:create_app is a
# factory (FastAPI); there is no plain app:app object to serve.
CMD ["sh", "-c", "exec uvicorn app:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
