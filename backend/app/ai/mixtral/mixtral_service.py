import json
import re
import time
import requests
import random
from app.config.config import Config
from app.utils.candidate import (
    CODING_SCENARIO, CODING_LOGIC, CODING_CONCEPT, CODING_DEBUG,
    CODING_FORMATS, CODING_FORMATS_WITH_SNIPPET,
)

class MixtralService:
    # Every question_type the generator may emit. 'coding' is the legacy catch-all kept for
    # backwards compatibility with questions created before the four coding formats existed.
    ALLOWED_QUESTION_TYPES = {
        'conceptual', 'scenario', 'coding', 'behavioral', 'hr', *CODING_FORMATS
    }

    @staticmethod
    def is_configured():
        """True when a real LLM API is wired up and enabled."""
        return Config.AI_MODE == 'api' and bool(Config.MIXTRAL_API_KEY)

    @staticmethod
    def _parse_json_content(content):
        """Tolerantly parse a model's text into a JSON object.

        Handles clean JSON, ```json fenced blocks, and prose with an embedded
        object, so we don't drop good completions just because a model ignored
        the response_format hint.
        """
        if not content:
            return None
        content = content.strip()
        if content.startswith('```'):
            content = re.sub(r'^```[a-zA-Z]*\n?', '', content)
            content = re.sub(r'\n?```$', '', content).strip()
        try:
            return json.loads(content)
        except Exception:
            match = re.search(r'\{.*\}', content, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except Exception:
                    return None
        return None

    @staticmethod
    def _call_llm(system_prompt, user_prompt, temperature=0.3, model=None, max_retries=None):
        """Call the configured chat-completions endpoint with retries.

        Returns a parsed JSON object on success, or None on failure so callers
        can apply their own safe fallback. Never raises.
        """
        if Config.AI_MODE == 'mock' or not Config.MIXTRAL_API_KEY:
            return None

        headers = {
            "Authorization": f"Bearer {Config.MIXTRAL_API_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": model or Config.LLM_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"}
        }

        attempts = (Config.LLM_MAX_RETRIES if max_retries is None else max_retries) + 1
        last_err = None
        for attempt in range(attempts):
            try:
                response = requests.post(
                    Config.MIXTRAL_API_URL, headers=headers, json=payload, timeout=Config.LLM_TIMEOUT
                )
                if response.status_code == 200:
                    content = response.json()['choices'][0]['message']['content']
                    parsed = MixtralService._parse_json_content(content)
                    if parsed is not None:
                        return parsed
                    last_err = "Response was not valid JSON"
                elif response.status_code == 400 and 'response_format' in payload:
                    # Some models/providers reject response_format; retry without it.
                    payload.pop('response_format', None)
                    last_err = f"HTTP 400 (retrying without response_format): {response.text[:150]}"
                    continue
                else:
                    last_err = f"HTTP {response.status_code}: {response.text[:150]}"
            except Exception as e:
                last_err = str(e)

            if attempt < attempts - 1:
                time.sleep(1.0 * (attempt + 1))

        print(f"[MixtralService] LLM call failed after {attempts} attempt(s): {last_err}. Using fallback.")
        return None

    # Roles that are unambiguously technical/CS and never need a classification call.
    KNOWN_TECHNICAL_ROLES = [
        'react developer', 'python developer', 'node.js developer', 'node developer',
        'database administrator', 'ai engineer', 'machine learning engineer',
        'full stack developer', 'system architect', 'software engineer', 'frontend developer',
        'backend developer', 'devops engineer', 'data scientist', 'data engineer',
        'qa engineer', 'cybersecurity analyst', 'cloud engineer', 'mobile developer',
        # Canonical roles for the course-category signup system (§3.3) — additive only,
        # guarantees the auto-created official interview is never rejected.
        'cloud & data engineer', 'web & mobile app developer', 'ui/ux designer',
        # Added when "Graphics and UI/UX Design" split into two separate tracks — the UI/UX
        # half already had a preset above; this is the Graphic Design half's own.
        'graphic designer'
    ]

    # Safety-net keyword lists used when the LLM classification call is unavailable.
    NON_TECHNICAL_DOMAIN_KEYWORDS = [
        'chemical engineering', 'biomedical', 'biotechnology', 'mbbs', 'medicine', 'medical',
        'dentistry', 'dental', 'architecture', 'b.arch', 'pharmacy', 'pharmaceutical',
        'civil engineering', 'mechanical engineering', 'electrical engineering', 'law', 'legal',
        'lawyer', 'nursing', 'psychology', 'literature', 'history', 'fashion', 'culinary',
        'agriculture', 'veterinary', 'geology', 'mining', 'accounting', 'audit',
        'human resources management', 'marketing manager', 'sales executive'
    ]
    TECHNICAL_DOMAIN_KEYWORDS = [
        'software', 'developer', 'engineer', 'data science', 'data scientist', 'machine learning',
        'ml', 'ai', 'artificial intelligence', 'devops', 'cloud', 'cyber', 'security', 'qa',
        'testing', 'frontend', 'front-end', 'backend', 'back-end', 'full stack', 'fullstack',
        'web', 'mobile', 'android', 'ios', 'python', 'java', 'javascript', 'react', 'node',
        'database', 'dba', 'sql', 'network', 'programmer', 'coding', 'blockchain', 'game dev',
        'embedded', 'firmware', 'sre', 'platform', 'api', 'microservice', 'it '
    ]

    @classmethod
    def classify_domain(cls, domain_text):
        """Classify a freeform domain/role as technical (supported) or not.

        Returns a dict: {is_technical, confidence (0-100), normalized_domain, reason, source}.
        Uses the LLM when available and falls back to keyword heuristics so a failed
        API call never blocks a legitimate technical candidate.
        """
        domain = (domain_text or '').strip()
        if not domain:
            return {'is_technical': False, 'confidence': 100, 'normalized_domain': domain,
                    'reason': 'No domain was provided.', 'source': 'fallback'}

        # Known preset technical roles short-circuit the LLM call.
        if domain.lower() in cls.KNOWN_TECHNICAL_ROLES:
            return {'is_technical': True, 'confidence': 100, 'normalized_domain': domain,
                    'reason': 'Recognised technical role.', 'source': 'preset'}

        system_prompt = (
            "You are a domain classifier for a technical (Computer Science / software / IT) "
            "interview platform. Decide whether the given job role or domain is one this platform "
            "can interview for. TECHNICAL (supported) examples: software engineering, web/mobile "
            "development, data science, ML/AI, DevOps, cloud, cybersecurity, QA/testing, databases, "
            "networking, embedded/firmware. NON-TECHNICAL (not supported) examples: medicine, "
            "dentistry, law, architecture, civil/chemical/mechanical/biomedical engineering, pharmacy, "
            "biotechnology, accounting, nursing, non-technical management/sales/marketing. "
            "Return ONLY a JSON object with keys: 'is_technical' (boolean), 'confidence' (0-100 "
            "integer), 'normalized_domain' (cleaned canonical role name string), 'reason' (short string)."
        )
        user_prompt = f'Classify this domain/role entered by a candidate: "{domain}".'
        result = cls._call_llm(system_prompt, user_prompt, temperature=0.0)

        if result is not None and 'is_technical' in result:
            try:
                confidence = int(float(result.get('confidence', 70)))
            except (TypeError, ValueError):
                confidence = 70
            return {
                'is_technical': bool(result.get('is_technical')),
                'confidence': max(0, min(confidence, 100)),
                'normalized_domain': (result.get('normalized_domain') or domain).strip(),
                'reason': str(result.get('reason', '')).strip(),
                'source': 'llm'
            }

        return cls._fallback_classify_domain(domain)

    @classmethod
    def _fallback_classify_domain(cls, domain):
        d = f" {domain.lower()} "
        for keyword in cls.NON_TECHNICAL_DOMAIN_KEYWORDS:
            if keyword in d:
                return {'is_technical': False, 'confidence': 75, 'normalized_domain': domain,
                        'reason': f'Matched known non-technical domain ("{keyword}").', 'source': 'fallback'}
        for keyword in cls.TECHNICAL_DOMAIN_KEYWORDS:
            if keyword in d:
                return {'is_technical': True, 'confidence': 70, 'normalized_domain': domain,
                        'reason': f'Matched technical keyword ("{keyword.strip()}").', 'source': 'fallback'}
        # Unknown domain: allow as best-effort (brief only blocks *clearly* non-technical ones)
        # but flag low confidence so it can be reviewed later.
        return {'is_technical': True, 'confidence': 40, 'normalized_domain': domain,
                'reason': 'Domain not recognised; proceeding as a best-effort technical interview.',
                'source': 'fallback'}

    # Instructor competency question bank (Update §3) — teaching-oriented, NOT candidate-level
    # technical questions. Used both to steer the LLM and as the offline mock fallback.
    INSTRUCTOR_QUESTIONS = [
        ("Walk us through how you would plan and structure a course for absolute beginners in your subject area.", "conceptual"),
        ("Describe a time a student was struggling to grasp a concept. How did you adapt your teaching approach?", "behavioral"),
        ("How do you assess whether your students have genuinely understood a topic versus just memorised it?", "conceptual"),
        ("A student challenges your explanation in front of the class and turns out to be partly right. How do you handle it?", "scenario"),
        ("How do you keep your own technical knowledge current so your teaching stays relevant to industry?", "conceptual"),
        ("Explain a complex concept in your field as if you were teaching it to someone with no background — keep it clear and structured.", "scenario"),
        ("How do you handle a classroom with a wide range of skill levels, so neither the fast nor the slow learners are left behind?", "scenario"),
        ("What does effective feedback on student work look like to you, and how do you deliver it constructively?", "behavioral"),
        ("How would you design a hands-on project or assessment that genuinely measures practical mastery of your subject?", "conceptual"),
        ("Tell us about a time you received critical feedback on your teaching. What did you change as a result?", "behavioral"),
        ("How do you keep students engaged and motivated during long or difficult topics?", "scenario"),
        ("What is your approach to mentoring students beyond the syllabus — career guidance, portfolios, and industry readiness?", "behavioral"),
    ]

    # Domain-specific coding questions covering all four formats (Coding Formats §2.2),
    # used as the offline/mock fallback. Entries are (question_text, question_type,
    # code_snippet). Keyed by the same role buckets as the main mock library so the
    # domain-relevance rule (§2.3) still holds when the LLM is unavailable.
    CODING_FORMAT_BANK = {
        "react": [
            ("A dashboard re-renders every list row whenever any single row changes. Walk me through how you would find the cause and restructure it.", CODING_SCENARIO, None),
            ("You need to sync a search input to the URL without spamming history entries. Explain your approach and why you'd choose it.", CODING_LOGIC, None),
            ("What is the difference between useMemo and useCallback, and when does memoising actually hurt performance?", CODING_CONCEPT, None),
            ("This effect causes an infinite render loop. What's wrong and how would you fix it?", CODING_DEBUG,
             "function Profile({ userId }) {\n  const [user, setUser] = useState(null);\n  useEffect(() => {\n    fetchUser(userId).then(setUser);\n  });\n  return <div>{user?.name}</div>;\n}"),
        ],
        "python": [
            ("You must process a 10GB CSV and aggregate a column, but the machine has 2GB of RAM. Describe how you'd build this.", CODING_SCENARIO, None),
            ("Given a list of records, explain your approach to deduplicating them by a composite key while preserving the first occurrence order.", CODING_LOGIC, None),
            ("What is the time complexity of a binary search, and why is it O(log n)?", CODING_CONCEPT, None),
            ("This function is meant to append to a fresh list on every call, but it doesn't. What's the bug and how do you fix it?", CODING_DEBUG,
             "def add_item(item, bucket=[]):\n    bucket.append(item)\n    return bucket\n\nprint(add_item(1))\nprint(add_item(2))"),
        ],
        "node": [
            ("An Express endpoint becomes unresponsive under load because of a CPU-heavy transform. Talk me through how you'd redesign it.", CODING_SCENARIO, None),
            ("Explain your approach to retrying a flaky downstream API call without overwhelming it.", CODING_LOGIC, None),
            ("Explain the difference between synchronous and asynchronous code execution in Node, and why blocking the event loop matters.", CODING_CONCEPT, None),
            ("This route always responds before the database call finishes. What's wrong and how would you fix it?", CODING_DEBUG,
             "app.get('/users', (req, res) => {\n  let users;\n  db.query('SELECT * FROM users', (err, rows) => {\n    users = rows;\n  });\n  res.json(users);\n});"),
        ],
        "database": [
            ("A report query on a 5-million-row table takes 10 seconds. Walk me through how you'd diagnose and fix it.", CODING_SCENARIO, None),
            ("Explain your approach to safely adding a NOT NULL column to a large live table with zero downtime.", CODING_LOGIC, None),
            ("What is a database index, and what is the trade-off it introduces on writes?", CODING_CONCEPT, None),
            ("This query is meant to return customers with no orders, but it returns nothing. What's the bug?", CODING_DEBUG,
             "SELECT c.name\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.status != 'cancelled'\n  AND o.id IS NULL;"),
        ],
        "ai_ml": [
            ("Your deployed model's accuracy degrades over three months in production. Describe how you'd detect and address this.", CODING_SCENARIO, None),
            ("Explain your approach to splitting a time-series dataset for training and validation, and why the usual random split fails.", CODING_LOGIC, None),
            ("What is the difference between overfitting and underfitting, and how would you recognise each from training curves?", CODING_CONCEPT, None),
            ("This evaluation reports suspiciously high accuracy. What's the bug and why does it inflate the score?", CODING_DEBUG,
             "X_scaled = scaler.fit_transform(X)\nX_train, X_test, y_train, y_test = train_test_split(X_scaled, y)\nmodel.fit(X_train, y_train)\nprint(model.score(X_test, y_test))"),
        ],
    }

    @staticmethod
    def _resume_anchors(resume_profile):
        """The skills and projects a resume-driven question is allowed to cite, longest
        first so 'React Native' is preferred over 'React' when both would match."""
        if not resume_profile:
            return []
        anchors = []
        for key in ('projects', 'skills'):
            for entry in (resume_profile.get(key) or []):
                text = str(entry).strip()
                if text:
                    anchors.append(text)
        return sorted(anchors, key=len, reverse=True)

    @classmethod
    def _verify_derived_from(cls, claimed, anchors):
        """Tie a generated question back to a real line of the resume, or to nothing.

        The whole point of the traceability field is catching a generator that has drifted
        off the CV, so an unchecked string copied straight from the model would defeat it —
        it would look traceable precisely when it is not. A claim that matches no skill and
        no project becomes None, which the Admin Hub renders as "not traceable to the
        resume" rather than quietly showing whatever the model wrote.

        Matching is substring-based in both directions so honest near-misses survive
        ('React.js' against a resume that says 'React'), while an invented topic does not.
        """
        claim = (claimed or '').strip()
        if not claim or not anchors:
            return None
        needle = claim.lower()
        for anchor in anchors:
            hay = anchor.lower()
            if needle in hay or hay in needle:
                return anchor[:255]
        return None

    @classmethod
    def generate_questions(cls, interview_type, job_role, experience_level, difficulty,
                           num_questions, custom_jd=None, custom_skills=None, resume_profile=None,
                           allowed_difficulties=None, curriculum_context=None):
        import uuid
        jd_mode = bool(custom_jd and len(custom_jd.strip()) >= 30)
        instructor_mode = (interview_type == 'instructor')
        # Resume-Based Interview (Resume §3.3): questions come from this candidate's own
        # skills and projects rather than from a domain or a pasted JD. Checked before
        # jd_mode because the two are mutually exclusive — this flow never has a JD.
        resume_mode = bool(resume_profile and cls._resume_anchors(resume_profile))

        if resume_mode:
            anchors = cls._resume_anchors(resume_profile)
            skills = [str(s).strip() for s in (resume_profile.get('skills') or []) if str(s).strip()]
            projects = [str(p).strip() for p in (resume_profile.get('projects') or []) if str(p).strip()]

            resume_system = (
                "You are an experienced technical interviewer who has just read this candidate's "
                "resume and is interviewing them about their own work. Return ONLY a JSON object of "
                'the form {"questions": [{"question_text": string, "question_type": string, '
                '"code_snippet": string, "derived_from": string}]} '
                f"containing EXACTLY {num_questions} questions. "
                "'question_type' must be one of: 'conceptual', 'scenario', 'behavioral', "
                "'coding_scenario', 'coding_logic', 'coding_concept', 'coding_debug'. "
                "'derived_from' MUST be copied VERBATIM from the skills or projects list you are "
                "given — it names the resume entry the question came from. Never write a "
                "'derived_from' value that is not in those lists. "
                "GROUNDING RULE: every question must be answerable only by someone who actually did "
                "the work on this resume. Ask about THEIR listed projects and THEIR listed "
                "technologies — the decisions they made, what broke, what they would change. Do not "
                "ask generic role-based questions that any candidate could answer, and never "
                "reference a technology or project that is not in the lists below. "
                "Answers are spoken aloud, so ask them to explain and reason; do not require them to "
                "type out full code. "
                "For 'coding_debug' ONLY, put a SHORT buggy snippet in 'code_snippet' (plain code, no "
                "markdown fences) and keep 'question_text' as the spoken prompt with NO code in it. "
                "Leave 'code_snippet' as an empty string for every other question type."
            )
            resume_user = (
                f"Generate exactly {num_questions} interview questions for this candidate. "
                f"Experience level: {experience_level}. Difficulty: {difficulty}.\n\n"
                f"PROJECTS THEY BUILT:\n"
                + ("\n".join(f"- {p}" for p in projects[:12]) if projects else "- (none listed)")
                + f"\n\nSKILLS AND TECHNOLOGIES ON THEIR RESUME:\n"
                + ("\n".join(f"- {s}" for s in skills[:25]) if skills else "- (none listed)")
                + "\n\nWeight the set towards their projects — at least half the questions should "
                  "be about something they specifically built. "
                  f"Make the set fresh and non-repetitive (variation id: {str(uuid.uuid4())[:8]})."
            )

            api_result = cls._call_llm(resume_system, resume_user, temperature=0.5)
            if api_result and isinstance(api_result.get('questions'), list) and api_result['questions']:
                cleaned = []
                for q in api_result['questions'][:num_questions]:
                    text = (q.get('question_text') or '').strip() if isinstance(q, dict) else ''
                    if not text:
                        continue
                    q_type = q.get('question_type', 'conceptual') if isinstance(q, dict) else 'conceptual'
                    if q_type not in cls.ALLOWED_QUESTION_TYPES:
                        q_type = 'conceptual'
                    snippet = (q.get('code_snippet') or '').strip() if isinstance(q, dict) else ''
                    if snippet:
                        snippet = re.sub(r'^```[a-zA-Z]*\n?', '', snippet)
                        snippet = re.sub(r'\n?```$', '', snippet).strip()
                    if q_type not in CODING_FORMATS_WITH_SNIPPET:
                        snippet = ''
                    if q_type == CODING_DEBUG and not snippet:
                        q_type = CODING_CONCEPT
                    cleaned.append({
                        'question_text': text,
                        'question_type': q_type,
                        'code_snippet': snippet or None,
                        'derived_from': cls._verify_derived_from(
                            q.get('derived_from') if isinstance(q, dict) else None, anchors
                        ),
                        'order_num': len(cleaned) + 1,
                    })
                if cleaned:
                    return cleaned

            return cls._generate_mock_resume_questions(resume_profile, num_questions, experience_level)

        # Instructor interviews assess teaching competency, not candidate-level technical
        # depth (Update §3). Distinct prompt + question bank; same scoring/report pipeline.
        if instructor_mode:
            instructor_system = (
                "You are an experienced academic hiring panellist interviewing a candidate for an "
                "INSTRUCTOR / TEACHER role at a technical bootcamp. Return ONLY a JSON object of the form "
                '{"questions": [{"question_text": string, "question_type": string}]} '
                f"containing EXACTLY {num_questions} questions. "
                "'question_type' must be one of: 'conceptual', 'scenario', 'behavioral', 'hr'. "
                "Assess TEACHING COMPETENCY: curriculum design, ability to explain complex ideas simply, "
                "classroom management, student assessment, mentoring, handling mixed skill levels, and "
                "staying industry-relevant — NOT candidate-level coding trivia. "
                "Answers are spoken aloud, so ask them to explain and reason."
            )
            instructor_user = (
                f"Generate exactly {num_questions} interview questions to evaluate this person's ability to "
                f"TEACH and mentor in their subject area. Keep them open-ended and reflective. "
                f"Make the set fresh and non-repetitive (variation id: {str(uuid.uuid4())[:8]})."
            )
            api_result = cls._call_llm(instructor_system, instructor_user, temperature=0.6)
            if api_result and isinstance(api_result.get('questions'), list) and api_result['questions']:
                cleaned = []
                for q in api_result['questions'][:num_questions]:
                    text = (q.get('question_text') or '').strip() if isinstance(q, dict) else ''
                    if not text:
                        continue
                    q_type = q.get('question_type', 'conceptual') if isinstance(q, dict) else 'conceptual'
                    if q_type not in cls.ALLOWED_QUESTION_TYPES:
                        q_type = 'conceptual'
                    cleaned.append({
                        'question_text': text, 'question_type': q_type,
                        'code_snippet': None, 'order_num': len(cleaned) + 1
                    })
                if cleaned:
                    return cleaned
            # Offline / fallback: deterministic instructor competency set.
            picks = cls.INSTRUCTOR_QUESTIONS[:num_questions]
            return [
                {'question_text': t, 'question_type': qt, 'code_snippet': None, 'order_num': i + 1}
                for i, (t, qt) in enumerate(picks)
            ]

        system_prompt = (
            "You are an expert interviewer building a real, credible interview. "
            "Return ONLY a JSON object of the form "
            '{"questions": [{"question_text": string, "question_type": string, "code_snippet": string}]} '
            f"containing EXACTLY {num_questions} questions. "
            "'question_type' must be one of: 'conceptual', 'scenario', 'behavioral', 'hr', "
            "'coding_scenario', 'coding_logic', 'coding_concept', 'coding_debug'. "
            "STRICT DOMAIN LOCK: every question MUST be directly relevant to the specified role/domain; "
            "never include questions from an unrelated domain (e.g. no React questions in a Data Science "
            "interview). Favour specific technical depth — syntax, architecture, performance, trade-offs, "
            "and realistic scenarios — over generic filler. "
            "Answers are spoken aloud, so ask the candidate to explain and reason; do not require them to "
            "type out full code. "
            "CODING QUESTION FORMATS — include a VARIED MIX, never the same coding format twice in a row: "
            "'coding_scenario' = a realistic problem where they talk through the solution they would build; "
            "'coding_logic' = give a problem and ask them to explain their approach/algorithm and why; "
            "'coding_concept' = a direct conceptual question (e.g. complexity, sync vs async, data structures); "
            "'coding_debug' = show a SHORT buggy snippet and ask them to identify the bug and explain the fix. "
            "For 'coding_debug' ONLY, put the buggy code in the separate 'code_snippet' field (plain code, no "
            "markdown fences) and keep 'question_text' as the spoken prompt with NO code in it, because "
            "question_text is read aloud to the candidate. Leave 'code_snippet' as an empty string for every "
            "other question type."
        )
        if curriculum_context:
            # Curriculum feature: this candidate's category maps to an imported SMIT course
            # (app/utils/curriculum.py). The curriculum text itself is appended to the user
            # prompt below; this is the hard rule governing how the model must treat it.
            system_prompt += (
                " CURRICULUM LOCK: an approved curriculum is supplied below. Every question must "
                "stay within the topics/modules it names — never ask about a technology, "
                "framework, or concept outside that curriculum, and never claim something is part "
                "of the curriculum unless it actually appears there. Spread questions across "
                "DIFFERENT modules rather than clustering them in one, and never ask the same or a "
                "near-duplicate question twice."
            )

        if jd_mode:
            user_prompt = (
                f"Build an interview from the JOB DESCRIPTION below. First internally extract the key "
                f"skills, technologies, responsibilities, and seniority level it implies, then generate "
                f"exactly {num_questions} questions that strictly target those extracted requirements. "
                f"If the JD is vague or very short, produce a best-effort set anchored to the role title "
                f"'{job_role}'. Difficulty: {difficulty}. Experience level: {experience_level}. "
                f"Interview focus: {interview_type}. "
            )
            if custom_skills:
                user_prompt += f"Especially emphasise these required skills: {custom_skills}. "
            user_prompt += f"\n\nJOB DESCRIPTION:\n{custom_jd.strip()[:4000]}"
        else:
            focus_map = {
                'technical': f"a technical interview for a {job_role}",
                'hr': f"an HR / workplace-fit interview for a {job_role} candidate",
                'behavioral': f"a STAR-format behavioral interview for a {job_role} candidate",
            }
            focus = focus_map.get(interview_type, f"an interview for a {job_role}")
            user_prompt = (
                f"Generate exactly {num_questions} questions for {focus}. "
                f"Domain/role to stay strictly within: {job_role}. "
                f"Difficulty: {difficulty}. Experience level: {experience_level}. "
            )
            if custom_skills:
                user_prompt += f"Target these specific skills: {custom_skills}. "
            user_prompt += f"Make the set fresh and non-repetitive (variation id: {str(uuid.uuid4())[:8]})."
            if curriculum_context:
                user_prompt += f"\n\n{curriculum_context}"

        api_result = cls._call_llm(system_prompt, user_prompt, temperature=0.5)
        if api_result and isinstance(api_result.get('questions'), list) and api_result['questions']:
            cleaned = []
            for idx, q in enumerate(api_result['questions'][:num_questions]):
                text = (q.get('question_text') or '').strip() if isinstance(q, dict) else ''
                if not text:
                    continue
                q_type = q.get('question_type', 'conceptual') if isinstance(q, dict) else 'conceptual'
                if q_type not in cls.ALLOWED_QUESTION_TYPES:
                    q_type = 'conceptual'
                snippet = (q.get('code_snippet') or '').strip() if isinstance(q, dict) else ''
                # Only debugging questions carry a snippet; strip stray markdown fences and
                # drop snippets attached to non-debug types so nothing odd renders.
                if snippet:
                    snippet = re.sub(r'^```[a-zA-Z]*\n?', '', snippet)
                    snippet = re.sub(r'\n?```$', '', snippet).strip()
                if q_type not in CODING_FORMATS_WITH_SNIPPET:
                    snippet = ''
                # A debugging question with no snippet is unusable as a "find the bug"
                # prompt — demote it to a plain conceptual coding question instead.
                if q_type == CODING_DEBUG and not snippet:
                    q_type = CODING_CONCEPT
                cleaned.append({
                    'question_text': text,
                    'question_type': q_type,
                    'code_snippet': snippet or None,
                    'order_num': len(cleaned) + 1
                })
            if cleaned:
                return cleaned

        # Fallback Mock Question Generator (domain-aware)
        return cls._generate_mock_questions(interview_type, job_role, experience_level, difficulty, num_questions, custom_jd, allowed_difficulties)

    @classmethod
    def generate_mcqs(cls, job_role, experience_level, difficulty, num_mcqs=10):
        """Generate the MCQ round (§ MCQ round): single-select, 4 options each.

        Returns a list of {"question_text", "options": [4 strings], "correct_index"}.
        Same LLM-then-deterministic-fallback shape as generate_questions above, so a down
        API never blocks the interview — it just falls back to a small generic bank.
        """
        import uuid
        # MCQs are always generated at HARD difficulty, regardless of whatever difficulty the
        # main interview questions were created at (the `difficulty` argument is still accepted
        # for the caller's convenience, but deliberately not used below) — a direct product
        # decision that the quiz round should stay genuinely challenging for every candidate,
        # not scale down to "easy"/beginner-style questions.
        system_prompt = (
            "You are an expert technical interviewer writing a HARD, challenging multiple-choice "
            "quiz round for experienced engineers — not an introductory or beginner-friendly quiz. "
            "Return ONLY a JSON object of the form "
            '{"questions": [{"question_text": string, "options": [string, string, string, string], '
            '"correct_index": integer}]} '
            f"containing EXACTLY {num_mcqs} questions. "
            "Each question must have EXACTLY 4 options, single-select, with exactly one correct answer "
            "identified by 'correct_index' (0-3, zero-based). "
            "STRICT DOMAIN LOCK: every question MUST be directly relevant to the specified role/domain. "
            "Keep questions and options short — this is read on screen with a 1-minute timer per question, "
            "not spoken aloud. Favour concrete technical recall (syntax, definitions, behavior, complexity) "
            "over open-ended judgment calls, since MCQs need one unambiguous correct answer. "
            "DIFFICULTY BAR: every question must be genuinely hard — edge cases, subtle behavior "
            "differences, tricky gotchas, advanced language/framework internals, or non-obvious "
            "complexity/performance tradeoffs. Do NOT write basic definitional or 'textbook glossary' "
            "questions (e.g. plain 'what does X stand for' or 'what is a variable') — assume the "
            "candidate already knows the fundamentals, and test what separates a strong senior "
            "engineer from an average one. At least one plausible-looking wrong option per question "
            "should require real understanding to rule out, not just careless elimination."
        )
        user_prompt = (
            f"Generate exactly {num_mcqs} HARD, advanced-level multiple-choice questions for a "
            f"technical assessment for the role: {job_role} ({experience_level} level candidate, "
            "but the quiz itself must stay hard regardless of that level). "
            f"Make the set fresh and non-repetitive (variation id: {str(uuid.uuid4())[:8]})."
        )

        api_result = cls._call_llm(system_prompt, user_prompt, temperature=0.5)
        if api_result and isinstance(api_result.get('questions'), list) and api_result['questions']:
            cleaned = []
            for q in api_result['questions'][:num_mcqs]:
                if not isinstance(q, dict):
                    continue
                text = (q.get('question_text') or '').strip()
                options = q.get('options')
                if not text or not isinstance(options, list) or len(options) != 4:
                    continue
                options = [str(o).strip() for o in options]
                if any(not o for o in options):
                    continue
                try:
                    correct_index = int(q.get('correct_index'))
                except (TypeError, ValueError):
                    continue
                if correct_index not in (0, 1, 2, 3):
                    continue
                cleaned.append({
                    'question_text': text,
                    'options': options,
                    'correct_index': correct_index,
                })
            if len(cleaned) >= num_mcqs:
                return cleaned[:num_mcqs]

        # Offline / fallback: small generic technical MCQ bank, cycled/truncated to length.
        # Not role-aware (unlike _generate_mock_questions' large per-role library) — this is
        # a safety net for when the LLM is unreachable, not the primary path.
        fallback_bank = [
            {
                'question_text': 'Which data structure uses First-In-First-Out (FIFO) ordering?',
                'options': ['Stack', 'Queue', 'Binary Tree', 'Hash Map'],
                'correct_index': 1,
            },
            {
                'question_text': 'What is the time complexity of binary search on a sorted array of n elements?',
                'options': ['O(n)', 'O(n log n)', 'O(log n)', 'O(1)'],
                'correct_index': 2,
            },
            {
                'question_text': 'In HTTP, which status code indicates a successful request?',
                'options': ['404', '500', '301', '200'],
                'correct_index': 3,
            },
            {
                'question_text': 'Which of these is NOT a core principle of object-oriented programming?',
                'options': ['Encapsulation', 'Inheritance', 'Normalization', 'Polymorphism'],
                'correct_index': 2,
            },
            {
                'question_text': 'What does SQL\'s "JOIN" clause primarily do?',
                'options': [
                    'Deletes rows from a table',
                    'Combines rows from two or more tables based on a related column',
                    'Creates a new database',
                    'Sorts a result set',
                ],
                'correct_index': 1,
            },
            {
                'question_text': 'Which HTTP method is idempotent by design?',
                'options': ['POST', 'PUT', 'PATCH', 'CONNECT'],
                'correct_index': 1,
            },
            {
                'question_text': 'What is the primary purpose of version control systems like Git?',
                'options': [
                    'Compiling source code',
                    'Tracking and managing changes to code over time',
                    'Running automated tests',
                    'Deploying applications to production',
                ],
                'correct_index': 1,
            },
            {
                'question_text': 'Which of the following best describes a race condition?',
                'options': [
                    'A syntax error caught at compile time',
                    'Two or more threads accessing shared data with an unpredictable outcome',
                    'A network request that times out',
                    'A database index that is out of date',
                ],
                'correct_index': 1,
            },
            {
                'question_text': 'In REST API design, which HTTP method is typically used to partially update a resource?',
                'options': ['GET', 'PATCH', 'DELETE', 'OPTIONS'],
                'correct_index': 1,
            },
            {
                'question_text': 'What is the main benefit of using an index on a frequently queried database column?',
                'options': [
                    'It reduces the table\'s storage size',
                    'It speeds up read queries at some cost to write speed',
                    'It enforces uniqueness automatically',
                    'It encrypts the column\'s data',
                ],
                'correct_index': 1,
            },
        ]
        return (fallback_bank * ((num_mcqs // len(fallback_bank)) + 1))[:num_mcqs]

    @staticmethod
    def _clamp_score(value, default=0.0):
        try:
            return max(0.0, min(float(value), 100.0))
        except (TypeError, ValueError):
            return default

    @classmethod
    def _normalize_evaluation(cls, result):
        def as_list(v):
            if isinstance(v, list):
                return [str(x).strip() for x in v if str(x).strip()]
            if v:
                return [str(v).strip()]
            return []

        confidence = cls._clamp_score(result.get('confidence_score', 60), 60.0)
        return {
            'score': cls._clamp_score(result.get('score')),
            'technical_score': cls._clamp_score(result.get('technical_score')),
            'communication_score': cls._clamp_score(result.get('communication_score')),
            'confidence_score': confidence,
            'feedback': str(result.get('feedback', '')).strip() or 'No rationale was provided.',
            'strengths': as_list(result.get('strengths')),
            'weaknesses': as_list(result.get('weaknesses')),
            # Flag low-confidence evaluations so admins can review them (§2.3 / §7).
            'needs_manual_review': confidence < 40
        }

    @staticmethod
    def _fallback_evaluation():
        """Used only when the LLM is unavailable. Never fabricates a correctness score
        via keyword matching; instead applies a neutral placeholder and flags the answer
        for manual review so a transient failure can't unfairly zero out a candidate."""
        return {
            'score': 50.0,
            'technical_score': 50.0,
            'communication_score': 50.0,
            'confidence_score': 0.0,
            'feedback': (
                "Automated evaluation was temporarily unavailable, so this answer has been "
                "flagged for manual review. The placeholder score is not final."
            ),
            'strengths': [],
            'weaknesses': [],
            'needs_manual_review': True
        }

    # What the evaluator should focus on for each coding format (§2.4). All four are
    # scored through this verbal transcript -> LLM pipeline; only the rubric differs.
    CODING_FORMAT_RUBRICS = {
        CODING_SCENARIO: (
            "This is a SCENARIO-BASED coding question answered verbally. Judge the solution design: "
            "whether their approach actually solves the stated problem, the data structures and "
            "trade-offs they choose, and how they handle scale and edge cases. Do NOT penalise them "
            "for not dictating literal syntax."
        ),
        CODING_LOGIC: (
            "This is a LOGIC/APPROACH question. Score their problem-solving reasoning and algorithm "
            "choice — correctness of the approach, complexity awareness, and edge-case handling. "
            "Writing no code is EXPECTED here; never penalise the absence of code."
        ),
        CODING_CONCEPT: (
            "This is a DIRECT CONCEPTUAL question. Score factual correctness and the clarity of the "
            "explanation, including the 'why' behind it. A correct, well-explained short answer "
            "deserves a high score — do not require extra length."
        ),
        CODING_DEBUG: (
            "This is a DEBUGGING question: the candidate was shown a buggy code snippet. Score "
            "primarily on whether they correctly IDENTIFIED the actual bug, and secondarily on "
            "whether their proposed fix is correct and they can explain why the bug occurs. If they "
            "identify the wrong cause, score low even if the answer sounds confident."
        ),
    }

    @classmethod
    def evaluate_response(cls, question_text, response_text, job_role=None, difficulty=None,
                          question_type=None, code_snippet=None):
        answer = (response_text or '').strip()

        # A genuinely empty answer scores 0 without any model call (length-based, not
        # keyword-based). Refusals/gibberish are judged by the LLM below.
        if len(answer) < 2:
            return {
                'score': 0.0, 'technical_score': 0.0, 'communication_score': 0.0,
                'confidence_score': 100.0,
                'feedback': 'No answer was provided for this question.',
                'strengths': [], 'weaknesses': ['No response was given.'],
                'needs_manual_review': False
            }

        context_bits = []
        if job_role:
            context_bits.append(f"Role/Domain: {job_role}")
        if difficulty:
            context_bits.append(f"Difficulty: {difficulty}")
        if question_type:
            context_bits.append(f"Question type: {question_type}")
        context = " | ".join(context_bits) if context_bits else "General technical interview"

        system_prompt = (
            "You are an expert technical interviewer scoring a candidate's spoken answer. "
            "First, internally formulate the ideal expert answer to the question for the given role "
            "and difficulty. Then compare the candidate's answer against it on technical correctness, "
            "completeness, clarity, and relevance. Judge the SUBSTANCE of the answer, never merely the "
            "presence of specific keywords. "
            "The answer is a speech-to-text transcript, so tolerate minor transcription noise, filler "
            "words, and phonetic errors, and do not penalise those. "
            "If the answer is a refusal ('I don't know'), gibberish, or unrelated to the question, "
            "score it 0 and say why. Do not award points for mere effort or politeness. "
            + (cls.CODING_FORMAT_RUBRICS.get(question_type, '') and
               " " + cls.CODING_FORMAT_RUBRICS[question_type] + " ") +
            "Return ONLY a JSON object with keys: 'score' (0-100 overall), 'technical_score' (0-100), "
            "'communication_score' (0-100), 'confidence_score' (0-100 = how confident YOU are in this "
            "evaluation), 'feedback' (2-4 sentence rationale citing what was correct or missing versus "
            "the ideal answer), 'strengths' (list of short strings), 'weaknesses' (list of short strings)."
        )
        snippet_block = f"\n\nCode snippet shown to the candidate:\n{code_snippet}\n" if code_snippet else ""
        user_prompt = (
            f"Context: {context}\n\n"
            f"Question: {question_text}{snippet_block}\n\n"
            f"Candidate's transcribed answer: {answer}\n\n"
            "Evaluate it now."
        )

        result = cls._call_llm(system_prompt, user_prompt, temperature=0.2)
        if result is not None and all(
            k in result for k in ('score', 'technical_score', 'communication_score', 'confidence_score', 'feedback')
        ):
            return cls._normalize_evaluation(result)

        # LLM unavailable after retries -> safe manual-review fallback (no keyword scoring).
        return cls._fallback_evaluation()

    @classmethod
    def generate_report(cls, interview_type, job_role, qas):
        # qas is list of dicts: {'question': str, 'answer': str, 'evaluation': dict}
        system_prompt = (
            "You are a career consultant generating a candidate assessment report. "
            "You must return a JSON object with keys: "
            "'overall_score' (0-100), 'technical_score' (0-100), 'communication_score' (0-100), "
            "'confidence_score' (0-100), 'problem_solving_score' (0-100), "
            "'strengths' (list of strings), 'weaknesses' (list of strings), "
            "'missing_concepts' (string list or text), 'recommendations' (string list or text)."
        )

        user_prompt = f"Interview Type: {interview_type}\nJob Role: {job_role}\nInterview Q&A:\n"
        for idx, qa in enumerate(qas):
            user_prompt += f"Q{idx+1}: {qa['question']}\nA{idx+1}: {qa['answer']}\nEval: {json.dumps(qa['evaluation'])}\n"

        api_result = cls._call_llm(system_prompt, user_prompt)
        if api_result and all(k in api_result for k in ['overall_score', 'technical_score', 'strengths', 'weaknesses']):
            return api_result

        # Fallback Mock Report
        return cls._generate_mock_report(qas)

    @classmethod
    def analyze_resume(cls, resume_text):
        system_prompt = (
            "You are an ATS (Applicant Tracking System) resume analyzer. "
            "Analyze the resume and return a JSON object with these keys: "
            "'extracted_skills' (list of strings), 'extracted_experience' (list of strings/bullet points), "
            "'extracted_education' (list of strings), 'extracted_projects' (list of strings), "
            "'missing_skills' (list of strings), "
            "'resume_score' (0-100), and 'suggestions' (list of strings). "
            # Projects are pulled out separately because the Resume-Based Interview asks the
            # candidate about specific things they built. Blended into the experience bullets
            # they cannot be addressed individually, and a question generator handed a mixed
            # list tends to ask about the employer rather than the work.
            "For 'extracted_projects', list the candidate's named projects — one entry per "
            "project, each as 'Project name — what it does and the technologies used'. Include "
            "personal, academic and open-source projects, not just employed work. Return an "
            "empty list if the resume genuinely names no projects; never invent one."
        )

        user_prompt = f"Resume Text:\n{resume_text}"

        api_result = cls._call_llm(system_prompt, user_prompt)
        if api_result and all(k in api_result for k in ['extracted_skills', 'resume_score', 'suggestions']):
            return cls._normalize_resume_analysis(api_result)

        # Fallback Mock Resume Analysis
        return cls._generate_mock_resume_analysis(resume_text)

    # The resume list fields are persisted into TEXT columns and the client JSON.parse()s
    # them, so they must ALWAYS leave this service as JSON strings. The mock path already
    # json.dumps() them; the live LLM returns real Python lists, which used to be written to
    # the column raw and read back as a str(list) — "['React', 'Node']" with single quotes —
    # which is not valid JSON, so the client's JSON.parse threw and blanked the page.
    # Normalising here keeps both paths identical and is the single source of truth.
    _RESUME_LIST_FIELDS = (
        'extracted_skills', 'extracted_experience',
        'extracted_education', 'extracted_projects', 'missing_skills', 'suggestions',
    )

    @classmethod
    def _normalize_resume_analysis(cls, result):
        normalized = dict(result)

        for field in cls._RESUME_LIST_FIELDS:
            value = normalized.get(field)

            if isinstance(value, str):
                # Already a string: keep it only if it really is JSON, otherwise wrap the
                # plain text as a single-item list so the client always gets an array.
                try:
                    parsed = json.loads(value)
                    normalized[field] = json.dumps(parsed if isinstance(parsed, list) else [parsed])
                except (ValueError, TypeError):
                    normalized[field] = json.dumps([value] if value.strip() else [])
            elif isinstance(value, list):
                normalized[field] = json.dumps([str(v) for v in value])
            elif value is None:
                normalized[field] = json.dumps([])
            else:
                normalized[field] = json.dumps([str(value)])

        try:
            normalized['resume_score'] = max(0, min(int(float(normalized.get('resume_score', 0))), 100))
        except (TypeError, ValueError):
            normalized['resume_score'] = 0

        return normalized

    @classmethod
    def analyze_jd(cls, jd_text):
        system_prompt = (
            "You are an ATS job description parser. "
            "Extract requirements and skills from the JD. Return a JSON object with keys: "
            "'extracted_requirements' (list of strings), 'extracted_skills' (list of strings)."
        )

        user_prompt = f"Job Description:\n{jd_text}"

        api_result = cls._call_llm(system_prompt, user_prompt)
        if api_result and all(k in api_result for k in ['extracted_requirements', 'extracted_skills']):
            return api_result

        # Fallback Mock JD Analysis
        return cls._generate_mock_jd_analysis(jd_text)

    # --- MOCK GENERATION HELPERS ---

    # Offline question shapes for the Resume-Based category. Each is a real interview
    # question once a project or skill is substituted in, so the mock path produces a
    # usable interview about THIS candidate rather than generic filler — the whole
    # category is meaningless if the fallback asks about nothing they wrote down.
    _RESUME_PROJECT_TEMPLATES = (
        ("Walk me through {anchor}. What was the problem it solved, and what did you build?", 'scenario'),
        ("On {anchor}, what was the hardest technical decision you had to make, and what "
         "made you settle on the option you chose?", 'coding_scenario'),
        ("If you were rebuilding {anchor} today, what would you do differently and why?", 'conceptual'),
        ("Describe something that broke or did not work as expected in {anchor}, and how "
         "you tracked it down.", 'behavioral'),
        ("How would you scale {anchor} to handle roughly ten times its current load? Talk "
         "through where it would strain first.", 'coding_logic'),
    )
    _RESUME_SKILL_TEMPLATES = (
        ("Your resume lists {anchor}. Explain how you have actually used it and what you "
         "understand about how it works underneath.", 'coding_concept'),
        ("Where does {anchor} stop being the right tool, and what would you reach for instead?", 'conceptual'),
        ("Talk me through how you would debug a performance problem in something built "
         "with {anchor}.", 'coding_logic'),
    )

    @classmethod
    def _generate_mock_resume_questions(cls, resume_profile, num_questions, experience_level=None):
        """Deterministic Resume-Based question set for AI_MODE=mock or an unreachable LLM.

        Projects are drawn from first and alternated with skills, matching the live prompt's
        instruction to weight the set towards what the candidate actually built.
        """
        projects = [str(p).strip() for p in ((resume_profile or {}).get('projects') or []) if str(p).strip()]
        skills = [str(s).strip() for s in ((resume_profile or {}).get('skills') or []) if str(s).strip()]

        questions = []

        def add(anchor, template, q_type):
            # A whole project bullet reads badly mid-sentence; the leading name is the part
            # that identifies it to the candidate. Resumes separate the name from the blurb
            # with a dash or a colon, and the LLM path is asked for the dash form.
            label = anchor
            for sep in ('—', '–', ' - ', ':'):
                label = label.split(sep)[0]
            label = label.strip() or anchor
            questions.append({
                'question_text': template.format(anchor=label[:120]),
                'question_type': q_type,
                'code_snippet': None,
                'derived_from': anchor[:255],
                'order_num': len(questions) + 1,
            })

        p_i = s_i = 0
        while len(questions) < num_questions and (projects or skills):
            # 2:1 towards projects, so a candidate with plenty of both is asked mostly
            # about their own work rather than about their tech list.
            use_project = projects and (not skills or len(questions) % 3 != 2)
            if use_project:
                anchor = projects[p_i % len(projects)]
                template, q_type = cls._RESUME_PROJECT_TEMPLATES[p_i % len(cls._RESUME_PROJECT_TEMPLATES)]
                p_i += 1
            else:
                anchor = skills[s_i % len(skills)]
                template, q_type = cls._RESUME_SKILL_TEMPLATES[s_i % len(cls._RESUME_SKILL_TEMPLATES)]
                s_i += 1
            add(anchor, template, q_type)

        # A resume with neither projects nor skills should not reach here (resume_mode is
        # gated on having anchors), but never hand back an empty interview.
        if not questions:
            return cls._generate_mock_questions(
                'technical', 'Software Engineer', experience_level or 'Entry', 'Medium', num_questions, None
            )

        return questions[:num_questions]


    @classmethod
    def _generate_mock_questions(cls, interview_type, job_role, experience_level, difficulty, num_questions, custom_jd,
                                  allowed_difficulties=None):
        """``allowed_difficulties`` (Difficulty Range feature): an ordered low->high list
        (e.g. ['Easy', 'Medium']) to restrict this offline pool to, same as the coding
        sandbox's own filter. Entries written before per-question difficulty tagging existed
        carry no 4th tuple element and are always eligible — untagged content never becomes
        unreachable just because a range was set. None means no restriction (today's
        behavior, and every interview type besides 'technical'/'hr'/'behavioral')."""
        mock_library = {
            "technical": {
                "react": [
                    ("What is the difference between Virtual DOM and Real DOM, and how does React reconcile changes?", "conceptual"),
                    ("Explain the React component lifecycle. How do hooks like useEffect map to these stages?", "conceptual"),
                    ("You are experiencing performance lag in a list of 10,000 items. How would you optimize this in React?", "scenario"),
                    ("Explain state management in React. When would you prefer Context API over Redux?", "conceptual"),
                    ("Write a custom React hook `useDebounce` that delays updating a value until a user stops typing.", "coding"),
                    ("Explain the concept of React.memo. When should you avoid using it?", "conceptual"),
                    ("What is React reconciliation? Explain Fiber nodes and the diffing algorithm.", "conceptual"),
                    ("How does React handle synthetic events, and what is event delegation in this context?", "conceptual"),
                    ("Write a React component that fetches data from an API on mount and handles loading and error states.", "coding"),
                    ("Explain React's Suspense and how it works with concurrent rendering.", "conceptual"),
                    ("What are Error Boundaries in React? Write a simple Error Boundary component class.", "coding"),
                    ("Explain controlled vs uncontrolled components. In which scenarios is an uncontrolled component better?", "conceptual"),
                    ("How would you virtualize a large list of dynamic elements in React without external packages?", "scenario"),
                    ("What is the difference between useMemo and useCallback? Provide a code sample showing when to use them.", "coding"),
                    ("How does React's Context API work? What are its performance limitations regarding re-renders?", "conceptual"),
                    ("Explain CSS modules vs styled-components in the context of React styling trade-offs.", "conceptual"),
                    ("What are keys in React lists, and why does using an array index as a key cause bugs when the list order changes?", "conceptual"),
                    ("Explain the difference between props and state in React with a simple example.", "conceptual"),
                    ("Write a React functional component that toggles a boolean 'isOpen' state when a button is clicked.", "coding"),
                    ("What is prop drilling, and what are two ways to avoid it in a medium-sized React app?", "conceptual"),
                    ("You need to conditionally render three different UI states (loading, error, success) from a single API call. How would you structure this in a component?", "scenario"),
                    ("Explain the purpose of the useRef hook. Give an example unrelated to accessing a DOM node.", "conceptual"),
                    ("What is a React Portal, and when would you use one (e.g. modals, tooltips)?", "conceptual"),
                    ("Write a React component that renders a list of items and highlights the one currently hovered.", "coding"),
                    ("How does React Router handle client-side navigation, and what happens to component state when you navigate away and back?", "conceptual"),
                    ("Explain the difference between React.StrictMode's development-only double-invocation behavior and what actually happens in production.", "conceptual"),
                    ("What is JSX, and why isn't it valid JavaScript on its own — what step converts it?", "conceptual", None, "Easy"),
                    ("Explain how the onClick prop differs from a plain HTML onclick attribute in React.", "conceptual", None, "Easy"),
                    ("You need to lift state up from two sibling components to a common parent. Walk through how you would refactor this.", "scenario", None, "Medium"),
                    ("Explain React's Fiber architecture and how time-slicing lets concurrent rendering interrupt a render pass.", "conceptual", None, "Hard"),
                    ("What are React fragments, and why would you use <>...</> instead of a wrapping div?", "conceptual", None, "Easy"),
                    ("Write a React component that displays a countdown timer starting from a seconds prop.", "coding", None, "Easy"),
                    ("Explain code-splitting in React with React.lazy and Suspense. What problem does it solve?", "conceptual", None, "Medium"),
                    ("Explain how React's reconciliation decides to reuse vs. remount a component when a list item's key changes vs. when its type changes.", "conceptual", None, "Hard")
                ],
                "python": [
                    ("Explain the differences between list, tuple, and set in Python. In what scenarios is a set preferred?", "conceptual"),
                    ("What are Python decorators? Write a custom decorator that measures the execution time of a function.", "coding"),
                    ("Explain Python's Global Interpreter Lock (GIL) and how it affects multi-threaded applications.", "conceptual"),
                    ("How does memory management work in Python? Explain garbage collection and reference counting.", "conceptual"),
                    ("You need to parse a 10GB log file in Python without running out of RAM. How would you accomplish this?", "scenario"),
                    ("Explain the difference between deep copy and shallow copy in Python with code examples.", "coding"),
                    ("What are Python generators? Write a generator that yields Fibonacci numbers up to a maximum limit.", "coding"),
                    ("Explain multi-threading vs multi-processing in Python. When would you use which?", "scenario"),
                    ("How does method resolution order (MRO) work in Python's multiple inheritance?", "conceptual"),
                    ("What are dunder (double underscore) methods in Python? Explain __init__, __repr__, and __call__.", "conceptual"),
                    ("How do you handle packages and dependencies in Python? Explain virtualenv, pip, and poetry.", "conceptual"),
                    ("Write a Python script that parses a directory of JSON files and aggregates a specific nested metric.", "coding"),
                    ("Explain the concept of meta-programming and metaclasses in Python.", "conceptual"),
                    ("How do you perform unit testing in Python? Contrast the unittest library with pytest.", "conceptual"),
                    ("What is type hinting in Python? How does it improve code quality, and what are its runtime limits?", "conceptual"),
                    ("What is the difference between `is` and `==` in Python? Give an example where they produce different results.", "conceptual"),
                    ("Write a Python function that removes duplicate elements from a list while preserving the original order.", "coding"),
                    ("Explain how Python's `with` statement and context managers work. Write a simple custom context manager.", "coding"),
                    ("What are list comprehensions, and when might a plain for-loop be more readable or faster?", "conceptual"),
                    ("You are given a function that occasionally raises an unhandled exception in production. How would you add robust error handling and logging around it?", "scenario"),
                    ("Explain mutable default arguments in Python functions. Why can they cause subtle bugs?", "conceptual"),
                    ("Write a Python function that flattens a nested list of arbitrary depth.", "coding"),
                    ("What is the difference between @staticmethod, @classmethod, and a regular instance method?", "conceptual"),
                    ("Explain Python's *args and **kwargs. Write a function that accepts both and forwards them to another function.", "coding"),
                    ("How would you profile a slow Python function to find out where the time is actually being spent?", "scenario"),
                    ("What is the difference between a Python module and a package?", "conceptual", None, "Easy"),
                    ("Write a Python function that checks if a number is even or odd.", "coding", None, "Easy"),
                    ("Explain Python's asyncio event loop. How does async def differ from a regular function?", "conceptual", None, "Medium"),
                    ("Explain how Python's garbage collector handles reference cycles, beyond simple reference counting.", "conceptual", None, "Hard"),
                    ("What is the difference between a Python list and a NumPy array?", "conceptual", None, "Easy"),
                    ("Write a Python function that returns the number of vowels in a string.", "coding", None, "Easy"),
                    ("Explain Python's __slots__. When would you use it, and what does it trade away?", "conceptual", None, "Medium"),
                    ("Explain how Python's asyncio event loop cooperatively schedules coroutines, and what happens if a coroutine blocks synchronously.", "conceptual", None, "Hard")
                ],
                "node": [
                    ("Explain how the Node.js event loop works and what makes it non-blocking.", "conceptual"),
                    ("How would you handle CPU-intensive tasks in Node.js without blocking the main event thread?", "scenario"),
                    ("Write a middleware function in Express that logs the request method, URL, and time taken to complete.", "coding"),
                    ("What is the difference between require() and import in Node.js? Explain ES modules.", "conceptual"),
                    ("Explain Node.js streams. Write a script that streams a large file write to client response.", "coding"),
                    ("How does clustering work in Node.js, and how does it help scale multi-core CPU architectures?", "scenario"),
                    ("Explain Node's Worker Threads. When should you use worker threads instead of child processes?", "conceptual"),
                    ("How do package locks (package-lock.json) ensure security and dependency determinism in npm?", "conceptual"),
                    ("Write a Node.js script using the HTTP module to spin up a server returning JSON data.", "coding"),
                    ("Explain Node.js error handling best practices. How do you handle uncaughtExceptions?", "scenario"),
                    ("What are Express routes and middleware? Write a custom JWT authorization middleware in Node.", "coding"),
                    ("Explain how WebSockets work in Node.js. How does it compare to standard HTTP polling?", "conceptual"),
                    ("How do you prevent SQL injection or XSS vulnerabilities in Node.js REST API systems?", "scenario"),
                    ("What is callback hell, and how do Promises or async/await help avoid it?", "conceptual"),
                    ("Write an async function using async/await that fetches data from two APIs in parallel and combines the results.", "coding"),
                    ("Explain the difference between process.nextTick(), setImmediate(), and setTimeout(fn, 0).", "conceptual"),
                    ("How would you implement rate limiting on an Express API endpoint?", "scenario"),
                    ("What is middleware in Express, and how does the next() function control the request pipeline?", "conceptual"),
                    ("Write a simple Express route that validates a request body and returns a 400 error if a required field is missing.", "coding"),
                    ("Explain environment variables and how you would manage secrets across development, staging, and production in a Node app.", "conceptual"),
                    ("What is the difference between dependencies and devDependencies in package.json?", "conceptual"),
                    ("How would you structure a Node.js REST API project (folders/layers) to keep it maintainable as it grows?", "scenario"),
                    ("Explain how Node.js handles unhandled promise rejections, and what changed about this behavior in recent Node versions.", "conceptual"),
                    ("What is npm, and what is the difference between a local and a global package install?", "conceptual", None, "Easy"),
                    ("Write an Express route handler that returns a 404 JSON response for any unmatched route.", "coding", None, "Easy"),
                    ("How would you gracefully shut down a Node.js server on SIGTERM, finishing in-flight requests first?", "scenario", None, "Medium"),
                    ("Explain how Node.js's libuv thread pool handles file system and DNS operations differently from the event loop's own I/O.", "conceptual", None, "Hard"),
                    ("What is the purpose of a .env file in a Node project, and why should it never be committed to git?", "conceptual", None, "Easy"),
                    ("Write a Node.js function that reads a JSON file and returns its parsed contents, using async/await.", "coding", None, "Easy"),
                    ("Explain the difference between dependencies installed with --save vs --save-dev, and how that affects a production build.", "conceptual", None, "Medium"),
                    ("Explain backpressure in Node.js streams - what happens if a writable stream can't keep up with a readable stream piping into it, and how do you handle it?", "conceptual", None, "Hard")
                ],
                "database": [
                    ("What are database indexes? How do they improve query speeds, and what is the write penalty?", "conceptual"),
                    ("Explain database transaction isolation levels (Read Uncommitted, Read Committed, Repeatable Read, Serializable).", "conceptual"),
                    ("You have a query that takes 10 seconds to execute on a table with 5 million rows. How would you debug and fix it?", "scenario"),
                    ("What is database normalization? Explain 1NF, 2NF, and 3NF with examples.", "conceptual"),
                    ("Explain the difference between SQL and NoSQL databases. In which scenarios is MongoDB preferred over PostgreSQL?", "conceptual"),
                    ("What are database foreign keys, and how do they enforce referential integrity?", "conceptual"),
                    ("What is connection pooling? Why is it crucial for scaling database interactions under heavy traffic?", "scenario"),
                    ("Explain ACID compliance in databases. What does each letter stand for?", "conceptual"),
                    ("Write a complex SQL query utilizing JOIN, GROUP BY, and HAVING to fetch high-performing employees.", "coding"),
                    ("Explain Database Sharding vs Replication. What are the read/write scaling differences?", "scenario"),
                    ("What is the CAP Theorem? Explain the trade-offs between Consistency, Availability, and Partition tolerance.", "conceptual"),
                    ("Write an SQL query to retrieve the second highest salary from an Employee table.", "coding"),
                    ("How do you handle database migrations safely in a production environment with zero downtime?", "scenario"),
                    ("What is the difference between a clustered and a non-clustered index?", "conceptual"),
                    ("Write an SQL query to find all customers who have never placed an order, given a customers and an orders table.", "coding"),
                    ("Explain the N+1 query problem and how you would fix it in an application using an ORM.", "scenario"),
                    ("What is a database view, and when is a materialized view preferable to a regular view?", "conceptual"),
                    ("Explain optimistic vs pessimistic locking in a database. Give a scenario where each is appropriate.", "conceptual"),
                    ("Write an SQL query using a window function (e.g. RANK) to find the top 3 highest-paid employees per department.", "coding"),
                    ("What is denormalization, and why might you deliberately introduce redundancy into a schema?", "conceptual"),
                    ("How would you design a database schema for a many-to-many relationship, such as students and courses?", "scenario"),
                    ("Explain the difference between a primary key and a unique key/constraint.", "conceptual"),
                    ("What is a deadlock in a database, and how would you detect and resolve one in production?", "scenario"),
                    ("What is a foreign key constraint, and what happens if you try to insert a row that violates it?", "conceptual", None, "Easy"),
                    ("Write an SQL query to count how many orders each customer has placed.", "coding", None, "Easy"),
                    ("Explain the difference between INNER JOIN, LEFT JOIN, and FULL OUTER JOIN with a short example.", "conceptual", None, "Medium"),
                    ("Explain how a query planner decides between a sequential scan and an index scan, and when its choice can go wrong.", "conceptual", None, "Hard"),
                    ("What is a composite primary key, and when would you use one instead of a single-column key?", "conceptual", None, "Easy"),
                    ("Write an SQL query to find the average salary per department.", "coding", None, "Easy"),
                    ("Explain database replication lag. Why might a read from a replica return stale data?", "conceptual", None, "Medium"),
                    ("Explain how a covering index can eliminate a table lookup entirely, and what makes an index 'covering' for a given query.", "conceptual", None, "Hard")
                ],
                "ai_ml": [
                    ("What is Retrieval-Augmented Generation (RAG)? How does it mitigate Large Language Model hallucinations?", "conceptual"),
                    ("Explain the self-attention mechanism in the Transformer architecture. How does it differ from recurrence?", "conceptual"),
                    ("Write a PyTorch code block defining a simple neural network structure with a Linear layer and a ReLU activation.", "coding"),
                    ("You are deploying an LLM that requires low inference latency. What optimization techniques (e.g. quantization, distillation) would you apply?", "scenario"),
                    ("Explain the differences between supervised learning, unsupervised learning, and Reinforcement Learning from Human Feedback (RLHF).", "conceptual"),
                    ("Explain fine-tuning techniques like LoRA (Low-Rank Adaptation) and QLoRA. Why are they parameter-efficient?", "conceptual"),
                    ("How do vector databases work? Explain cosine similarity and dot product index queries.", "conceptual"),
                    ("Write a Python script using NumPy to calculate the dot product of two matrices.", "coding"),
                    ("What is the difference between DPO (Direct Preference Optimization) and RLHF in model alignment?", "conceptual"),
                    ("You are experiencing model drift in production. How would you detect, monitor, and mitigate it?", "scenario"),
                    ("What are tokens in LLMs? How do subword tokenizers like BPE or WordPiece handle out-of-vocabulary words?", "conceptual"),
                    ("Explain bias and variance in machine learning. How do you recognize overfitting from train/val curves?", "scenario"),
                    ("Write PyTorch code to implement a custom dataset loader for training a model.", "coding"),
                    ("What is prompt engineering, and what are two techniques (e.g. few-shot examples, chain-of-thought) that improve LLM output quality?", "conceptual"),
                    ("Explain the difference between precision and recall. When would you optimize for one over the other?", "conceptual"),
                    ("Write a Python function using scikit-learn to split a dataset into training and test sets and train a simple logistic regression model.", "coding"),
                    ("What is embedding drift, and how does it affect a semantic search system over time?", "conceptual"),
                    ("You need to reduce the cost of running an LLM in production without a major quality drop. What options would you consider?", "scenario"),
                    ("Explain the difference between a foundation model and a fine-tuned model. When is fine-tuning worth the cost?", "conceptual"),
                    ("What is cross-validation, and why is it more reliable than a single train/test split for evaluating a model?", "conceptual"),
                    ("Write Python code that computes cosine similarity between two embedding vectors using NumPy.", "coding"),
                    ("Explain hallucination in LLMs. Name two practical mitigation strategies besides RAG.", "conceptual"),
                    ("How would you evaluate whether a chatbot's responses are actually improving after a prompt change, without shipping blind?", "scenario"),
                    ("What is the difference between a training set, a validation set, and a test set?", "conceptual", None, "Easy"),
                    ("Write Python code that normalizes a list of numbers to a 0-1 range using min-max scaling.", "coding", None, "Easy"),
                    ("Explain temperature and top-p sampling in LLM text generation. How do they affect output randomness?", "conceptual", None, "Medium"),
                    ("Explain how mixture-of-experts (MoE) architectures reduce inference compute while keeping a large parameter count.", "conceptual", None, "Hard"),
                    ("What is overfitting, and name one simple technique to reduce it.", "conceptual", None, "Easy"),
                    ("Write Python code using pandas to load a CSV and print the count of missing values per column.", "coding", None, "Easy"),
                    ("Explain the difference between batch inference and streaming inference for an LLM API, and when each is appropriate.", "conceptual", None, "Medium"),
                    ("Explain how KV-caching speeds up autoregressive LLM decoding, and why cache size grows with sequence length.", "conceptual", None, "Hard")
                ]
            },
            "hr": [
                ("Tell me about yourself. What are your strengths, and where do you see yourself in 5 years?", "hr"),
                ("Why do you want to join our company? What interests you about this role?", "hr"),
                ("Describe a scenario where you had a conflict with a team member. How did you resolve it?", "hr"),
                ("How do you manage tight deadlines and prioritize competing requests from product owners?", "hr"),
                ("Give an example of a mistake you made at work. What did you learn and how did you rectify it?", "hr"),
                ("How do you adapt to shifting project requirements or sudden corporate direction changes?", "hr"),
                ("What do you think makes a software engineer successful in a collaborative remote team?", "hr"),
                ("Describe your experience with mentoring junior developers or conducting code reviews.", "hr"),
                ("How do you handle constructive criticism on your code from peer engineers?", "hr"),
                ("What are your salary expectations for this role, and what is your current notice period?", "hr"),
                ("How do you stay motivated during long, repetitive phases of a project?", "hr"),
                ("Describe a time you had to say no to a request from a manager or client. How did you handle it?", "hr"),
                ("What does work-life balance mean to you, and how do you maintain it under deadline pressure?", "hr"),
                ("Tell us about a time you had to work with incomplete or unclear requirements. What did you do?", "hr"),
                ("How do you handle a disagreement with a teammate about the right technical approach?", "hr"),
                ("What would your previous manager or teammates say is your biggest area for improvement?", "hr"),
                ("How do you approach onboarding onto a completely unfamiliar codebase?", "hr"),
                ("Describe your ideal team culture. What makes a workplace feel supportive to you?", "hr"),
                ("How do you keep your technical skills current outside of work?", "hr"),
                ("Where do you see the biggest gap between your current skills and this role's requirements, and how would you close it?", "hr"),
                ("What attracted you to a career in software development?", "hr", None, "Easy"),
                ("How do you typically start your day at work?", "hr", None, "Easy"),
                ("Describe a time you had to give difficult feedback to a peer.", "hr", None, "Medium"),
                ("How would you handle being asked to work significantly beyond your job scope?", "hr", None, "Medium"),
                ("Tell us about a time you had to influence a decision without having direct authority over the people involved.", "hr", None, "Hard"),
                ("What kind of work environment helps you do your best work?", "hr", None, "Easy"),
                ("How do you typically communicate progress on a task to your manager?", "hr", None, "Easy"),
                ("Describe a time you had to quickly get up to speed on a topic you knew nothing about.", "hr", None, "Medium"),
                ("How do you decide what to prioritize when everything feels urgent?", "hr", None, "Medium"),
                ("Tell us about a time you had to deliver on a commitment after the circumstances around it had significantly changed.", "hr", None, "Hard")
            ],
            "behavioral": [
                ("Describe a complex technical problem you solved recently. Use the STAR method (Situation, Task, Action, Result).", "behavioral"),
                ("Tell me about a time you took the lead on a project. What challenges did you face and how did you handle them?", "behavioral"),
                ("Tell me about a time you had to deliver bad news to a manager or stakeholder. How did you communicate it?", "behavioral"),
                ("Give an example of when you had to work with a very difficult client or customer. How did you maintain professionalism?", "behavioral"),
                ("Describe a situation where you disagreed with a manager's technical decision. How did you handle the situation?", "behavioral"),
                ("Tell me about a time you failed to meet a deadline. What happened and how did you communicate it?", "behavioral"),
                ("Describe a time you went above and beyond your standard duties to deliver a critical feature.", "behavioral"),
                ("Tell me about a time you had to learn a brand new language or framework in a very short time. What was your strategy?", "behavioral"),
                ("Tell me about a time you had to make a decision with incomplete information. What was the outcome?", "behavioral"),
                ("Describe a situation where you had to collaborate with a team in a different timezone or department. What made it work or not work?", "behavioral"),
                ("Tell me about a time your code caused a production issue. Walk me through what happened and what you changed afterward.", "behavioral"),
                ("Describe a time you had to convince a skeptical stakeholder to adopt your technical recommendation.", "behavioral"),
                ("Tell me about a project that didn't go as planned. What would you do differently now?", "behavioral"),
                ("Describe a time you had to balance technical debt against a feature deadline. How did you decide?", "behavioral"),
                ("Tell me about a time you received a code review comment that changed how you approached the problem.", "behavioral"),
                ("Describe how you handled a situation where a teammate wasn't pulling their weight on a shared deliverable.", "behavioral"),
                ("Tell me about a project you're proud of and why.", "behavioral", None, "Easy"),
                ("Describe a time you helped a teammate who was stuck.", "behavioral", None, "Easy"),
                ("Tell me about a time you had to change your plan midway through a project. What triggered it?", "behavioral", None, "Medium"),
                ("Describe a time you took initiative without being asked.", "behavioral", None, "Medium"),
                ("Tell me about the most difficult stakeholder conflict you've navigated, and how you resolved it without escalating it further.", "behavioral", None, "Hard"),
                ("Describe a time you asked for help instead of struggling alone.", "behavioral", None, "Easy"),
                ("Tell me about a piece of feedback that stuck with you.", "behavioral", None, "Easy"),
                ("Describe a time you had to push back on a request you thought was a bad idea.", "behavioral", None, "Medium"),
                ("Tell me about a time you had to work within a constraint you didn't agree with.", "behavioral", None, "Medium"),
                ("Describe the highest-pressure situation you've faced at work and how you kept the team focused through it.", "behavioral", None, "Hard")
            ]
        }

        # Normalize job role key
        role_key = "react"
        j_role_lower = job_role.lower()
        if "python" in j_role_lower:
            role_key = "python"
        elif "node" in j_role_lower or "mern" in j_role_lower:
            role_key = "node"
        elif "database" in j_role_lower or "sql" in j_role_lower:
            role_key = "database"
        elif "ai" in j_role_lower or "ml" in j_role_lower or "machine" in j_role_lower or "deep" in j_role_lower or "data science" in j_role_lower:
            role_key = "ai_ml"

        questions = []
        source_pool = []

        if interview_type == 'technical':
            # Blend the standard domain pool with the four coding formats for that same
            # domain, so a mock interview presents a varied mix (§2.3) that is still
            # strictly domain-relevant (§3).
            source_pool = list(mock_library['technical'].get(role_key, mock_library['technical']['react']))
            source_pool += cls.CODING_FORMAT_BANK.get(role_key, cls.CODING_FORMAT_BANK['python'])
        elif interview_type == 'hr':
            source_pool = mock_library['hr']
        elif interview_type == 'behavioral':
            source_pool = mock_library['behavioral']
        else:  # Custom/Behavioral combo
            # If custom JD is given, generate questions tailored to the JD
            if custom_jd and len(custom_jd) > 20:
                # Custom keywords extraction
                keywords = [w.strip(".,;:?!") for w in custom_jd.split() if len(w) > 5]
                random.shuffle(keywords)
                keywords = list(set(keywords))[:3]
                
                custom_questions = [
                    (f"How do you apply your experience in {kw} to build scalable solutions?", "conceptual") for kw in keywords
                ]
                custom_questions.append((f"Given a requirement involving {keywords[0] if keywords else 'system design'}, describe how you would architect the database and API interfaces.", "scenario"))
                custom_questions.append(("Based on the required skills in the job description, what do you see as the biggest challenge in this role?", "behavioral"))
                source_pool = custom_questions
            else:
                source_pool = mock_library['technical']['react'] + mock_library['hr']

        # Normalize to (text, type, snippet, difficulty) — older pools are 2- or 3-tuples
        # (no per-question difficulty tag; treated as eligible for every range below).
        def _as_quad(entry):
            if len(entry) == 4:
                return entry
            if len(entry) == 3:
                text, q_type, snippet = entry
                return (text, q_type, snippet, None)
            text, q_type = entry
            return (text, q_type, None, None)

        normalized_pool = [_as_quad(e) for e in source_pool]

        # Difficulty Range feature: restrict to the invite's allowed levels, same rule the
        # coding sandbox uses — an untagged entry (difficulty is None) is always eligible, so
        # older content written before per-question tagging never becomes unreachable. If the
        # filter would empty the pool (e.g. a range with no tagged content yet), fall back to
        # the unfiltered pool rather than returning nothing.
        if allowed_difficulties:
            restricted = [e for e in normalized_pool if e[3] is None or e[3] in allowed_difficulties]
            if restricted:
                normalized_pool = restricted

        shuffled = list(normalized_pool)
        random.shuffle(shuffled)

        # Pick with format variety (§2.3): never take the same question_type twice in a row
        # while a different type is still available, so a session can't end up as four
        # identical-format questions.
        picked = []
        remaining = list(shuffled)
        last_type = None
        while remaining and len(picked) < num_questions:
            idx = next((i for i, e in enumerate(remaining) if e[1] != last_type), 0)
            entry = remaining.pop(idx)
            picked.append(entry)
            last_type = entry[1]

        for i, (q_text, q_type, snippet, _difficulty) in enumerate(picked):
            questions.append({
                "question_text": q_text,
                "question_type": q_type,
                "code_snippet": snippet,
                "order_num": i + 1
            })

        # Fill up if we have less questions than requested
        while len(questions) < num_questions:
            questions.append({
                "question_text": f"Can you detail your experience in working with modern software development methodologies and how you ensure code quality for {job_role} projects?",
                "question_type": "conceptual",
                "code_snippet": None,
                "order_num": len(questions) + 1
            })

        return questions

    @classmethod
    def _generate_mock_report(cls, qas):
        # Calculate averages from questions
        tech_scores = [qa['evaluation']['technical_score'] for qa in qas if 'evaluation' in qa]
        comm_scores = [qa['evaluation']['communication_score'] for qa in qas if 'evaluation' in qa]
        conf_scores = [qa['evaluation']['confidence_score'] for qa in qas if 'evaluation' in qa]
        overall_scores = [qa['evaluation']['score'] for qa in qas if 'evaluation' in qa]

        avg_tech = round(sum(tech_scores) / len(tech_scores) if tech_scores else 70, 1)
        avg_comm = round(sum(comm_scores) / len(comm_scores) if comm_scores else 70, 1)
        avg_conf = round(sum(conf_scores) / len(conf_scores) if conf_scores else 70, 1)
        avg_overall = round(sum(overall_scores) / len(overall_scores) if overall_scores else 70, 1)
        avg_problem_solving = round(avg_tech * 1.05 if avg_tech * 1.05 <= 100 else 98, 1)

        strengths = [
            "Good understanding of primary framework architectures.",
            "Strong communication skills with coherent logical flow.",
            "Demonstrated practical scenario-based problem solving."
        ]
        
        weaknesses = [
            "Needs to dive deeper into performance optimization criteria.",
            "Grammar structure and confidence can be improved during complex questions.",
            "Could explain low-level system execution mechanisms more thoroughly."
        ]

        missing_concepts = "Memory management, performance profiling tools, database indexing constraints under high-concurrency."
        
        recommendations = (
            "1. Study advanced optimization guides for your primary language/framework.\n"
            "2. Practice mock presentations to build natural confidence and maintain a steady speaking pace.\n"
            "3. Deepen SQL knowledge, focusing on EXPLAIN query planners, query cost analysis, and scaling schemas."
        )

        return {
            "overall_score": avg_overall,
            "technical_score": avg_tech,
            "communication_score": avg_comm,
            "confidence_score": avg_conf,
            "problem_solving_score": avg_problem_solving,
            "strengths": json.dumps(strengths),
            "weaknesses": json.dumps(weaknesses),
            "missing_concepts": missing_concepts,
            "recommendations": recommendations
        }

    @classmethod
    def _generate_mock_resume_analysis(cls, resume_text):
        # Extract skills via simple keyword check
        keywords = ["react", "node", "express", "javascript", "typescript", "python", "flask", "django", "java", "spring", "c++", "aws", "docker", "kubernetes", "sql", "postgres", "mongodb", "git", "ci/cd"]
        found_skills = [skill.capitalize() for skill in keywords if skill in resume_text.lower()]
        if not found_skills:
            found_skills = ["React", "JavaScript", "HTML", "CSS", "Git"]

        all_skills = set(keywords)
        missing = [skill.capitalize() for skill in all_skills if skill not in resume_text.lower()][:4]

        # Calculate a mock score based on number of skills matched
        base_score = 50 + (len(found_skills) * 3)
        resume_score = min(base_score, 98)

        extracted_experience = [
            "Identified professional roles including software engineering work cycles.",
            "Involved in building client-side and server-side components.",
            "Worked within collaborative agile environments for product shipping."
        ]

        extracted_education = [
            "Bachelor's degree or equivalent technical certifications detected."
        ]

        # Projects drive the Resume-Based Interview's questions, so the offline path reads
        # them out of the actual document instead of returning a fixed list: a mock interview
        # built from three invented projects the candidate has never heard of is worse than
        # no mock at all. Falls back to the detected skills only when the resume really has
        # no projects section to read.
        extracted_projects = cls._scrape_project_lines(resume_text)
        if not extracted_projects:
            extracted_projects = [
                f"General {skill} work described in the resume body" for skill in found_skills[:3]
            ]

        suggestions = [
            "Add quantitative accomplishments (e.g., 'Optimized query efficiency by 40%').",
            "Incorporate a dedicated section highlighting experience with cloud deployments (AWS/Docker).",
            "Update your summary to explicitly list your core programming languages first."
        ]

        return {
            "extracted_skills": json.dumps(found_skills),
            "extracted_experience": json.dumps(extracted_experience),
            "extracted_education": json.dumps(extracted_education),
            "extracted_projects": json.dumps(extracted_projects),
            "missing_skills": json.dumps(missing),
            "resume_score": resume_score,
            "suggestions": json.dumps(suggestions)
        }

    # Headings a resume actually uses for its project section, lowercase.
    _PROJECT_HEADINGS = ('projects', 'personal projects', 'academic projects',
                         'selected projects', 'key projects', 'portfolio')
    # Headings that end it — anything that clearly starts a different section.
    _SECTION_HEADINGS = ('experience', 'education', 'skills', 'certifications', 'awards',
                         'employment', 'work history', 'references', 'summary', 'objective',
                         'languages', 'interests', 'achievements', 'publications')

    @classmethod
    def _scrape_project_lines(cls, resume_text, limit=6):
        """Best-effort read of a resume's projects section without an LLM.

        Deliberately conservative: it only reads lines under a recognised projects heading
        and stops at the next section, so it under-reports rather than sweeping in unrelated
        bullets. Returns [] when there is no projects section at all.
        """
        projects = []
        in_section = False

        for raw_line in (resume_text or '').splitlines():
            line = raw_line.strip()
            if not line:
                continue

            # A heading is short and has no sentence punctuation — long prose that merely
            # mentions the word "projects" must not flip the section on.
            bare = line.lower().strip(':•-–— \t')
            is_heading = len(bare) <= 32

            if is_heading and bare in cls._PROJECT_HEADINGS:
                in_section = True
                continue
            if in_section and is_heading and any(bare.startswith(h) for h in cls._SECTION_HEADINGS):
                break
            if not in_section:
                continue

            entry = line.lstrip('•-–—*● \t').strip()
            # Skip bare URLs and stray one-word fragments; neither makes a usable prompt.
            if len(entry) < 8 or entry.lower().startswith(('http://', 'https://', 'www.')):
                continue
            projects.append(entry[:300])
            if len(projects) >= limit:
                break

        return projects

    @classmethod
    def _generate_mock_jd_analysis(cls, jd_text):
        # Extract required keywords from JD
        keywords = ["react", "node", "javascript", "typescript", "python", "aws", "docker", "kubernetes", "sql", "postgres", "mongodb", "git", "ci/cd", "microservices", "testing", "agile"]
        found_skills = [skill.capitalize() for skill in keywords if skill in jd_text.lower()]
        if not found_skills:
            found_skills = ["Software Engineering", "Full Stack Development", "Problem Solving"]

        extracted_requirements = [
            "Build and deploy scalable front-end and back-end web applications.",
            "Write clean, testable, and reusable code following industry best practices.",
            "Collaborate with multi-disciplinary teams in an agile/scrum environment."
        ]

        return {
            "extracted_requirements": json.dumps(extracted_requirements),
            "extracted_skills": json.dumps(found_skills)
        }
