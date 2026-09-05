import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import api from '../../services/api';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import {
  Mail, X, UploadCloud, FileSpreadsheet, Download, Send,
  CheckCircle2, AlertTriangle, Loader2, Trash2, UserPlus, Plus,
} from 'lucide-react';

/**
 * Bulk Email Module — import a batch of candidates, review/correct the rows, and issue
 * interview invitations in one action.
 *
 * Files are parsed in the browser purely so the preview and inline editing are instant;
 * the server re-validates every row before creating anything, so nothing here is trusted
 * for correctness. Progress is polled from the batch record while sending runs in the
 * background, which is why the admin can keep working and the page never freezes.
 */

// Header aliases, so a file saying "Full Name" or "CNIC Number" still lines up with the
// column we expect instead of silently importing as blank.
const HEADER_ALIASES = {
  name: ['name', 'full name', 'candidate name', 'student name'],
  email: ['email', 'email address', 'e-mail'],
  cnic: ['cnic', 'cnic number', 'cnic no', 'nic'],
  category: ['category', 'course category', 'domain', 'track'],
  course_status: ['course_status', 'course status', 'status'],
  difficulty_range: ['difficulty_range', 'difficulty range', 'question difficulty', 'question difficulty range'],
};

// Refuse oversized files BEFORE handing them to a parser. The row limit only applies after
// parsing, so without this a huge workbook would be fully loaded into memory and parsed in
// the admin's browser first — enough to hang or crash the tab. A legitimate 500-row batch
// is well under 100 KB, so this ceiling never blocks real use.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const canonicalKey = (header) => {
  const h = String(header || '').trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return key;
  }
  return null;
};

/** Normalize one parsed record into our row shape, dropping unrecognised columns. */
const toRow = (record, defaultDeadline) => {
  const row = {
    name: '', email: '', cnic: '', category: '', course_status: '',
    deadline_days: defaultDeadline, difficulty_range: '',
  };
  Object.entries(record).forEach(([header, value]) => {
    const key = canonicalKey(header);
    if (key) row[key] = value === null || value === undefined ? '' : String(value).trim();
  });
  return row;
};

const BulkEmailModal = ({ open, onClose, onSent }) => {
  const [config, setConfig] = useState(null);
  const [subject, setSubject] = useState('');
  // Optional cohort label for this batch — becomes its filter chip on the Bulk Invited tab.
  const [batchName, setBatchName] = useState('');
  const [personalize, setPersonalize] = useState(true);

  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [validation, setValidation] = useState(null); // { valid_count, results: [...] }
  const [validating, setValidating] = useState(false);

  const [batch, setBatch] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // ---------------------------------------------------------------- lifecycle
  useEffect(() => {
    if (!open) return;
    api.get('/admin/bulk-email/config')
      .then((res) => setConfig(res.data))
      .catch((err) => {
        // Say which failure this actually is. "Could not load configuration" on its own
        // sends you hunting through the UI when the real answer is almost always that the
        // backend is down or is running a build without this module in it.
        const status = err.response?.status;
        if (!err.response) {
          setError(
            `Cannot reach the backend at ${api.defaults.baseURL}. Start the API server ` +
            `(python main.py in /backend) or check your network connection.`
          );
        } else if (status === 404) {
          // Name the backend that answered. A production `npm run build` bakes in
          // VITE_API_URL, so a locally-served build still calls the HOSTED backend — the
          // module can be missing there while running perfectly on localhost.
          setError(
            `The backend at ${api.defaults.baseURL} responded, but has no Bulk Email ` +
            `Module — it is running an older build. If that URL is not your local server, ` +
            `this build was compiled against the hosted backend (npm run build uses ` +
            `.env.production); run "npm run dev" to use localhost, or deploy the backend.`
          );
        } else if (status === 401) {
          setError('Your session has expired. Please sign in again.');
        } else if (status === 403) {
          setError('This module is admin-only and your account is not an administrator.');
        } else {
          setError(err.response?.data?.detail || `Could not load module configuration (HTTP ${status}).`);
        }
      });
  }, [open]);

  const resetAll = useCallback(() => {
    setRows([]); setFileName(''); setParseError(''); setValidation(null);
    setBatch(null); setSending(false); setError(''); setSubject(''); setBatchName('');
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Stop polling if the modal is closed mid-send. The batch keeps running server-side —
  // it is a background job, not tied to this component staying mounted.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ---------------------------------------------------------------- parsing
  const ingestRecords = (records) => {
    const dd = config?.default_deadline_days ?? 2;
    const mapped = records
      .map((r) => toRow(r, dd))
      // Ignore fully blank lines (trailing newline in a CSV is extremely common).
      .filter((r) => r.name || r.email || r.cnic || r.category);
    if (mapped.length === 0) {
      setParseError('No usable rows found. Check that the header row matches the template.');
      return;
    }
    const max = config?.max_rows ?? 500;
    if (mapped.length > max) {
      setParseError(`That file has ${mapped.length} rows — the limit is ${max} per batch.`);
      return;
    }
    setRows(mapped);
  };

  // Manual entry: append one blank, editable row to the SAME preview table a file upload
  // would populate — no file needed for a handful of recipients typed in by hand.
  const addManualRow = () => {
    const dd = config?.default_deadline_days ?? 2;
    setValidation(null);
    setBatch(null);
    setError('');
    setRows((prev) => [...prev, { name: '', email: '', cnic: '', category: '', course_status: '', deadline_days: dd, difficulty_range: '' }]);
  };

  const parseCsv = (file) =>
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (out) => { ingestRecords(out.data || []); setParsing(false); },
      error: (err) => { setParseError(`Could not read that CSV: ${err.message}`); setParsing(false); },
    });

  const parseXlsx = async (file) => {
    try {
      // Imported lazily so exceljs (which is sizeable) is only fetched when an admin
      // actually uploads a spreadsheet, rather than on every Admin Hub page load.
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const sheet = wb.worksheets[0];
      if (!sheet) { setParseError('That workbook has no sheets.'); setParsing(false); return; }

      const headers = [];
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col - 1] = String(cell.value ?? '').trim();
      });

      const records = [];
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // header
        const rec = {};
        headers.forEach((h, i) => {
          if (!h) return;
          const v = row.getCell(i + 1).value;
          // Excel cells can hold objects (hyperlinks, rich text, formula results).
          rec[h] = v && typeof v === 'object'
            ? (v.text ?? v.result ?? v.hyperlink ?? '')
            : (v ?? '');
        });
        records.push(rec);
      });
      ingestRecords(records);
    } catch (e) {
      setParseError(`Could not read that spreadsheet: ${e.message}`);
    } finally {
      setParsing(false);
    }
  };

  const handleFile = (file) => {
    if (!file) return;
    resetErrorsForNewFile();
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParseError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ` +
        `${MAX_FILE_BYTES / 1024 / 1024} MB. A batch of ${config?.max_rows ?? 500} rows is ` +
        `only a few KB, so this usually means the wrong file was selected.`
      );
      return;
    }
    setParsing(true);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.csv')) parseCsv(file);
    else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) parseXlsx(file);
    else {
      setParseError('Unsupported file type — please upload a .csv or .xlsx file.');
      setParsing(false);
    }
  };

  const resetErrorsForNewFile = () => {
    setParseError(''); setValidation(null); setBatch(null); setError(''); setRows([]);
  };

  // ---------------------------------------------------------------- validation
  // Re-validate on the server whenever the rows change (including inline edits), so the
  // badge always reflects the same rules that /send will enforce.
  useEffect(() => {
    if (!open || rows.length === 0) { setValidation(null); return; }
    let cancelled = false;
    setValidating(true);
    const t = setTimeout(() => {
      api.post('/admin/bulk-email/validate', { rows })
        .then((res) => { if (!cancelled) setValidation(res.data); })
        .catch((err) => {
          if (!cancelled) setError(err.response?.data?.detail || 'Validation failed.');
        })
        .finally(() => { if (!cancelled) setValidating(false); });
    }, 350); // debounce so typing in a cell isn't one request per keystroke
    return () => { cancelled = true; clearTimeout(t); };
  }, [rows, open]);

  const rowErrors = (idx) => validation?.results?.find((r) => r.index === idx)?.errors || [];
  const rowValid = (idx) => validation?.results?.find((r) => r.index === idx)?.valid;

  const updateCell = (idx, key, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  // Auto-dashes as digits are typed (5-7-1), capped at 13 digits — the backend
  // (normalize_cnic) already accepts a bare 13-digit string just fine, so this is pure
  // typing convenience, not something validation depends on.
  const formatCnicInput = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  // Nearly every candidate signs up with a Gmail address (see the roster), so typing just
  // the local part and moving on is the common case — appends "@gmail.com" on blur only if
  // there's no "@" at all yet, so a fully-typed non-Gmail address is never touched.
  const applyEmailDomainDefault = (idx, value) => {
    const trimmed = value.trim();
    if (trimmed && !trimmed.includes('@')) {
      updateCell(idx, 'email', `${trimmed}@gmail.com`);
    }
  };

  const applyToAll = (key, value) => {
    if (!value) return;
    setRows((prev) => prev.map((r) => ({ ...r, [key]: value })));
  };

  // ---------------------------------------------------------------- send
  const startSend = async () => {
    setError(''); setSending(true);
    try {
      const res = await api.post('/admin/bulk-email/send', {
        rows, subject, personalize, file_name: fileName, batch_name: batchName,
      });
      const started = res.data.batch;
      setBatch(started);
      pollRef.current = setInterval(async () => {
        try {
          const p = await api.get(`/admin/bulk-email/batches/${started.id}`);
          const b = p.data.batch;
          setBatch(b);
          if (b.status === 'complete') {
            clearInterval(pollRef.current); pollRef.current = null;
            setSending(false);
            onSent?.();
          }
        } catch {
          // A transient poll failure is not fatal — the batch keeps running server-side
          // and the next tick will pick the status back up.
        }
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not start the batch.');
      setSending(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/admin/bulk-email/template', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'bulk_invite_template.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download the template.');
    }
  };

  if (!open) return null;

  // Interview Access (curriculum feature): when this admin holds exactly one company — the
  // only case this modal actually supports today, since it never asks which company to send
  // under — the Category options are narrowed to what that company is allowed to invite.
  // Falls back to every category when there's no single company to resolve (0 or several),
  // same as /send itself would; the real gate is server-side regardless (_validate_row).
  const singleCompany = config?.companies?.length === 1 ? config.companies[0] : null;
  const allowedCategories =
    singleCompany && singleCompany.allowed_interview_types
      ? singleCompany.allowed_interview_types
      : (config?.categories || []);

  const validCount = validation?.valid_count ?? 0;
  const allValid = rows.length > 0 && validCount === rows.length;
  const canSend = allValid && subject.trim() && !sending && !validating;
  // Cells are always-visible bordered boxes (not just on hover/focus) so a freshly added
  // BLANK manual row still reads as an editable form/grid instead of empty whitespace —
  // the transparent/borderless style this replaced only looked fine when a file upload
  // had already filled every cell with text.
  const inputCls = 'w-full bg-white dark:bg-slate-900 text-xs outline-none border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 rounded-md px-2 py-1.5 text-slate-700 dark:text-slate-200 transition placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:font-normal';

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-5xl glass-panel rounded-2xl border border-primary-500/30 shadow-2xl relative flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-600 text-white"><Mail size={18} /></div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Bulk Email Module</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Admin Hub · Send interview invitations via file import or manual entry
              </p>
            </div>
          </div>
          <button onClick={() => { resetAll(); onClose(); }} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {error && <Alert variant="error" className="text-xs">{error}</Alert>}

          {/* ---- Sending / result view ---- */}
          {batch ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {batch.status === 'complete'
                  ? <CheckCircle2 size={18} className="text-emerald-500" />
                  : <Loader2 size={18} className="animate-spin text-primary-500" />}
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {batch.status === 'complete' ? 'Batch complete' : 'Sending invitations…'}
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-500"
                  style={{ width: `${batch.total_count ? ((batch.sent_count + batch.failed_count) / batch.total_count) * 100 : 0}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="info">{batch.sent_count + batch.failed_count} / {batch.total_count} processed</Badge>
                <Badge variant="success">{batch.sent_count} sent</Badge>
                {batch.failed_count > 0 && <Badge variant="error">{batch.failed_count} failed</Badge>}
              </div>

              {batch.failures?.length > 0 && (
                <div className="rounded-xl border border-red-300/60 dark:border-red-500/30 bg-red-50 dark:bg-red-500/5 p-3 space-y-1.5">
                  <p className="text-[11px] font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle size={13} /> These recipients were not invited
                  </p>
                  {batch.failures.map((f, i) => (
                    <p key={i} className="text-[11px] font-mono text-red-600 dark:text-red-300">
                      Row {f.row} · {f.email} — {f.error}
                    </p>
                  ))}
                  <p className="text-[10px] text-red-600/80 dark:text-red-300/70">
                    No account was created for these rows, so you can correct them and send again.
                  </p>
                </div>
              )}

              {batch.status === 'complete' && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="secondary" size="sm" onClick={resetAll}>Send another batch</Button>
                  <Button size="sm" onClick={() => { resetAll(); onClose(); }}>Done</Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ---- Step 1 + 2 ---- */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Configuration */}
                <div className="space-y-3">
                  <StepTitle n={1} label="Configuration" />
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Email subject / title
                    </label>
                    <input
                      className="w-full glass-input text-sm mt-1.5"
                      placeholder="e.g. SMIT Interview Schedule — Final Confirmation"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Batch name <span className="font-semibold normal-case tracking-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      className="w-full glass-input text-sm mt-1.5"
                      placeholder="e.g. Spring 2026 Intake"
                      maxLength={120}
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                    />
                    {/* Named batches become filter chips on the Bulk Invited tab. The subject
                        line is written for the candidate, so two intakes sent from the same
                        template are indistinguishable there — this is the admin's own label. */}
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Groups these recipients under their own chip in Manage Users. Defaults to
                      the subject line if left blank.
                    </p>
                  </div>
                  <label className="flex items-center justify-between gap-3 pt-1 cursor-pointer">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Add template personalization
                      <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        Uses each recipient's name, category and deadline
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPersonalize((v) => !v)}
                      className={`relative w-11 h-6 rounded-full transition shrink-0 ${personalize ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${personalize ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                </div>

                {/* Data import */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <StepTitle n={2} label="Data Import" />
                    <button onClick={downloadTemplate} className="text-[11px] font-semibold text-primary-500 hover:text-primary-600 flex items-center gap-1">
                      <Download size={12} /> Template
                    </button>
                  </div>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                      dragOver
                        ? 'border-primary-500 bg-primary-500/5'
                        : 'border-slate-300 dark:border-slate-700 hover:border-primary-400'
                    }`}
                  >
                    <input
                      ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                      onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
                    />
                    {parsing ? (
                      <div className="flex flex-col items-center gap-2 text-slate-500">
                        <Spinner /><span className="text-xs">Reading file…</span>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={26} className="mx-auto text-primary-500 mb-1.5" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Upload candidates file</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          .csv or .xlsx · required: {(config?.required_columns || []).join(', ')}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Any other columns are ignored automatically</p>
                      </>
                    )}
                  </div>

                  {parseError && <Alert variant="error" className="text-xs">{parseError}</Alert>}
                  {fileName && !parseError && rows.length > 0 && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <FileSpreadsheet size={12} /> {fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} detected
                    </p>
                  )}

                  {/* Manual entry: a couple of recipients don't need a spreadsheet — this
                      just appends a blank, editable row to the same preview table below. */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                    OR
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={UserPlus}
                    onClick={addManualRow}
                    fullWidth
                  >
                    Add Recipient Manually
                  </Button>
                </div>
              </div>

              {/* ---- Step 3: preview ---- */}
              {rows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StepTitle n={3} label="Data Preview & Validation" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Click any cell to edit</span>
                      {validating
                        ? <Badge variant="info" className="!text-[9px]">Checking…</Badge>
                        : <Badge variant={allValid ? 'success' : 'error'} className="!text-[9px]">
                            {validCount} / {rows.length} VALIDATED
                          </Badge>}
                    </div>
                  </div>

                  {/* Bulk overrides — applying one value to every row beats editing 200 cells. */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Apply to all:</span>
                    <select className="glass-input !text-[11px] !py-1 cursor-pointer" defaultValue=""
                      onChange={(e) => { applyToAll('category', e.target.value); e.target.value = ''; }}>
                      <option value="">Category…</option>
                      {(allowedCategories).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="glass-input !text-[11px] !py-1 cursor-pointer" defaultValue=""
                      onChange={(e) => { applyToAll('course_status', e.target.value); e.target.value = ''; }}>
                      <option value="">Course status…</option>
                      {(config?.course_statuses || []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select className="glass-input !text-[11px] !py-1 cursor-pointer" defaultValue=""
                      onChange={(e) => { applyToAll('deadline_days', Number(e.target.value)); e.target.value = ''; }}>
                      <option value="">Deadline…</option>
                      {(config?.deadline_choices || []).map((d) => <option key={d} value={d}>{d} days</option>)}
                    </select>
                    <select className="glass-input !text-[11px] !py-1 cursor-pointer" defaultValue=""
                      onChange={(e) => { applyToAll('difficulty_range', e.target.value); e.target.value = ''; }}>
                      <option value="">Difficulty range…</option>
                      {(config?.difficulty_ranges || []).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                          <th className="py-2 px-2 font-bold w-8">SN</th>
                          <th className="py-2 px-2 font-bold">Name</th>
                          <th className="py-2 px-2 font-bold">Email</th>
                          <th className="py-2 px-2 font-bold">CNIC</th>
                          <th className="py-2 px-2 font-bold">Category</th>
                          <th className="py-2 px-2 font-bold">Status</th>
                          <th className="py-2 px-2 font-bold">Deadline</th>
                          <th className="py-2 px-2 font-bold">Difficulty</th>
                          <th className="py-2 px-2 font-bold w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => {
                          const errs = rowErrors(idx);
                          const bad = validation && !rowValid(idx);
                          return (
                            <React.Fragment key={idx}>
                              <tr className={`border-b border-slate-100 dark:border-slate-800/70 ${
                                bad ? 'bg-red-50/70 dark:bg-red-500/5' : idx % 2 === 1 ? 'bg-slate-50/60 dark:bg-slate-900/20' : ''
                              }`}>
                                <td className="py-1.5 px-2 text-slate-400 font-mono text-center">{idx + 1}</td>
                                <td className="py-1.5 px-1.5"><input className={inputCls} placeholder="Full name" value={r.name} onChange={(e) => updateCell(idx, 'name', e.target.value)} /></td>
                                <td className="py-1.5 px-1.5">
                                  <input
                                    className={`${inputCls} font-mono`}
                                    placeholder="name@example.com"
                                    value={r.email}
                                    onChange={(e) => updateCell(idx, 'email', e.target.value)}
                                    onBlur={(e) => applyEmailDomainDefault(idx, e.target.value)}
                                  />
                                </td>
                                <td className="py-1.5 px-1.5">
                                  <input
                                    className={`${inputCls} font-mono`}
                                    placeholder="42101-1234567-1"
                                    value={r.cnic}
                                    onChange={(e) => updateCell(idx, 'cnic', formatCnicInput(e.target.value))}
                                  />
                                </td>
                                <td className="py-1.5 px-1.5">
                                  <select className={`${inputCls} cursor-pointer`} value={r.category} onChange={(e) => updateCell(idx, 'category', e.target.value)}>
                                    <option value="">Select…</option>
                                    {(allowedCategories).map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 px-1.5">
                                  <select className={`${inputCls} cursor-pointer`} value={r.course_status} onChange={(e) => updateCell(idx, 'course_status', e.target.value)}>
                                    <option value="">Select…</option>
                                    {(config?.course_statuses || []).map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 px-1.5">
                                  <select className={`${inputCls} cursor-pointer`} value={r.deadline_days} onChange={(e) => updateCell(idx, 'deadline_days', Number(e.target.value))}>
                                    {(config?.deadline_choices || []).map((d) => <option key={d} value={d}>{d} Days</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 px-1.5">
                                  <select className={`${inputCls} cursor-pointer`} value={r.difficulty_range || ''} onChange={(e) => updateCell(idx, 'difficulty_range', e.target.value)}>
                                    <option value="">Candidate's choice</option>
                                    {(config?.difficulty_ranges || []).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                  </select>
                                </td>
                                <td className="py-1.5 px-2">
                                  <button onClick={() => removeRow(idx)} title="Remove this row" className="text-slate-400 hover:text-red-500">
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                              {errs.length > 0 && (
                                <tr className="bg-red-50/70 dark:bg-red-500/5">
                                  <td />
                                  <td colSpan={8} className="pb-1.5 px-2 text-[10px] text-red-600 dark:text-red-400">
                                    {errs.join(' · ')}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                        <tr>
                          <td colSpan={9} className="p-0">
                            <button
                              type="button"
                              onClick={addManualRow}
                              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition border-t border-dashed border-slate-200 dark:border-slate-700"
                            >
                              <Plus size={13} /> Add Row
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!batch && (
          <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-4 px-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Recipients: <b className="text-slate-700 dark:text-slate-200">{rows.length}</b>
              {subject.trim() && <> · Title: <b className="text-slate-700 dark:text-slate-200">{subject.slice(0, 34)}{subject.length > 34 ? '…' : ''}</b></>}
              {' · '}Status:{' '}
              <b className={allValid && subject.trim() ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                {rows.length === 0 ? 'Awaiting file'
                  : !subject.trim() ? 'Subject required'
                  : allValid ? 'Ready to send'
                  : `${rows.length - validCount} row(s) need fixing`}
              </b>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => { resetAll(); onClose(); }}>Cancel</Button>
              <Button size="sm" icon={Send} onClick={startSend} disabled={!canSend} loading={sending}>
                Send {rows.length > 0 ? rows.length : ''} Bulk Email{rows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}
        {!batch && (
          <p className="text-[10px] text-slate-400 text-right px-6 pb-3 -mt-2">
            Sending runs in the background — the page won't freeze
          </p>
        )}
      </div>
    </div>,
    document.body
  );
};

const StepTitle = ({ n, label }) => (
  <div className="flex items-center gap-2">
    <span className="w-5 h-5 rounded-md bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">{n}</span>
    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{label}</span>
  </div>
);

export default BulkEmailModal;
