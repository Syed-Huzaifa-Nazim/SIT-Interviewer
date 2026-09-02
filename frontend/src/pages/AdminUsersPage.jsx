import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Input from '../components/ui/Input';
import Pagination from '../components/ui/Pagination';
import BulkEmailModal from '../components/admin/BulkEmailModal';
import { SIGNUP_CATEGORIES, INTERVIEW_STATUS_LABELS, isInstructorCategory, isResumeCategory, formatCnic, hasPermission } from '../utils/constants';
import { Button as UiButton } from '@/components/shadcn/button';
import { UnderlineTabs } from '@/components/shadcn/tabs';
import {
  AdminPageHeader,
  AdminSearch,
  AdminPageSkeleton,
  AdminTableCard,
} from '@/components/shadcn/page';
import { AdminFilter } from '@/components/shadcn/filter';

const PAGE_SIZE = 10;
import {
  Users,
  Ban,
  UserCheck,
  Key,
  Coins,
  Pencil,
  Send,
  X,
  Award,
  Briefcase,
  Trash2,
  AlertTriangle,
  ScanFace,
  MessageSquare,
  Mail,
  History,
  Download,
  ChevronDown,
  Check,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

const INTERVIEW_STATUS_VARIANTS = {
  not_interviewed: 'neutral',
  invited: 'info',
  interview_completed: 'success',
  reinterview_pending: 'warning',
  reinterview_approved: 'primary',
  reinterview_rejected: 'error',
};

// Shared select styling for the profile-editor form fields below.
const selectClass = 'w-full glass-input text-sm appearance-none cursor-pointer';

// Apply the three column facets + free-text search to a user list. Shared by the live
// table filter so the visible rows and the per-column counts can never drift apart.
const applyFilterSet = (list, { course, istatus, access }, search) => {
  const q = search.toLowerCase();
  return list.filter((u) => {
    if (course.length && !course.includes(u.course_category)) return false;
    if (istatus.length && !istatus.includes(u.interview_status)) return false;
    if (access.length && !access.includes(u.status)) return false;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.job_role?.toLowerCase().includes(q) ||
      u.cnic?.toLowerCase().includes(q) ||
      u.course_category?.toLowerCase().includes(q)
    );
  });
};

/**
 * The candidate's interview deadline — User.otp_expires_at, set from the per-row "Deadline"
 * in the Bulk Email Module. Past it, their one-time login stops working.
 *
 * Renders nothing at all when there is no deadline, which is the normal case for organic
 * signups, instructor accounts and individual admin invites: those have always had a
 * non-expiring credential, and showing them an empty "—" would imply a deadline exists and
 * is merely unset. Only an actual deadline is worth a line.
 */
const DeadlineLabel = ({ expiresAt }) => {
  if (!expiresAt) return null;
  const due = new Date(expiresAt);
  if (Number.isNaN(due.getTime())) return null;
  const expired = due.getTime() < Date.now();
  return (
    <span
      className={`text-[9px] font-semibold ${
        expired ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
      }`}
      title={`Interview deadline: ${due.toLocaleString()}`}
    >
      {expired ? 'Expired ' : 'Due '}
      {due.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
    </span>
  );
};

/** One cohort filter chip on the Bulk Invited tab. */
const BatchChip = ({ label, count, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={label}
    className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
      active
        ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300'
        : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
    }`}
  >
    <span className="truncate">{label}</span>
    <span className="shrink-0 tabular-nums opacity-60">{count}</span>
  </button>
);

// Export CSV — the 4 exportable columns, in the fixed order the download uses.
// `header` is the literal CSV column name (lowercase, per spec); `field` is the key on
// the user object this page already has in memory (course_category holds "Category").
const CSV_FIELD_DEFS = [
  { key: 'name', field: 'name', header: 'name', label: 'Name' },
  { key: 'email', field: 'email', header: 'email', label: 'Email' },
  { key: 'cnic', field: 'cnic', header: 'cnic', label: 'CNIC' },
  { key: 'category', field: 'course_category', header: 'category', label: 'Category' },
];

// Quotes a CSV cell only when it actually needs it (contains a comma, quote, or newline),
// doubling any embedded quotes — the standard CSV escaping rule (RFC 4180).
const csvCell = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const AdminUsersPage = () => {
  const { user: currentAdmin } = useAuth();
  // Which of this page's actions the CURRENT admin may take — a narrowly-permissioned
  // admin sees the same table (already company-scoped) but not buttons for actions their
  // account can't perform; the actual gate is server-side (admin_routes.py), this is just
  // the UI matching it instead of showing a control that would 403.
  const canWriteCandidates = hasPermission(currentAdmin, 'candidates:write');
  const canSendInvites = hasPermission(currentAdmin, 'invites:send');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filter/tab/page/batch state lives in the URL (not plain useState) so a filtered view is
  // itself linkable/bookmarkable/shareable, and so navigating into a user's profile and back
  // returns to exactly the view the admin left instead of resetting it.
  const [searchParams, setSearchParams] = useSearchParams();
  // 'enrolled' = people who signed up themselves, 'bulk' = accounts created by the Bulk
  // Email Module, 'resume' = the Resume-Based category, kept separate so its assessment is
  // not reviewed mixed in with the others. Together they cover every user exactly once, so
  // there is no separate "all" view.
  const tabParam = searchParams.get('tab');
  const activeTab = ['bulk', 'resume'].includes(tabParam) ? tabParam : 'enrolled';
  const searchTerm = searchParams.get('q') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const batchFilter = searchParams.get('batch') ? Number(searchParams.get('batch')) : null;
  // Column filters (applied state) — multi-select facets stored as comma lists. Living in
  // the URL means a filtered view survives a refresh and can be shared/bookmarked, same as
  // every other filter on this page.
  const courseFilters = useMemo(
    () => (searchParams.get('course') ? searchParams.get('course').split(',').filter(Boolean) : []),
    [searchParams]
  );
  const istatusFilters = useMemo(
    () => (searchParams.get('istatus') ? searchParams.get('istatus').split(',').filter(Boolean) : []),
    [searchParams]
  );
  const accessFilters = useMemo(
    () => (searchParams.get('access') ? searchParams.get('access').split(',').filter(Boolean) : []),
    [searchParams]
  );

  // Merge a patch into the current URL search params. `replace: true` so filtering/paging
  // doesn't spam browser history — Back should leave the page, not just undo one keystroke.
  const patchParams = (patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === '' || v === undefined) next.delete(k);
        else next.set(k, String(v));
      });
      return next;
    }, { replace: true });
  };

  const setSearchTerm = (val) => patchParams({ q: val, page: null });
  const setActiveTab = (tab) => patchParams({ tab, page: null });
  const setPage = (p) => patchParams({ page: p > 1 ? p : null });

  const [batchHistoryOpen, setBatchHistoryOpen] = useState(false);
  const [batchHistory, setBatchHistory] = useState([]);
  const [batchHistoryLoading, setBatchHistoryLoading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [overrideUserId, setOverrideUserId] = useState(null);
  const [overrideVal, setOverrideVal] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  // Full-profile editor modal (§4.1)
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  // Proctoring review (snapshot + summary) for the edited candidate's latest interview
  const [proctoring, setProctoring] = useState(null);
  const [proctoringLoading, setProctoringLoading] = useState(false);

  // Type-to-confirm user deletion modal (irreversible). The confirm-text input's own state
  // lives in the DeleteUserModal child component, not here — otherwise every keystroke
  // re-rendered this entire page (including the full user table + its filter/map below),
  // which measured at ~300ms per keystroke in Chrome's Interaction Timing panel.
  const [deleteUser, setDeleteUser] = useState(null);
  const [sendInviteUser, setSendInviteUser] = useState(null);

  // Export CSV — small popover state, kept local since nothing else on the page needs it.
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvFields, setCsvFields] = useState({ name: true, email: true, cnic: true, category: true });
  const [csvExporting, setCsvExporting] = useState(false);
  // Transient toast (auto-dismisses), separate from the page's persistent notice/error
  // banner above the table — this confirmation is about one quick action, not page state.
  const [csvToast, setCsvToast] = useState(null); // { type: 'success' | 'error', message }
  useEffect(() => {
    if (!csvToast) return;
    const t = setTimeout(() => setCsvToast(null), 3200);
    return () => clearTimeout(t);
  }, [csvToast]);

  const fetchUsers = async (silent = false) => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
      if (!silent) setError('Failed to fetch user accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // Silent refresh keeps the online/offline indicators near-real-time (§4.2)
    const poll = setInterval(() => fetchUsers(true), 15000);
    return () => clearInterval(poll);
  }, []);

  // Bulk-email batch history: the backend endpoint already existed, unused by the frontend
  // until now — surfaces it so a batch can be cross-linked to the users it created.
  //
  // Fetched for the Bulk Invited tab as well as the history modal, because the cohort chips
  // under that tab need each batch's name and the users list only carries bulk_batch_id.
  // Guarded on already having the list so switching tabs back and forth doesn't refetch, and
  // scoped to the tab that uses it so the Enrolled tab costs nothing.
  const needsBatches = batchHistoryOpen || activeTab === 'bulk';
  useEffect(() => {
    if (!needsBatches) return;
    setBatchHistoryLoading(true);
    api.get('/admin/bulk-email/batches')
      .then((res) => setBatchHistory(res.data?.batches || []))
      .catch(() => setBatchHistory([]))
      .finally(() => setBatchHistoryLoading(false));
  }, [needsBatches]);

  const handleToggleBan = async (userId) => {
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/admin/users/${userId}/ban`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOverrideTokensSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/admin/users/${overrideUserId}/tokens`, {
        tokens_available: overrideVal
      });
      setOverrideUserId(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user tokens.');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditor = (u) => {
    setEditUser(u);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      cnic: u.cnic || '',
      country: u.country || '',
      course_category: u.course_category || '',
      course_status: u.course_status || '',
      experience_level: u.experience_level || '',
      job_role: u.job_role || '',
      admin_remarks: u.admin_remarks || '',
    });
    // Load the candidate's latest-interview proctoring snapshot for admin review.
    setProctoring(null);
    setProctoringLoading(true);
    api.get(`/admin/users/${u.id}/proctoring`)
      .then((res) => setProctoring(res.data))
      .catch(() => setProctoring(null))
      .finally(() => setProctoringLoading(false));
  };

  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.id]: e.target.value });

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.put(`/admin/users/${editUser.id}/profile`, editForm);
      setNotice(res.data.message || 'Profile updated.');
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update the profile.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendInvite = async (u, difficultyRange) => {
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/admin/users/${u.id}/send-interview-invite`, {
        question_difficulty_range: difficultyRange || null,
      });
      setNotice(res.data.message || 'Invite sent.');
      setSendInviteUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send the interview invite.');
    } finally {
      setActionLoading(false);
    }
  };

  // Post-interview admin email actions (Update §5). kind: 'clearance' | 'hr-invite'
  const handlePostInterviewEmail = async (u, kind) => {
    const label = kind === 'clearance' ? 'clearance (passed) email' : 'HR assessment invitation';
    if (!window.confirm(`Send the ${label} to ${u.name} (${u.email})?`)) return;
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const endpoint = kind === 'clearance' ? 'send-clearance' : 'send-hr-invite';
      const res = await api.post(`/admin/users/${u.id}/${endpoint}`);
      setNotice(res.data.message || 'Email sent.');
      // Refresh so the "sent on" timestamp updates in the open modal + table.
      const updated = res.data.user;
      if (updated) {
        setUsers((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
        setEditUser((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      }
      fetchUsers(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send the email.');
    } finally {
      setActionLoading(false);
    }
  };

  // Email the candidate their proctoring snapshot + termination/30-day-block notice.
  const handleSendProctorSnapshot = async (u) => {
    if (!window.confirm(
      `Email the proctoring snapshot and termination notice to ${u.name} (${u.email})?`
    )) return;
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/admin/users/${u.id}/send-proctor-snapshot`);
      setNotice(res.data.message || 'Snapshot emailed to the candidate.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to email the snapshot.');
    } finally {
      setActionLoading(false);
    }
  };

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : null);

  // Delete a user account permanently (type-to-confirm). Admins are non-deletable.
  const handleDeleteUser = async (targetUser) => {
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.delete(`/admin/users/${targetUser.id}`);
      setNotice(res.data.message || 'User deleted.');
      setDeleteUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the user.');
    } finally {
      setActionLoading(false);
    }
  };

  // Memoized so this only recomputes when the user list or search term actually change —
  // not on every unrelated re-render (e.g. typing in an open modal elsewhere on the page).
  // Split by origin first: bulk_batch_id is set only on accounts the Bulk Email Module
  // created, so a null value is exactly "this person signed up themselves".
  const tabUsers = useMemo(() => {
    // Resume-Based candidates get their own tab so their assessment is not reviewed mixed in
    // with the other categories (Resume §4.1). They are split out FIRST and excluded from
    // the other two: they always self-enrol (bulk invites refuse this category, since a
    // spreadsheet row cannot carry a CV), so they would otherwise sit inside Enrolled Users.
    const byTab = users.filter((u) => {
      if (isResumeCategory(u.course_category)) return activeTab === 'resume';
      if (activeTab === 'resume') return false;
      return activeTab === 'bulk' ? u.bulk_batch_id != null : u.bulk_batch_id == null;
    });
    return batchFilter == null ? byTab : byTab.filter((u) => u.bulk_batch_id === batchFilter);
  }, [users, activeTab, batchFilter]);

  const filteredUsers = useMemo(
    () => applyFilterSet(
      tabUsers,
      { course: courseFilters, istatus: istatusFilters, access: accessFilters },
      searchTerm
    ),
    [tabUsers, searchTerm, courseFilters, istatusFilters, accessFilters]
  );

  const toggleCsvField = (key) => setCsvFields((prev) => ({ ...prev, [key]: !prev[key] }));

  // Exports the currently relevant dataset — the same rows the table itself shows right
  // now (active tab + search + column filters applied), not just the current page slice,
  // so the file matches what the admin is actually looking at.
  const handleExportCsv = () => {
    const activeFields = CSV_FIELD_DEFS.filter((f) => csvFields[f.key]);
    if (!activeFields.length) return;
    setCsvExporting(true);
    // A brief, genuine "working" moment rather than an instant flash — the export itself
    // is fast, but a state the eye can never register isn't a loading state at all.
    window.setTimeout(() => {
      try {
        const headerRow = activeFields.map((f) => f.header).join(',');
        const rows = filteredUsers.map((u) => activeFields.map((f) => csvCell(u[f.field])).join(','));
        const csvContent = [headerRow, ...rows].join('\r\n');
        // Leading BOM so Excel opens UTF-8 content (accented names, etc.) correctly
        // instead of mis-decoding it.
        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sit-users-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setCsvToast({
          type: 'success',
          message: `Exported ${filteredUsers.length} user${filteredUsers.length === 1 ? '' : 's'} to CSV.`,
        });
        setCsvOpen(false);
      } catch (err) {
        console.error(err);
        setCsvToast({ type: 'error', message: 'Failed to export CSV. Please try again.' });
      } finally {
        setCsvExporting(false);
      }
    }, 250);
  };

  // Per-option counts shown next to each checkbox — computed against the current tab +
  // search only, deliberately ignoring the OTHER draft facets, so ticking one box never
  // makes the rest of the list's counts jump around underneath the admin.
  const courseCounts = useMemo(() => {
    const counts = {};
    tabUsers.forEach((u) => { if (u.course_category) counts[u.course_category] = (counts[u.course_category] || 0) + 1; });
    return counts;
  }, [tabUsers]);
  const istatusCounts = useMemo(() => {
    const counts = {};
    tabUsers.forEach((u) => { counts[u.interview_status] = (counts[u.interview_status] || 0) + 1; });
    return counts;
  }, [tabUsers]);
  const accessCounts = useMemo(() => {
    const counts = {};
    tabUsers.forEach((u) => { counts[u.status] = (counts[u.status] || 0) + 1; });
    return counts;
  }, [tabUsers]);

  // The toolbar filter and the per-column funnels are two views of ONE piece of URL
  // state, so a change in either is immediately reflected in the other and a filtered
  // view stays shareable however it was built.
  const filterGroups = useMemo(
    () => [
      {
        key: 'course',
        label: 'Course',
        options: SIGNUP_CATEGORIES.map((cat) => ({ value: cat, label: cat, count: courseCounts[cat] || 0 })),
      },
      {
        key: 'istatus',
        label: 'Interview status',
        options: Object.entries(INTERVIEW_STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
          count: istatusCounts[value] || 0,
        })),
      },
      {
        key: 'access',
        label: 'Access',
        options: [
          { value: 'active', label: 'Active', count: accessCounts.active || 0 },
          { value: 'banned', label: 'Banned', count: accessCounts.banned || 0 },
        ],
      },
    ],
    [courseCounts, istatusCounts, accessCounts]
  );

  const filterValue = useMemo(
    () => ({ course: courseFilters, istatus: istatusFilters, access: accessFilters }),
    [courseFilters, istatusFilters, accessFilters]
  );

  const applyFilterValue = (next) =>
    patchParams({
      course: next.course?.length ? next.course.join(',') : null,
      istatus: next.istatus?.length ? next.istatus.join(',') : null,
      access: next.access?.length ? next.access.join(',') : null,
      page: null,
    });

  // Resume-Based accounts are counted only under their own tab, never under Enrolled Users,
  // so the three counts add up to the whole list exactly once.
  const { enrolledCount, bulkCount, resumeCount } = useMemo(() => {
    let enrolled = 0, bulk = 0, resume = 0;
    users.forEach((u) => {
      if (isResumeCategory(u.course_category)) resume += 1;
      else if (u.bulk_batch_id == null) enrolled += 1;
      else bulk += 1;
    });
    return { enrolledCount: enrolled, bulkCount: bulk, resumeCount: resume };
  }, [users]);

  // One chip per batch that still has accounts, newest first, counted from the users already
  // in memory rather than asking the server. A batch whose accounts were all since deleted is
  // dropped: the chip would filter to an empty table and there would be no way to tell why.
  const batchChips = useMemo(() => {
    const counts = new Map();
    users.forEach((u) => {
      if (u.bulk_batch_id == null) return;
      counts.set(u.bulk_batch_id, (counts.get(u.bulk_batch_id) || 0) + 1);
    });
    return batchHistory
      .filter((b) => counts.has(b.id))
      .map((b) => ({
        id: b.id,
        // display_name is the admin's batch name, falling back server-side to the subject
        // line for batches sent before naming existed.
        label: b.display_name || b.batch_name || b.subject || `Batch #${b.id}`,
        count: counts.get(b.id),
      }));
  }, [users, batchHistory]);

  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <AdminPageSkeleton rows={8} cols={6} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Users}
        title="User Accounts"
        subtitle="Edit candidate profiles, manage course status, send invites and monitor who is online."
        actions={
          <>
            {canSendInvites && (
              <UiButton variant="outline" size="sm" onClick={() => setBatchHistoryOpen(true)}>
                <History /> Batch History
              </UiButton>
            )}
            {canSendInvites && (
              <UiButton variant="brand" size="sm" onClick={() => setBulkOpen(true)}>
                <Mail /> Bulk Email
              </UiButton>
            )}
            {hasPermission(currentAdmin, 'candidates:read') && (
              <ExportCsvMenu
                open={csvOpen}
                onOpenChange={setCsvOpen}
                fields={csvFields}
                onToggleField={toggleCsvField}
                onExport={handleExportCsv}
                exporting={csvExporting}
              />
            )}
          </>
        }
      >
        <AdminSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, email, CNIC, category, or role…"
        >
          <AdminFilter groups={filterGroups} value={filterValue} onChange={applyFilterValue} />
        </AdminSearch>
      </AdminPageHeader>

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <UnderlineTabs
        groupId="users"
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          { value: 'enrolled', label: 'Enrolled Users', count: enrolledCount },
          { value: 'bulk', label: 'Bulk Invited', count: bulkCount },
          { value: 'resume', label: 'Resume-Based', count: resumeCount },
        ]}
      />

      {/* Cohort chips — one per bulk-email batch that actually created accounts, so an admin
          running several intakes can pull up just one ("Spring 2026 Intake") instead of
          scrolling every bulk-invited user together. This replaced a plain "showing batch #N"
          banner, which could only ever be reached from the Batch History modal and showed an
          id rather than a name.

          Only rendered on the Bulk Invited tab: batches are what defines that tab, and an
          enrolled (organic) account has no batch to belong to. */}
      {activeTab === 'bulk' && batchChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Batch
          </span>
          <BatchChip
            label="All"
            count={bulkCount}
            active={batchFilter == null}
            onClick={() => patchParams({ batch: null, page: null })}
          />
          {batchChips.map((b) => (
            <BatchChip
              key={b.id}
              label={b.label}
              count={b.count}
              active={batchFilter === b.id}
              onClick={() => patchParams({ batch: b.id, page: null })}
            />
          ))}
        </div>
      )}

      <AdminTableCard>
        <div className="overflow-x-auto">
          {/* Raw th/td rather than the shared Table primitives, so it does not inherit their
              px-3. Without it the cells sit flush against the card border and the first and
              last columns look cut off. Applied here rather than on ~20 individual cells. */}
          <table className="w-full border-collapse text-left text-xs [&_td]:px-3 [&_th]:px-3">
            <thead>
              {/* Plain headers. Each of Course / Interview Status / Access used to carry its
                  own funnel dropdown, built before the shared toolbar filter existed — the
                  same three facets, over the same URL state, in a second hand-rolled popover
                  with its own styling. Two controls doing one job made the header noisy and
                  meant a filtered view looked different depending on which one you reached
                  for. The toolbar filter beside the search box is now the single way in. */}
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-3 font-bold">User Details</th>
                <th className="py-3 font-bold">Course</th>
                <th className="py-3 font-bold">Interview Status</th>
                <th className="py-3 font-bold">Access</th>
                <th className="py-3 font-bold text-center">Tokens</th>
                <th className="py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                    No matching user accounts found.
                  </td>
                </tr>
              ) : (
                pagedUsers.map((item) => (
                  <tr key={item.id} className="text-muted-foreground transition-colors hover:bg-accent/60">
                    <td className="py-4 pr-3">
                      <div className="flex items-center gap-2">
                        {/* Real-time presence indicator (§4.2) */}
                        <span
                          className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                            item.online
                              ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                              : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                          title={item.online ? 'Online now' : 'Offline'}
                        />
                        {/* Name jumps straight to the candidate's latest interview report —
                            that's the thing an admin needs on almost every click. Gated on
                            interview_status === 'interview_completed', not just having SOME
                            report: a candidate who is only 'invited' (e.g. a pending
                            re-interview) hasn't sat this attempt yet, so their name must read
                            as non-clickable even if an OLDER interview happens to have a
                            report — "Invite Sent" next to a clickable name was misleading.
                            The Profile hub is backlogged (not linked from anywhere in the
                            UI), so there's nowhere else meaningful to send that click. */}
                        {item.latest_interview_id && item.interview_status === 'interview_completed' ? (
                          <Link
                            to={`/interview/report/${item.latest_interview_id}`}
                            state={{ from: 'Manage Users' }}
                            className="font-bold text-slate-900 dark:text-slate-200 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
                            title="View latest interview report"
                          >
                            {item.name}
                          </Link>
                        ) : (
                          <span className="font-bold text-slate-900 dark:text-slate-200" title="No completed interview to review yet">
                            {item.name}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.email}</div>
                      {item.cnic && (
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{item.cnic}</div>
                      )}
                    </td>

                    <td className="py-4 pr-3">
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {item.course_category || 'Not set'}
                      </div>
                      {isInstructorCategory(item.course_category) ? (
                        <Badge variant="accent" className="mt-1">Instructor</Badge>
                      ) : isResumeCategory(item.course_category) ? (
                        <Badge variant="accent" className="mt-1">Resume-based</Badge>
                      ) : item.course_status ? (
                        <Badge variant={item.course_status === 'completed' ? 'success' : 'info'} className="mt-1">
                          {item.course_status}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-slate-400">Legacy account</span>
                      )}
                    </td>

                    <td className="py-4 pr-3">
                      <Badge variant={INTERVIEW_STATUS_VARIANTS[item.interview_status] || 'neutral'}>
                        {INTERVIEW_STATUS_LABELS[item.interview_status] || item.interview_status}
                      </Badge>
                    </td>

                    <td className="py-4 pr-3">
                      <div className="space-y-0.5 flex flex-col items-start">
                        <Badge variant={item.status === 'active' ? 'success' : 'error'}>
                          {item.status}
                        </Badge>
                        {item.status === 'banned' && item.banned_until && (
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                            Until {new Date(item.banned_until).toLocaleTimeString()}
                          </span>
                        )}
                        {/* Interview deadline (User.otp_expires_at) — the per-row "Deadline"
                            chosen in the Bulk Email Module, after which the candidate's
                            one-time login stops working. It belongs with Access rather than
                            in a column of its own: it is precisely a statement about access,
                            and only bulk-invited rows carry one, so a dedicated column would
                            be mostly empty while widening the table for every tab. */}
                        <DeadlineLabel expiresAt={item.otp_expires_at} />
                      </div>
                    </td>

                    <td className="py-4 text-center font-mono font-bold text-slate-900 dark:text-slate-200">
                      {item.tokens_available}
                    </td>

                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {/* Full Profile hub link removed from the UI (backlogged, not
                            deleted) — /admin/users/:userId and AdminUserProfilePage.jsx
                            still exist and work, just aren't linked to from here anymore. */}
                        {canWriteCandidates && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Pencil}
                            onClick={() => openEditor(item)}
                            disabled={actionLoading}
                            className="!p-2 !rounded-lg"
                            title="Quick Edit Profile"
                          />
                        )}
                        {/* Statusless categories qualify by category — requiring 'completed'
                            of them would demand a field they can never have. Mirrors the
                            same rule the backend invite endpoint enforces. */}
                        {canSendInvites && (item.course_status === 'completed'
                          || isInstructorCategory(item.course_category)
                          || isResumeCategory(item.course_category)) && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={Send}
                            onClick={() => setSendInviteUser(item)}
                            disabled={actionLoading}
                            className="!p-2 !rounded-lg"
                            title="Send One-Time Interview Invite"
                          />
                        )}
                        {canWriteCandidates && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Key}
                            onClick={() => {
                              setOverrideUserId(item.id);
                              setOverrideVal(item.tokens_available);
                            }}
                            disabled={actionLoading}
                            className="!p-2 !rounded-lg"
                            title="Assign Custom Tokens"
                          />
                        )}
                        {canWriteCandidates && (
                          <Button
                            variant={item.status === 'active' ? 'danger' : 'success'}
                            size="sm"
                            icon={item.status === 'active' ? Ban : UserCheck}
                            onClick={() => handleToggleBan(item.id)}
                            disabled={actionLoading}
                            className="!p-2 !rounded-lg"
                            title={item.status === 'active' ? 'Ban Account' : 'Unban Account'}
                          />
                        )}
                        {canWriteCandidates && (
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setDeleteUser(item)}
                            disabled={actionLoading}
                            className="!p-2 !rounded-lg"
                            title="Delete Account Permanently"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3">
          <Pagination page={page} total={filteredUsers.length} onChange={setPage} />
        </div>
      </AdminTableCard>

      {/* Token override modal (unchanged behavior) */}
      {overrideUserId !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleOverrideTokensSubmit}
            className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-primary-500/30 space-y-5 shadow-2xl relative"
          >
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="text-primary-400" size={18} />
              <span>Assign Custom Tokens</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
              Enter the new token balance for this candidate. This will immediately override their previous balance.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">New Token Balance</label>
              <input
                type="number"
                min="0"
                className="w-full glass-input text-sm text-center font-bold"
                value={overrideVal}
                onChange={(e) => setOverrideVal(parseInt(e.target.value))}
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOverrideUserId(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={actionLoading}
                disabled={actionLoading}
              >
                {actionLoading ? 'Updating...' : 'Set Balance'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Full profile editor modal (§4.1). Rendered through a portal to document.body so
          it is positioned relative to the viewport, not the layout's animated (transformed)
          content wrapper — a transformed ancestor would otherwise become the containing
          block for `fixed`, clipping the modal under the header. */}
      {editUser !== null && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleEditSubmit}
            className="w-full max-w-lg glass-panel rounded-2xl border border-primary-500/30 shadow-2xl relative flex flex-col max-h-[88vh]"
          >
            <div className="flex items-center justify-between p-6 pb-3 shrink-0 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="text-primary-400" size={17} />
                <span>Edit Candidate Profile</span>
              </h3>
              <button type="button" onClick={() => setEditUser(null)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body — header and footer stay fixed so the Save button is
                always reachable no matter how long the content gets. */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="name" type="text" label="Full Name" value={editForm.name} onChange={handleEditChange} required />
              <Input id="email" type="email" label="Email Address" value={editForm.email} onChange={handleEditChange} required />
              <Input id="cnic" type="text" label="CNIC Number" value={editForm.cnic} onChange={handleEditChange} placeholder="42101-1234567-1" />
              <Input id="country" type="text" label="Country" value={editForm.country} onChange={handleEditChange} />

              <div className="space-y-1.5">
                <label htmlFor="course_category" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category</label>
                <select id="course_category" value={editForm.course_category} onChange={handleEditChange} className={selectClass}>
                  <option value="">Not set</option>
                  {SIGNUP_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Instructors and Resume-Based candidates carry no course status
                  (Update §2 / Resume §1.1). */}
              {!isInstructorCategory(editForm.course_category)
                && !isResumeCategory(editForm.course_category) && (
                <div className="space-y-1.5">
                  <label htmlFor="course_status" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Course Status</label>
                  <select id="course_status" value={editForm.course_status} onChange={handleEditChange} className={selectClass}>
                    <option value="">Not set</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed (with certification)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
                    Changing to "Completed" does not send credentials automatically — use the send-invite action afterwards.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="experience_level" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Experience Level</label>
                <select id="experience_level" value={editForm.experience_level} onChange={handleEditChange} className={selectClass}>
                  <option value="">Not set</option>
                  <option value="Entry">Entry</option>
                  <option value="Mid">Mid</option>
                  <option value="Senior">Senior</option>
                </select>
              </div>

              <Input id="job_role" type="text" label="Job Role" value={editForm.job_role} onChange={handleEditChange} />
            </div>

            {/* Post-Interview Actions (Update §5): clearance + HR assessment invite,
                with a visible sent-history audit trail. */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Post-Interview Actions
                </span>
                {editUser.interview_status === 'interview_completed' && (
                  <Badge variant="success">Interview Completed</Badge>
                )}
              </div>
              {editUser.interview_status !== 'interview_completed' && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
                  This candidate has not completed an interview yet. These emails are intended for cleared candidates —
                  send only after reviewing their interview.
                </p>
              )}
              <div className="flex flex-wrap gap-2.5">
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  icon={Award}
                  onClick={() => handlePostInterviewEmail(editUser, 'clearance')}
                  disabled={actionLoading}
                >
                  Send Clearance Email
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Briefcase}
                  onClick={() => handlePostInterviewEmail(editUser, 'hr-invite')}
                  disabled={actionLoading}
                >
                  Send HR Assessment Invite
                </Button>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5">
                <div>
                  Clearance email:{' '}
                  {fmtDate(editUser.clearance_email_sent_at)
                    ? <b className="text-slate-700 dark:text-slate-300">sent {fmtDate(editUser.clearance_email_sent_at)}</b>
                    : <span className="italic">not sent yet</span>}
                </div>
                <div>
                  HR assessment invite:{' '}
                  {fmtDate(editUser.hr_invite_sent_at)
                    ? <b className="text-slate-700 dark:text-slate-300">sent {fmtDate(editUser.hr_invite_sent_at)}</b>
                    : <span className="italic">not sent yet</span>}
                </div>
              </div>
            </div>

            {/* Proctoring review (admin-only): the camera snapshot + summary from the
                candidate's latest interview — captured on completion or auto-termination. */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <ScanFace size={14} className="text-slate-500 dark:text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Proctoring Review
                </span>
                {proctoring?.is_proctor_failed && <Badge variant="error">Proctor Failed</Badge>}
                {proctoring?.has_interview && !proctoring?.is_proctor_failed && proctoring?.status === 'completed' && (
                  <Badge variant="success">Completed</Badge>
                )}
              </div>

              {proctoringLoading ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">Loading snapshot…</p>
              ) : !proctoring?.has_interview ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  No interview on record for this candidate yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {proctoring.snapshot_image ? (
                    <a href={proctoring.snapshot_image} target="_blank" rel="noopener noreferrer" className="inline-block" title="Click to view full size">
                      <img
                        src={proctoring.snapshot_image}
                        alt="Interview proctoring snapshot"
                        className="h-28 w-auto rounded-lg border border-slate-200 dark:border-slate-700 hover:opacity-90 transition"
                      />
                    </a>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                      No camera snapshot was captured for this interview.
                    </p>
                  )}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                    {proctoring.snapshot_description && (
                      <div><span className="font-semibold text-slate-600 dark:text-slate-300">System note:</span> {proctoring.snapshot_description}</div>
                    )}
                    <div>Violations recorded: <b className="text-slate-700 dark:text-slate-300">{proctoring.proctor_violations_count}</b></div>
                  </div>

                  {proctoring.snapshot_image && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={Send}
                      onClick={() => handleSendProctorSnapshot(editUser)}
                      disabled={actionLoading}
                    >
                      Email Snapshot to Candidate
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Admin remarks (admin-only): free-form notes about the candidate. Saved with
                the profile; never shown to the candidate. */}
            <div className="space-y-1.5">
              <label htmlFor="admin_remarks" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <MessageSquare size={13} /> Admin Remarks
              </label>
              <textarea
                id="admin_remarks"
                value={editForm.admin_remarks}
                onChange={handleEditChange}
                rows={3}
                placeholder="Notes about this candidate (visible to admins only)…"
                className="w-full glass-input text-sm resize-y"
              />
            </div>

            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={actionLoading} disabled={actionLoading}>
                {actionLoading ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Type-to-confirm user deletion modal (irreversible, cascades all their data). Its
          own input state lives inside DeleteUserModal so typing never re-renders this page. */}
      {deleteUser !== null && (
        <DeleteUserModal
          user={deleteUser}
          loading={actionLoading}
          onCancel={() => setDeleteUser(null)}
          onConfirm={handleDeleteUser}
        />
      )}

      {sendInviteUser !== null && (
        <SendInviteModal
          user={sendInviteUser}
          loading={actionLoading}
          onCancel={() => setSendInviteUser(null)}
          onConfirm={handleSendInvite}
        />
      )}

      {/* Batch History: surfaces the previously-unused GET /admin/bulk-email/batches
          endpoint. Each row links back to the users that batch created. */}
      {batchHistoryOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl glass-panel rounded-2xl border border-primary-500/30 shadow-2xl relative flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 pb-3 shrink-0 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <History className="text-primary-400" size={17} />
                <span>Bulk Email Batch History</span>
              </h3>
              <button type="button" onClick={() => setBatchHistoryOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {batchHistoryLoading ? (
                <Spinner label="Loading batch history..." />
              ) : batchHistory.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">No bulk-email batches have been sent yet.</p>
              ) : (
                batchHistory.map((b) => (
                  <div key={b.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3">
                    <div>
                      {/* The batch name leads when there is one — it is what the admin chose
                          to call this cohort. The subject line then drops to the detail row
                          rather than disappearing, since it is still what recipients saw. */}
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
                        {b.display_name || b.subject}
                      </div>
                      {b.batch_name && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          Subject: {b.subject}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {b.file_name || 'manual entry'} · {fmtDate(b.created_at)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <b className="text-slate-700 dark:text-slate-300">{b.sent_count}</b>/{b.total_count} sent
                        {b.failed_count > 0 && <span className="text-red-500"> · {b.failed_count} failed</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={b.status === 'complete' ? 'success' : b.status === 'sending' ? 'warning' : 'neutral'}>
                        {b.status}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setBatchHistoryOpen(false);
                          patchParams({ tab: 'bulk', batch: b.id, page: null });
                        }}
                      >
                        View Recipients
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Email Module. Reloads the user list on completion so the newly created
          accounts appear under the "Bulk Invited Users" tab straight away. */}
      <BulkEmailModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSent={() => { fetchUsers(true); setActiveTab('bulk'); }}
      />

      {csvToast && <ExportCsvToast toast={csvToast} onDismiss={() => setCsvToast(null)} />}
    </div>
  );
};

// Export CSV — small popover, styled to match AdminFilter's popover exactly (same
// container classes, same custom-checkbox pattern) so it reads as native to this page
// rather than a one-off control with its own look.
const ExportCsvMenu = ({ open, onOpenChange, fields, onToggleField, onExport, exporting }) => {
  const noneSelected = !fields.name && !fields.email && !fields.cnic && !fields.category;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <UiButton variant="default" size="sm">
          <Download /> Export CSV <ChevronDown className="size-3.5 opacity-70" />
        </UiButton>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            'z-50 w-64 rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2'
          )}
        >
          <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <FileSpreadsheet className="size-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground">Export Users</span>
          </header>

          <p className="px-3 pt-2.5 text-[10px] text-muted-foreground">
            Download user data as CSV file with:
          </p>

          <div className="p-2">
            {CSV_FIELD_DEFS.map((f) => {
              const checked = fields[f.key];
              return (
                <label
                  key={f.key}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors',
                    checked ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-accent'
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-[5px] border transition-all',
                      checked ? 'border-primary bg-primary' : 'border-input bg-card'
                    )}
                  >
                    {checked && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleField(f.key)}
                    className="sr-only"
                  />
                  <span className="text-xs font-medium text-foreground">{f.label}</span>
                </label>
              );
            })}
          </div>

          <div className="border-t border-border p-2">
            <UiButton
              variant="default"
              size="sm"
              className="w-full"
              onClick={onExport}
              disabled={exporting || noneSelected}
            >
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download />}
              {exporting ? 'Preparing…' : 'Download CSV'}
            </UiButton>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

// Small transient confirmation, separate from the page's persistent notice/error banner —
// auto-dismisses on its own (see the csvToast effect above) so a quick export doesn't leave
// a banner sitting at the top of the page needing to be dismissed by hand.
const ExportCsvToast = ({ toast, onDismiss }) => {
  const isError = toast.type === 'error';
  return createPortal(
    <div
      role="status"
      className={cn(
        'fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
        isError
          ? 'border-red-500/30 bg-red-500/10 text-red-400'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      )}
    >
      {isError ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle className="size-4 shrink-0" />}
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 shrink-0 opacity-60 hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>,
    document.body
  );
};

// Question Difficulty Range choices — kept in sync with backend/app/utils/difficulty.py's
// DIFFICULTY_RANGES/RANGE_LABELS. No range set (the default) preserves today's behavior
// exactly: the candidate's own difficulty choice at interview start is left alone.
const DIFFICULTY_RANGE_CHOICES = [
  { value: '', label: "Candidate's own choice (no range)" },
  { value: 'EASY_TO_MEDIUM', label: 'Easy to Medium' },
  { value: 'MEDIUM_TO_HARD', label: 'Medium to Hard' },
  { value: 'EASY_TO_HARD', label: 'Easy to Hard' },
];

const SendInviteModal = ({ user, loading, onCancel, onConfirm }) => {
  const [difficultyRange, setDifficultyRange] = useState(user.question_difficulty_range || '');

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-primary-500/30 space-y-5 shadow-2xl">
        <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
          <Send className="text-primary-400" size={18} />
          <span>Send Interview Invite</span>
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Send one-time interview credentials to <b className="text-slate-900 dark:text-white">{user.name}</b> ({user.email})?
          Their password login (if any) will stop working and a fresh one-time password will be emailed. It can be used to log in exactly once.
        </p>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Question Difficulty Range
          </label>
          <select
            className="w-full glass-input text-sm"
            value={difficultyRange}
            onChange={(e) => setDifficultyRange(e.target.value)}
          >
            {DIFFICULTY_RANGE_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Pins the difficulty this candidate's questions progress through. Leave as "Candidate's own choice" for today's default behavior.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Send}
            loading={loading}
            onClick={() => onConfirm(user, difficultyRange)}
          >
            Send Invite
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Isolated from AdminUsersPage so typing in the confirm field only re-renders this small
// component, not the parent page's full (potentially large) user table.
const DeleteUserModal = ({ user, loading, onCancel, onConfirm }) => {
  const [confirmText, setConfirmText] = useState('');
  const matchText = user.cnic || user.name;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel p-6 rounded-2xl border border-red-500/40 space-y-5 shadow-2xl">
        <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="text-red-500" size={19} />
          <span>Delete User Permanently</span>
        </h3>
        <div className="p-3.5 bg-red-500/5 border border-red-500/20 rounded-xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
          <p>
            This permanently deletes <b className="text-slate-900 dark:text-white">{user.name}</b>{' '}
            ({user.email}) and <b>all of their data</b> — interview history, reports,
            transcripts, session recordings and answer audio, tokens, transactions, feedback,
            and notifications. This cannot be undone.
          </p>
          <p>
            Type <b className="font-mono text-red-600 dark:text-red-400">{matchText}</b> below to confirm.
          </p>
        </div>

        <input
          type="text"
          className="w-full glass-input text-sm font-mono"
          placeholder={matchText}
          value={confirmText}
          onChange={(e) =>
            // Only auto-dash when confirming by CNIC (matchText falls back to the
            // candidate's name when they have no CNIC — that must stay untouched).
            setConfirmText(user.cnic ? formatCnic(e.target.value) : e.target.value)
          }
          autoFocus
        />

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={() => onConfirm(user)}
            loading={loading}
            disabled={loading || confirmText.trim() !== matchText}
          >
            Delete Permanently
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdminUsersPage;
