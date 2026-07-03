import json
import requests
import random
from app.config.config import Config

class MixtralService:
    @staticmethod
    def _call_llm(system_prompt, user_prompt):
        if Config.AI_MODE == 'mock' or not Config.MIXTRAL_API_KEY:
            return None
        
        headers = {
            "Authorization": f"Bearer {Config.MIXTRAL_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Prepare parameters for OpenAI/Groq compatible chat completions
        payload = {
            "model": "mixtral-8x7b-32768" if "groq" in Config.MIXTRAL_API_URL.lower() else "mistralai/Mixtral-8x7B-Instruct-v0.1",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }

        try:
            response = requests.post(Config.MIXTRAL_API_URL, headers=headers, json=payload, timeout=15)
            if response.status_code == 200:
                result = response.json()
                content = result['choices'][0]['message']['content']
                return json.loads(content)
        except Exception as e:
            print(f"Error calling LLM API: {str(e)}. Falling back to mock generator.")
        
        return None

    @classmethod
    def generate_questions(cls, interview_type, job_role, experience_level, difficulty, num_questions, custom_jd=None, custom_skills=None):
        system_prompt = (
            "You are an expert AI recruiter. Generate interview questions based on the candidate details. "
            "You must return the response as a JSON object with a single key 'questions' containing a list of objects. "
            "Each object must have: 'question_text' and 'question_type' ('conceptual', 'scenario', 'coding', 'behavioral', 'hr'). "
            "Return EXACTLY the requested number of questions."
        )

        # Add a random seed/timestamp salt to force high diversity in LLM completions
        import uuid
        salt = str(uuid.uuid4())[:8]
        user_prompt = (
            f"Generate {num_questions} interview questions for a {difficulty} level {job_role} interview. "
            f"Interview Type: {interview_type}. Experience Level: {experience_level}. "
            f"Crucial Directive: Make this question set completely unique, creative, and different from previous sets. "
            f"Random seed ID: {salt}. "
        )
        if custom_jd:
            user_prompt += f"Job Description context: {custom_jd}. "
        if custom_skills:
            user_prompt += f"Target Skills: {custom_skills}. "

        # Try API
        api_result = cls._call_llm(system_prompt, user_prompt)
        if api_result and 'questions' in api_result:
            return api_result['questions']

        # Fallback Mock Question Generator
        return cls._generate_mock_questions(interview_type, job_role, experience_level, difficulty, num_questions, custom_jd)

    @classmethod
    def evaluate_response(cls, question_text, response_text):
        system_prompt = (
            "You are a technical interviewer evaluating a candidate's answer. "
            "You must return a JSON object with these keys: "
            "'score' (0-100 overall score), 'technical_score' (0-100), 'communication_score' (0-100), "
            "'confidence_score' (0-100), and 'feedback' (detailed string explanation)."
        )

        user_prompt = f"Question: {question_text}\nCandidate Answer: {response_text}\nEvaluate their response."

        api_result = cls._call_llm(system_prompt, user_prompt)
        if api_result and all(k in api_result for k in ['score', 'technical_score', 'communication_score', 'confidence_score', 'feedback']):
            return api_result

        # Fallback Mock Evaluation Engine
        return cls._generate_mock_evaluation(question_text, response_text)

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
            "'extracted_education' (list of strings), 'missing_skills' (list of strings), "
            "'resume_score' (0-100), and 'suggestions' (list of strings)."
        )

        user_prompt = f"Resume Text:\n{resume_text}"

        api_result = cls._call_llm(system_prompt, user_prompt)
        if api_result and all(k in api_result for k in ['extracted_skills', 'resume_score', 'suggestions']):
            return api_result

        # Fallback Mock Resume Analysis
        return cls._generate_mock_resume_analysis(resume_text)

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
    
    @classmethod
    def _generate_mock_questions(cls, interview_type, job_role, experience_level, difficulty, num_questions, custom_jd):
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
                    ("Explain CSS modules vs styled-components in the context of React styling trade-offs.", "conceptual")
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
                    ("What is type hinting in Python? How does it improve code quality, and what are its runtime limits?", "conceptual")
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
                    ("How do you prevent SQL injection or XSS vulnerabilities in Node.js REST API systems?", "scenario")
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
                    ("How do you handle database migrations safely in a production environment with zero downtime?", "scenario")
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
                    ("Write PyTorch code to implement a custom dataset loader for training a model.", "coding")
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
                ("What are your salary expectations for this role, and what is your current notice period?", "hr")
            ],
            "behavioral": [
                ("Describe a complex technical problem you solved recently. Use the STAR method (Situation, Task, Action, Result).", "behavioral"),
                ("Tell me about a time you took the lead on a project. What challenges did you face and how did you handle them?", "behavioral"),
                ("Tell me about a time you had to deliver bad news to a manager or stakeholder. How did you communicate it?", "behavioral"),
                ("Give an example of when you had to work with a very difficult client or customer. How did you maintain professionalism?", "behavioral"),
                ("Describe a situation where you disagreed with a manager's technical decision. How did you handle the situation?", "behavioral"),
                ("Tell me about a time you failed to meet a deadline. What happened and how did you communicate it?", "behavioral"),
                ("Describe a time you went above and beyond your standard duties to deliver a critical feature.", "behavioral"),
                ("Tell me about a time you had to learn a brand new language or framework in a very short time. What was your strategy?", "behavioral")
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
            source_pool = mock_library['technical'].get(role_key, mock_library['technical']['react'])
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

        # Shuffle source pool
        shuffled = list(source_pool)
        random.shuffle(shuffled)
        
        for i in range(min(num_questions, len(shuffled))):
            q_text, q_type = shuffled[i]
            questions.append({
                "question_text": q_text,
                "question_type": q_type,
                "order_num": i + 1
            })

        # Fill up if we have less questions than requested
        while len(questions) < num_questions:
            questions.append({
                "question_text": f"Can you detail your experience in working with modern software development methodologies and how you ensure code quality for {job_role} projects?",
                "question_type": "conceptual",
                "order_num": len(questions) + 1
            })

        return questions

    @classmethod
    def _generate_mock_evaluation(cls, question_text, response_text):
        if not response_text or len(response_text.strip()) < 10:
            return {
                "score": 10.0,
                "technical_score": 5.0,
                "communication_score": 20.0,
                "confidence_score": 10.0,
                "feedback": "The response was too short or non-existent. To score better, please provide a complete, detailed answer answering all aspects of the question."
            }

        # Analyze keywords in the response to determine scores
        score_modifier = 0
        technical_terms = ["hook", "virtual dom", "state", "index", "normalization", "gil", "event loop", "asynchronous", "star", "situation", "optimize", "cache", "scale"]
        
        found_terms = [term for term in technical_terms if term in response_text.lower()]
        score_modifier += len(found_terms) * 10
        
        # Base scores
        base_tech = min(60 + score_modifier, 95)
        base_comm = min(65 + (len(response_text.split()) // 5), 92)
        base_conf = min(70 + random.randint(-5, 15), 95)
        
        # Calculate overall score
        overall = round((base_tech * 0.5) + (base_comm * 0.3) + (base_conf * 0.2), 1)

        # Generate feedback string
        feedback = "Good attempt! "
        if base_tech > 80:
            feedback += "Your response demonstrated a solid grasp of core technical concepts. You successfully utilized terms like " + ", ".join(found_terms) + "."
        elif base_tech > 60:
            feedback += "You understand the basics, but could improve by explaining the deep internal mechanisms and practical optimization trade-offs."
        else:
            feedback += "The answer lacked depth. Try to use more technical terms, explain structural details, or provide an active example of how you've resolved this in production."

        return {
            "score": overall,
            "technical_score": float(base_tech),
            "communication_score": float(base_comm),
            "confidence_score": float(base_conf),
            "feedback": feedback
        }

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

        suggestions = [
            "Add quantitative accomplishments (e.g., 'Optimized query efficiency by 40%').",
            "Incorporate a dedicated section highlighting experience with cloud deployments (AWS/Docker).",
            "Update your summary to explicitly list your core programming languages first."
        ]

        return {
            "extracted_skills": json.dumps(found_skills),
            "extracted_experience": json.dumps(extracted_experience),
            "extracted_education": json.dumps(extracted_education),
            "missing_skills": json.dumps(missing),
            "resume_score": resume_score,
            "suggestions": json.dumps(suggestions)
        }

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
