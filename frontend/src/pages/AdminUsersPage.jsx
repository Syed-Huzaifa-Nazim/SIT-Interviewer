import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import SearchBar from '../components/ui/SearchBar';
import Spinner from '../components/ui/Spinner';
import Input from '../components/ui/Input';
import { SIGNUP_CATEGORIES, INTERVIEW_STATUS_LABELS, isInstructorCategory } from '../utils/constants';
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
  MessageSquare
} from 'lucide-react';

const INTERVIEW_STATUS_VARIANTS = {
  not_interviewed: 'neutral',
  invited: 'info',
  interview_completed: 'success',
  reinterview_pending: 'warning',
  reinterview_approved: 'primary',
  reinterview_rejected: 'error',
};

const AdminUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [overrideUserId, setOverrideUserId] = useState(null);
  const [overrideVal, setOverrideVal] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  // Full-profile editor modal (§4.1)
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  // Proctoring review (snapshot + summary) for the edited candidate's latest interview
  const [proctoring, setProctoring] = useState(null);
  const [proctoringLoading, setProctoringLoading] = useState(false);

  // Type-to-confirm user deletion modal (irreversible)
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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

  const handleSendInvite = async (u) => {
    if (!window.confirm(
      `Send one-time interview credentials to ${u.name} (${u.email})?\n\n` +
      'Their password login (if any) will stop working and a fresh one-time password will be emailed. It can be used to log in exactly once.'
    )) {
      return;
    }
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/admin/users/${u.id}/send-interview-invite`);
      setNotice(res.data.message || 'Invite sent.');
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
  const deleteMatch = deleteUser ? (deleteUser.cnic || deleteUser.name) : '';
  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.delete(`/admin/users/${deleteUser.id}`);
      setNotice(res.data.message || 'User deleted.');
      setDeleteUser(null);
      setDeleteConfirmText('');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the user.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.job_role?.toLowerCase().includes(q) ||
      u.cnic?.toLowerCase().includes(q) ||
      u.course_category?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading user accounts..." />
      </Card>
    );
  }

  const selectClass = 'w-full glass-input text-sm appearance-none cursor-pointer';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="User Accounts Manager"
        subtitle="Edit full candidate profiles, manage course status, send interview invites, and monitor who is online."
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Card padding={false} className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, email, CNIC, category, or role..."
        />
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 font-bold">User Details</th>
                <th className="py-3 font-bold">Course</th>
                <th className="py-3 font-bold">Interview Status</th>
                <th className="py-3 font-bold">Access</th>
                <th className="py-3 font-bold text-center">Tokens</th>
                <th className="py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                    No matching user accounts found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((item) => (
                  <tr key={item.id} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
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
                        <div className="font-bold text-slate-900 dark:text-slate-200">{item.name}</div>
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
                      </div>
                    </td>

                    <td className="py-4 text-center font-mono font-bold text-slate-900 dark:text-slate-200">
                      {item.tokens_available}
                    </td>

                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Pencil}
                          onClick={() => openEditor(item)}
                          disabled={actionLoading}
                          className="!p-2 !rounded-lg"
                          title="Edit Full Profile"
                        />
                        {(item.course_status === 'completed' || isInstructorCategory(item.course_category)) && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={Send}
                            onClick={() => handleSendInvite(item)}
                            disabled={actionLoading}
                            className="!p-2 !rounded-lg"
                            title="Send One-Time Interview Invite"
                          />
                        )}
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
                        <Button
                          variant={item.status === 'active' ? 'danger' : 'success'}
                          size="sm"
                          icon={item.status === 'active' ? Ban : UserCheck}
                          onClick={() => handleToggleBan(item.id)}
                          disabled={actionLoading}
                          className="!p-2 !rounded-lg"
                          title={item.status === 'active' ? 'Ban Account' : 'Unban Account'}
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          icon={Trash2}
                          onClick={() => { setDeleteUser(item); setDeleteConfirmText(''); }}
                          disabled={actionLoading}
                          className="!p-2 !rounded-lg"
                          title="Delete Account Permanently"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

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

              {/* Instructors carry no course status (Update §2). */}
              {!isInstructorCategory(editForm.course_category) && (
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

      {/* Type-to-confirm user deletion modal (irreversible, cascades all their data) */}
      {deleteUser !== null && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel p-6 rounded-2xl border border-red-500/40 space-y-5 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={19} />
              <span>Delete User Permanently</span>
            </h3>
            <div className="p-3.5 bg-red-500/5 border border-red-500/20 rounded-xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
              <p>
                This permanently deletes <b className="text-slate-900 dark:text-white">{deleteUser.name}</b>{' '}
                ({deleteUser.email}) and <b>all of their data</b> — interview history, reports,
                transcripts, session recordings and answer audio, tokens, transactions, feedback,
                and notifications. This cannot be undone.
              </p>
              <p>
                Type <b className="font-mono text-red-600 dark:text-red-400">{deleteMatch}</b> below to confirm.
              </p>
            </div>

            <input
              type="text"
              className="w-full glass-input text-sm font-mono"
              placeholder={deleteMatch}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoFocus
            />

            <div className="flex items-center justify-end gap-3 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setDeleteUser(null); setDeleteConfirmText(''); }}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={handleDeleteUser}
                loading={actionLoading}
                disabled={actionLoading || deleteConfirmText.trim() !== deleteMatch}
              >
                Delete Permanently
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminUsersPage;
