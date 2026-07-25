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

# main.py reads PORT from the environment in Python and serves the app on 0.0.0.0 with
# reload disabled — so the start command needs no shell and no "$PORT" expansion, which is
# what a bare-argv platform runner (Railway) mishandles. Exec form so the process gets
# SIGTERM directly for clean shutdowns.
CMD ["python", "main.py"]
