"""SQL problems for the coding sandbox.

Structured differently from the function-implementation problems in problem_bank.py:
instead of {"args", "expected"} a SQL test case carries its own seed rows plus the
expected RESULT SET. The candidate writes one read-only SELECT which is executed against a
fresh in-memory SQLite database per test case (see sql_runner.py).

Every problem below defines at least three MEANINGFULLY DISTINCT scenarios — typical data,
a tie/duplicate edge case, and an empty/no-match case — so a query that only works on the
happy path is caught.

"domains" tags which candidate domains the problem is relevant to, so the existing
domain/JD-driven selection surfaces SQL to data-oriented candidates rather than, for
example, a UI/UX design interview.
"""

_DATA_DOMAINS = [
    "data",
    "data engineering",
    "cloud & data engineering",
    "backend",
    "database",
    "analytics",
]

SQL_PROBLEMS = [
    {
        "id": "sql-top-earner-per-department",
        "title": "Top Earner Per Department",
        "difficulty": "Medium",
        "language": "sql",
        "function_name": None,
        "time_limit_secs": 5,
        "domains": _DATA_DOMAINS,
        "prompt": (
            "The `employees` table stores staff records.\n\n"
            "Write a query returning the HIGHEST paid employee in each department.\n\n"
            "Return the columns `department`, `name`, `salary`, ordered by `department` "
            "ascending. If two employees in the same department tie on the highest salary, "
            "return both, ordered by `name` ascending within that department."
        ),
        "constraints": [
            "Return exactly the columns: department, name, salary.",
            "Order by department ascending, then name ascending.",
            "Read-only: only SELECT statements are permitted.",
        ],
        "schema_sql": (
            "CREATE TABLE employees ("
            "  id INTEGER PRIMARY KEY,"
            "  name TEXT NOT NULL,"
            "  department TEXT NOT NULL,"
            "  salary INTEGER NOT NULL"
            ");"
        ),
        "schema_display": [
            {
                "table": "employees",
                "columns": [
                    {"name": "id", "type": "INTEGER", "note": "primary key"},
                    {"name": "name", "type": "TEXT"},
                    {"name": "department", "type": "TEXT"},
                    {"name": "salary", "type": "INTEGER"},
                ],
            }
        ],
        "examples": [
            {
                "input": "employees: (1,'Ada','Engineering',120000), (2,'Grace','Engineering',95000), (3,'Linus','Sales',70000)",
                "output": "Engineering | Ada | 120000\nSales | Linus | 70000",
                "explanation": "Ada is the top earner in Engineering, Linus in Sales.",
            }
        ],
        "starters": {
            "sql": (
                "-- Return department, name, salary for the top earner in each department.\n"
                "-- Order by department ascending, then name ascending.\n"
                "SELECT\n"
            ),
        },
        "sample_tests": [
            {
                "name": "typical data - one clear top earner per department",
                "seed": (
                    "INSERT INTO employees VALUES"
                    " (1,'Ada','Engineering',120000),"
                    " (2,'Grace','Engineering',95000),"
                    " (3,'Linus','Sales',70000),"
                    " (4,'Margaret','Sales',68000);"
                ),
                "expected_columns": ["department", "name", "salary"],
                "expected": [
                    ["Engineering", "Ada", 120000],
                    ["Sales", "Linus", 70000],
                ],
            },
        ],
        "hidden_tests": [
            {
                "name": "ties - two employees share the top salary",
                "seed": (
                    "INSERT INTO employees VALUES"
                    " (1,'Ada','Engineering',120000),"
                    " (2,'Alan','Engineering',120000),"
                    " (3,'Linus','Sales',70000);"
                ),
                "expected": [
                    ["Engineering", "Ada", 120000],
                    ["Engineering", "Alan", 120000],
                    ["Sales", "Linus", 70000],
                ],
            },
            {
                "name": "empty table - no rows at all",
                "seed": "",
                "expected": [],
            },
            {
                "name": "single department, single employee",
                "seed": "INSERT INTO employees VALUES (1,'Solo','Research',50000);",
                "expected": [["Research", "Solo", 50000]],
            },
        ],
    },
    {
        "id": "sql-customer-order-totals",
        "title": "Customer Order Totals",
        "difficulty": "Medium",
        "language": "sql",
        "function_name": None,
        "time_limit_secs": 5,
        "domains": _DATA_DOMAINS,
        "prompt": (
            "`customers` holds customer records and `orders` holds their orders.\n\n"
            "Write a query returning every customer's name alongside the TOTAL amount they "
            "have spent.\n\n"
            "Include customers who have never placed an order - their total must be `0`, "
            "not NULL. Return the columns `name`, `total`, ordered by `total` descending, "
            "then `name` ascending."
        ),
        "constraints": [
            "Return exactly the columns: name, total.",
            "Customers with no orders must report a total of 0, not NULL.",
            "Order by total descending, then name ascending.",
            "Read-only: only SELECT statements are permitted.",
        ],
        "schema_sql": (
            "CREATE TABLE customers ("
            "  id INTEGER PRIMARY KEY,"
            "  name TEXT NOT NULL"
            ");"
            "CREATE TABLE orders ("
            "  id INTEGER PRIMARY KEY,"
            "  customer_id INTEGER NOT NULL,"
            "  amount INTEGER NOT NULL"
            ");"
        ),
        "schema_display": [
            {
                "table": "customers",
                "columns": [
                    {"name": "id", "type": "INTEGER", "note": "primary key"},
                    {"name": "name", "type": "TEXT"},
                ],
            },
            {
                "table": "orders",
                "columns": [
                    {"name": "id", "type": "INTEGER", "note": "primary key"},
                    {"name": "customer_id", "type": "INTEGER", "note": "references customers.id"},
                    {"name": "amount", "type": "INTEGER"},
                ],
            },
        ],
        "examples": [
            {
                "input": "customers: (1,'Ana'), (2,'Ben')   orders: (1,1,300), (2,1,200)",
                "output": "Ana | 500\nBen | 0",
                "explanation": "Ana spent 300+200; Ben has no orders so reports 0.",
            }
        ],
        "starters": {
            "sql": (
                "-- Return name and total spend for every customer (0 when they have no orders).\n"
                "-- Order by total descending, then name ascending.\n"
                "SELECT\n"
            ),
        },
        "sample_tests": [
            {
                "name": "typical data - customers with and without orders",
                "seed": (
                    "INSERT INTO customers VALUES (1,'Ana'), (2,'Ben'), (3,'Cara');"
                    "INSERT INTO orders VALUES (1,1,300), (2,1,200), (3,3,450);"
                ),
                "expected_columns": ["name", "total"],
                "expected": [
                    ["Ana", 500],
                    ["Cara", 450],
                    ["Ben", 0],
                ],
            },
        ],
        "hidden_tests": [
            {
                "name": "no orders exist at all - every total is 0",
                "seed": "INSERT INTO customers VALUES (1,'Ana'), (2,'Ben');",
                "expected": [["Ana", 0], ["Ben", 0]],
            },
            {
                "name": "tie on total - resolved by name ascending",
                "seed": (
                    "INSERT INTO customers VALUES (1,'Zoe'), (2,'Abe');"
                    "INSERT INTO orders VALUES (1,1,100), (2,2,100);"
                ),
                "expected": [["Abe", 100], ["Zoe", 100]],
            },
            {
                "name": "no customers - empty result set",
                "seed": "",
                "expected": [],
            },
        ],
    },
    {
        "id": "sql-second-highest-salary",
        "title": "Second Highest Salary",
        "difficulty": "Easy",
        "language": "sql",
        "function_name": None,
        "time_limit_secs": 5,
        "domains": _DATA_DOMAINS,
        "prompt": (
            "The `employees` table stores staff salaries.\n\n"
            "Write a query returning the SECOND highest DISTINCT salary as a single column "
            "named `second_highest`.\n\n"
            "If there is no second distinct salary (for example every employee earns the "
            "same amount, or the table is empty), return a single row containing NULL."
        ),
        "constraints": [
            "Return exactly one column named second_highest, and exactly one row.",
            "Distinct salaries only - a repeated salary counts once.",
            "Return NULL when a second distinct salary does not exist.",
            "Read-only: only SELECT statements are permitted.",
        ],
        "schema_sql": (
            "CREATE TABLE employees ("
            "  id INTEGER PRIMARY KEY,"
            "  name TEXT NOT NULL,"
            "  salary INTEGER NOT NULL"
            ");"
        ),
        "schema_display": [
            {
                "table": "employees",
                "columns": [
                    {"name": "id", "type": "INTEGER", "note": "primary key"},
                    {"name": "name", "type": "TEXT"},
                    {"name": "salary", "type": "INTEGER"},
                ],
            }
        ],
        "examples": [
            {
                "input": "employees: (1,'Ada',300), (2,'Bo',200), (3,'Cy',100)",
                "output": "200",
                "explanation": "Distinct salaries are 300, 200, 100 - the second highest is 200.",
            }
        ],
        "starters": {
            "sql": (
                "-- Return the second highest DISTINCT salary as second_highest.\n"
                "-- Return NULL when there is no second distinct salary.\n"
                "SELECT\n"
            ),
        },
        "sample_tests": [
            {
                "name": "typical data - three distinct salaries",
                "seed": "INSERT INTO employees VALUES (1,'Ada',300), (2,'Bo',200), (3,'Cy',100);",
                "expected_columns": ["second_highest"],
                "expected": [[200]],
            },
        ],
        "hidden_tests": [
            {
                "name": "duplicates - the top salary appears twice",
                "seed": "INSERT INTO employees VALUES (1,'Ada',300), (2,'Bo',300), (3,'Cy',150);",
                "expected": [[150]],
            },
            {
                "name": "every salary identical - no second distinct value",
                "seed": "INSERT INTO employees VALUES (1,'Ada',300), (2,'Bo',300);",
                "expected": [[None]],
            },
            {
                "name": "empty table - no salaries at all",
                "seed": "",
                "expected": [[None]],
            },
        ],
    },
]

# Known-correct reference solutions. NEVER served to candidates — used only by the
# verification script/tests to prove each problem's test cases actually pass with a correct
# query and fail with an incorrect one (§2.4).
REFERENCE_SOLUTIONS = {
    "sql-top-earner-per-department": (
        "SELECT e.department, e.name, e.salary FROM employees e "
        "WHERE e.salary = (SELECT MAX(x.salary) FROM employees x WHERE x.department = e.department) "
        "ORDER BY e.department ASC, e.name ASC"
    ),
    "sql-customer-order-totals": (
        "SELECT c.name AS name, COALESCE(SUM(o.amount), 0) AS total "
        "FROM customers c LEFT JOIN orders o ON o.customer_id = c.id "
        "GROUP BY c.id, c.name ORDER BY total DESC, name ASC"
    ),
    "sql-second-highest-salary": (
        "SELECT (SELECT DISTINCT salary FROM employees ORDER BY salary DESC "
        "LIMIT 1 OFFSET 1) AS second_highest"
    ),
}

# Deliberately WRONG queries (logically incorrect, not syntax errors) used to prove the
# evaluator actually catches bad logic rather than rubber-stamping anything that parses.
INCORRECT_SOLUTIONS = {
    # Ignores departments entirely — returns only the global top earner.
    "sql-top-earner-per-department": (
        "SELECT department, name, salary FROM employees "
        "ORDER BY salary DESC LIMIT 1"
    ),
    # INNER JOIN drops customers with no orders, so the required 0 rows are missing.
    "sql-customer-order-totals": (
        "SELECT c.name AS name, SUM(o.amount) AS total "
        "FROM customers c JOIN orders o ON o.customer_id = c.id "
        "GROUP BY c.id, c.name ORDER BY total DESC, name ASC"
    ),
    # Forgets DISTINCT — with duplicate top salaries this returns the top value again.
    "sql-second-highest-salary": (
        "SELECT (SELECT salary FROM employees ORDER BY salary DESC "
        "LIMIT 1 OFFSET 1) AS second_highest"
    ),
}
