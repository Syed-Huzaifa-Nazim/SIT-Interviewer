# AI Interviewer – Intelligent Mock Interview and Candidate Assessment Platform

AI Interviewer is a production-ready, full-stack mock interview and candidate assessment system. It simulates real-world technical, HR, and behavioral interviews. Candidates can engage in mock interviews via text or voice, solve coding challenges in an integrated workspace, perform resume and job description (JD) match analysis, and receive detailed breakdown reports driven by **Mixtral LLM** and **OpenAI Whisper**.

## Key Features

- **Dynamic Q&A Generation**: Uses Mixtral to generate role and difficulty-based questions.
- **Speech-to-Text Integration**: Converts audio responses to text using Whisper.
- **Token System**: Users receive signup tokens and consume tokens per interview.
- **Coding Interview Module**: Integrated online code editor and AI-based code review.
- **Resume & JD Analyzer**: Matches resumes with job descriptions, highlighting skill gaps.
- **Detailed Evaluation & PDF Reports**: Provides scores (Technical, Confidence, Communication) and downloadable reports.
- **Admin Dashboard**: Manage users, tokens, and monitor feedback and revenue.

## Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Chart.js, Lucide Icons, Axios.
- **Backend**: Python 3.13, Flask, Flask-SQLAlchemy, Flask-JWT-Extended, bcrypt.
- **AI**: Mixtral LLM (via API/Groq/Together), Whisper Speech-to-Text.
- **Database**: SQLite (default for development), PostgreSQL/MySQL (production/Docker).

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- FFmpeg (for voice processing)

### Backend Setup
1. Navigate to `backend/` and install requirements:
   ```bash
   pip install -r requirements.txt
   ```
2. Create a `.env` file in the `backend/` directory:
   ```env
   DATABASE_URL=sqlite:///interviewer.db
   JWT_SECRET_KEY=dev_jwt_secret_key_change_me
   MIXTRAL_API_KEY=your_api_key
   WHISPER_API_KEY=your_api_key
   # Set to 'mock' to run the AI features in mock mode without API keys:
   AI_MODE=mock
   ```
3. Run the backend:
   ```bash
   python app.py
   ```

### Frontend Setup
1. Navigate to `frontend/` and install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```

### Docker Compose
To run the entire suite using Docker:
```bash
docker-compose up --build
```
