FROM python:3.10-slim

# Every Python dependency installs from a prebuilt wheel (no compiler required), and the
# optional pydub/ffmpeg audio conversion is best-effort only — Whisper (Groq/OpenAI)
# accepts the raw webm/ogg/wav directly, and the code no-ops the conversion when ffmpeg
# is absent. So we deliberately skip ffmpeg + build-essential (~1GB) to keep the build
# fast and reliable on constrained builders.
#
# Node is the ONE exception, and it is not optional. The coding sandbox offers candidates
# a choice of Python or JavaScript, and app/coding/runner.py resolves the interpreter with
# shutil.which("node") at request time. On an image without it that lookup returns None and
# the candidate is told "the javascript runtime is not installed" only AFTER they have
# written their solution under interview time pressure — and switching back to Python
# resets the editor, destroying that work. Shipping the language picker without this
# package would hand every JavaScript-background candidate a dead end.
#
# `node --version` at the end is a build-time assertion, not decoration: Debian ships the
# binary from the `nodejs` package and we depend on it being on PATH under exactly the name
# `node`. If that ever stops being true the image fails to build here, loudly, instead of
# silently degrading into the candidate-facing dead end described above.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version

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
