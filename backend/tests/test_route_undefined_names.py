"""Guards against a route referencing a name nothing ever binds.

THE BUG THIS EXISTS FOR
-----------------------
`send_interview_invite` selected its email template with `if instructor:` while the line
that defined `instructor` had been deleted in an unrelated refactor. Python only raises a
NameError when the line actually executes, and that line sits *after* the database commit —
so every invite recorded an AdminLog row, wrote no email log, and returned a 500.

It reached production and blocked real candidate enrolments, because nothing here executed
that path. Import checks don't catch it (the module imports fine), and the route has no
functional test (it needs a database, which this suite deliberately cannot touch).

WHY IT LOOKED LIKE A CORS PROBLEM
--------------------------------
FastAPI's `@app.exception_handler(Exception)` runs inside Starlette's ServerErrorMiddleware,
which sits *outside* CORSMiddleware. A 500 raised in a handler therefore never passes back
through CORS on its way out and carries no `Access-Control-Allow-Origin`, so the browser
reports "blocked by CORS policy" and the real error is invisible from the frontend. Any
unhandled 500 in this app presents that way — worth remembering before chasing CORS config.

WHAT THIS CHECKS
----------------
Every function in `app/` is walked for names that are read but never bound in that function,
nor available at module level, nor a builtin. Closures are handled by treating names bound
in any enclosing function as available, which is what made the naive version of this check
produce ~37 false positives.
"""

import ast
import builtins
import pathlib

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_DIR = BACKEND_ROOT / 'app'
BUILTIN_NAMES = set(dir(builtins))


def _module_level_names(tree):
    """Names available anywhere in the module: imports, top-level assignments, def/class."""
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                names.add((alias.asname or alias.name).split('.')[0])
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                for sub in ast.walk(target):
                    if isinstance(sub, ast.Name):
                        names.add(sub.id)
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            for sub in ast.walk(node.target):
                if isinstance(sub, ast.Name):
                    names.add(sub.id)
    return names


def _own_scope_nodes(fn):
    """Every node belonging to this function's OWN scope.

    Nested functions and lambdas are excluded — their bodies are separate scopes, checked
    on their own pass. Walking into them was what made the first version of this test report
    a closure's outer variables as undefined.
    """
    nodes = []

    def descend(node, is_root=False):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                # The def itself binds a name here; its body is a different scope.
                nodes.append(child)
                continue
            nodes.append(child)
            descend(child)

    descend(fn, is_root=True)
    return nodes


def _names_bound_in(fn):
    """Every name this function binds in its own scope, by any means Python offers."""
    bound = set()

    args = fn.args
    for arg in list(args.args) + list(args.kwonlyargs) + list(args.posonlyargs):
        bound.add(arg.arg)
    if args.vararg:
        bound.add(args.vararg.arg)
    if args.kwarg:
        bound.add(args.kwarg.arg)

    for node in _own_scope_nodes(fn):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            bound.add(node.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                bound.add((alias.asname or alias.name).split('.')[0])
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bound.add(node.name)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bound.add(node.name)
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            for sub in ast.walk(node.target):
                if isinstance(sub, ast.Name):
                    bound.add(sub.id)
        elif isinstance(node, ast.withitem) and node.optional_vars:
            for sub in ast.walk(node.optional_vars):
                if isinstance(sub, ast.Name):
                    bound.add(sub.id)
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            bound.update(node.names)

    # Comprehensions have their own scope in Python 3, but their targets are only ever read
    # inside that comprehension — treating them as bound here is the simple, safe direction.
    for node in ast.walk(fn):
        if isinstance(node, ast.comprehension):
            for sub in ast.walk(node.target):
                if isinstance(sub, ast.Name):
                    bound.add(sub.id)

    return bound


def _undefined_names_in_module(path):
    """(function_name, lineno, name) for each read of a name nothing binds."""
    tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
    module_names = _module_level_names(tree)

    # Map each function to the names its ENCLOSING functions bind, so a closure reading an
    # outer variable is not reported.
    enclosing = {}

    def walk_scope(node, inherited):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                enclosing[child] = inherited
                walk_scope(child, inherited | _names_bound_in(child))
            else:
                walk_scope(child, inherited)

    walk_scope(tree, set())

    findings = []
    for fn, outer in enclosing.items():
        available = _names_bound_in(fn) | outer | module_names | BUILTIN_NAMES
        for node in _own_scope_nodes(fn):
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                if node.id not in available:
                    findings.append((fn.name, node.lineno, node.id))
    return sorted(set(findings))


ALL_SOURCES = sorted(APP_DIR.rglob('*.py'))


def test_there_are_sources_to_check():
    """A silently empty file list would make every assertion below vacuous."""
    assert len(ALL_SOURCES) > 10


@pytest.mark.parametrize('path', ALL_SOURCES, ids=lambda p: str(p.relative_to(APP_DIR)))
def test_no_function_reads_a_name_nothing_binds(path):
    findings = _undefined_names_in_module(path)
    assert not findings, (
        f"{path.relative_to(BACKEND_ROOT)} reads name(s) that are never bound — this raises "
        f"NameError at runtime, only on the line that executes it:\n"
        + '\n'.join(f"  line {lineno} in {fn}(): '{name}'" for fn, lineno, name in findings)
    )


def test_the_checker_actually_catches_the_original_bug(tmp_path):
    """Without this, a checker that silently found nothing would pass just as happily.

    Reproduces the exact shape of the shipped bug: a name used after a commit, defined
    nowhere.
    """
    sample = tmp_path / 'sample.py'
    sample.write_text(
        "def send_invite(target):\n"
        "    save(target)\n"
        "    if instructor:\n"
        "        return 'instructor template'\n"
        "    return 'standard template'\n",
        encoding='utf-8',
    )
    findings = _undefined_names_in_module(sample)
    assert ('send_invite', 3, 'instructor') in findings


def test_the_checker_does_not_flag_a_closure_reading_an_outer_variable(tmp_path):
    """The naive version of this check reported ~37 of these across the app."""
    sample = tmp_path / 'closure.py'
    sample.write_text(
        "import smtplib\n"
        "\n"
        "def send(to_email, subject):\n"
        "    def worker():\n"
        "        smtplib.SMTP().sendmail(to_email, subject)\n"
        "    return worker\n",
        encoding='utf-8',
    )
    assert _undefined_names_in_module(sample) == []
