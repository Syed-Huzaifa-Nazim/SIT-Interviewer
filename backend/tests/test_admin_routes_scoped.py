"""Structural guard: no admin route may answer without consulting the caller's scope.

WHY A STRUCTURAL TEST
--------------------
Company scoping had to be applied to forty-odd existing handlers by hand. The forty-first —
written next month, by whoever is not thinking about multi-admin that day — is the one that
leaks, and it leaks silently: the page loads, the data is simply wider than it should be. No
functional test catches that, because these routes need a database and this suite deliberately
cannot touch one.

So the check is made mechanical. Every function registered on `admin_bp` or `bulk_email_bp`
must take the `admin_scope` dependency AND actually read it in its body. Declaring the
parameter and ignoring it is treated as failure, because that is exactly what a copy-pasted
signature looks like.

WHAT THIS DOES *NOT* PROVE
--------------------------
That the filtering is correct. A route could read `scope` and still build a wrong query.
Correctness of the cut itself is covered by tests/test_admin_scope.py; this file only proves
nobody skipped the step entirely. It is a tripwire, not a proof — but the leak it catches is
the one that actually happens.

The companion check at the bottom covers the other half of the same problem: code that tests
`role == 'admin'` by hand. Adding `super_admin` made every such comparison quietly wrong, and
those are just as invisible.
"""

import ast
import pathlib

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_DIR = BACKEND_ROOT / 'app'

# Routers whose endpoints serve per-company data.
SCOPED_ROUTERS = {'admin_bp', 'bulk_email_bp'}

ROUTE_FILES = [
    APP_DIR / 'routes' / 'admin_routes.py',
    APP_DIR / 'routes' / 'bulk_email_routes.py',
]

# Endpoints that legitimately consult no scope. Keep this list SHORT and justified — an
# entry here is a permanent exemption from the only automatic check on cross-company access.
EXEMPT = {
    # Streams a fixed CSV: the required column headers and two invented example rows. It
    # reads nothing from the database at all, so there is nothing for a scope to narrow.
    # (Its sibling /config is NOT exempt — it reports which companies the caller may invite
    # into, which is per-admin.)
    'download_template',
}


def _route_functions(path):
    """(function_node, router_name) for every endpoint registered in one module."""
    tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
    found = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            # @router.get('/path') -> Call(func=Attribute(value=Name(router)))
            if (
                isinstance(dec, ast.Call)
                and isinstance(dec.func, ast.Attribute)
                and isinstance(dec.func.value, ast.Name)
                and dec.func.value.id in SCOPED_ROUTERS
            ):
                found.append((node, dec.func.value.id))
                break
    return found


ALL_ROUTES = [
    pytest.param(fn, router, path, id=f"{path.stem}::{fn.name}")
    for path in ROUTE_FILES
    for fn, router in _route_functions(path)
]


def test_routes_were_actually_discovered():
    """A decorator rename would make every assertion below vacuously pass."""
    assert len(ALL_ROUTES) > 30, f"only found {len(ALL_ROUTES)} routes — is the parser still right?"


@pytest.mark.parametrize('fn,router,path', ALL_ROUTES)
def test_every_admin_route_declares_the_scope_dependency(fn, router, path):
    if fn.name in EXEMPT:
        pytest.skip(f"{fn.name} is explicitly exempt")

    params = [a.arg for a in fn.args.args + fn.args.kwonlyargs]
    assert 'scope' in params, (
        f"{path.name}::{fn.name} serves per-company data but takes no scope. Add\n"
        f"    scope: AdminScope = Depends(admin_scope)\n"
        f"and filter its queries through it, or add it to EXEMPT with a reason."
    )


@pytest.mark.parametrize('fn,router,path', ALL_ROUTES)
def test_every_admin_route_actually_reads_its_scope(fn, router, path):
    """Declaring the parameter and never using it is what a copy-pasted signature looks
    like, and it passes the check above while leaking exactly as much as no scope at all."""
    if fn.name in EXEMPT:
        pytest.skip(f"{fn.name} is explicitly exempt")

    reads_scope = any(
        isinstance(node, ast.Name) and node.id == 'scope' and isinstance(node.ctx, ast.Load)
        for stmt in fn.body
        for node in ast.walk(stmt)
    )
    assert reads_scope, (
        f"{path.name}::{fn.name} takes `scope` but never reads it, so its queries are "
        f"unfiltered. Filter through scope.filter_users / filter_by_owner / "
        f"filter_by_actor / require_user / require_owned."
    )


# ---------------------------------------------------------------------------------------
# Role vocabulary
# ---------------------------------------------------------------------------------------

ROLE_LITERALS = {'admin'}


def _hardcoded_role_comparisons(path):
    """(lineno, source) for each place that compares a role against the bare string 'admin'.

    Adding `super_admin` made every one of these wrong in a way nothing announces: a guard
    reading `target.role == 'admin'` stops protecting super admins, and a lookup reading
    `filter_by(role='admin')` stops finding them. One of those had already broken the
    login-throttle audit row before this check existed.
    """
    source = path.read_text(encoding='utf-8')
    tree = ast.parse(source, filename=str(path))
    lines = source.splitlines()
    findings = []

    for node in ast.walk(tree):
        # role == 'admin' / role != 'admin'
        if isinstance(node, ast.Compare) and isinstance(node.left, ast.Attribute):
            if node.left.attr != 'role':
                continue
            for comparator in node.comparators:
                if isinstance(comparator, ast.Constant) and comparator.value in ROLE_LITERALS:
                    findings.append((node.lineno, lines[node.lineno - 1].strip()))
        # filter_by(role='admin')
        elif isinstance(node, ast.Call):
            for kw in node.keywords:
                if (
                    kw.arg == 'role'
                    and isinstance(kw.value, ast.Constant)
                    and kw.value.value in ROLE_LITERALS
                ):
                    findings.append((node.lineno, lines[node.lineno - 1].strip()))

    return findings


# Every module that makes an authorisation or lookup decision on a role.
ROLE_SOURCES = sorted(
    p for p in (APP_DIR / 'routes').rglob('*.py')
) + [APP_DIR / 'utils' / 'security.py']


@pytest.mark.parametrize('path', ROLE_SOURCES, ids=lambda p: p.name)
def test_no_module_compares_a_role_against_the_bare_string_admin(path):
    findings = _hardcoded_role_comparisons(path)
    assert not findings, (
        f"{path.relative_to(BACKEND_ROOT)} decides on role == 'admin', which excludes "
        f"super_admin and is therefore wrong in one direction or the other. Use "
        f"ADMIN_ROLES / ROLE_SUPER_ADMIN from app.utils.security:\n"
        + '\n'.join(f"  line {lineno}: {src}" for lineno, src in findings)
    )


def test_the_role_checker_catches_the_shape_it_is_looking_for(tmp_path):
    """Without this, a checker that silently matched nothing would pass just as happily."""
    sample = tmp_path / 'sample.py'
    sample.write_text(
        "def guard(target):\n"
        "    if target.role == 'admin':\n"
        "        return True\n"
        "    return User.query.filter_by(role='admin').first()\n",
        encoding='utf-8',
    )
    findings = _hardcoded_role_comparisons(sample)
    assert len(findings) == 2


def test_the_role_checker_accepts_the_correct_form(tmp_path):
    sample = tmp_path / 'ok.py'
    sample.write_text(
        "def guard(target):\n"
        "    if target.role in ADMIN_ROLES:\n"
        "        return True\n"
        "    return User.query.filter(User.role.in_(ADMIN_ROLES)).first()\n",
        encoding='utf-8',
    )
    assert _hardcoded_role_comparisons(sample) == []
