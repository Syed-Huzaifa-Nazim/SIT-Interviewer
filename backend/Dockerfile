FROM python:3.10-slim

# Install system dependencies (including FFmpeg for audio processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements file first to leverage docker caching
COPY requirements.txt .

# Install Python requirements
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose port 5000
EXPOSE 5000

# Create directories for uploads and reports
RUN mkdir -p uploads reports

# Start the Flask app using Gunicorn for production scalability
CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]
