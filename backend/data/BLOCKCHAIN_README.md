# Blockchain curriculum

User-provided syllabus, separate from the five scraped SMIT courses. Sol means Solana; evolution means the evolution of blockchain. Six modules contain 20 named topics. The source is explicitly user-provided, not an officially verified SMIT scrape.

The existing course/module/topic tables store the curriculum. Interview questions and MCQs are saved in the existing interview_questions table when an interview is created. blockchain_questions.json provides 20 interview prompts and 20 single-answer MCQs for direct selection, filtered by active database topics. Blockchain question and MCQ selection never calls the AI provider; other courses keep their existing generation behavior. The small question bank is cached in memory, and the Blockchain curriculum is loaded in one database query. MCQ option ordering is randomized with the correct answer index preserved.

Blockchain appears after UI/UX in the existing SMIT dropdown group. It uses the existing course status, company access, bulk validation and invitation flows. This introductory track has no executable coding opener because the sandbox does not support Solidity/Rust.

## PostgreSQL / Supabase import

Configure backend/.env with DATABASE_URL pointing to the intended PostgreSQL/Supabase database. Install backend/requirements.txt, then from backend run:

    python scripts/import_blockchain_curriculum.py --dry-run
    python scripts/import_blockchain_curriculum.py

The script uses the existing curriculum tables and upserts only Blockchain in a transaction. Re-running it does not duplicate rows. It verifies all other curriculum rows are unchanged before committing, bounds lock/statement waits, and does not run application startup or change the database schema. Restart the backend after importing. If the course has not been imported, starting a Blockchain interview returns a clear configuration error before charging tokens instead of producing unrelated questions.

## Content references

- Bitcoin whitepaper: https://bitcoin.org/bitcoin.pdf
- Ethereum whitepaper (historical): https://ethereum.org/whitepaper/
- Current Ethereum consensus: https://ethereum.org/developers/docs/consensus-mechanisms/pos/
- Solana programs: https://solana.com/docs/core/programs

The original Ethereum whitepaper is historical; questions distinguish it from current Ethereum proof of stake.
