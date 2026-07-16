import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import SearchBar from '../components/ui/SearchBar';
import Spinner from '../components/ui/Spinner';
import DeleteButton from '../components/ui/DeleteButton';
import {
  Video,
  ArrowRight,
  ShieldAlert,
  Calendar
} from 'lucide-react';

const AdminInterviewsPage = () => {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchInterviews = async () => {
    try {
      const res = await api.get('/admin/interviews');
      setInterviews(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch system mock sessions history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  const handleDelete = async (id) => {
    setError('');
    try {
      await api.delete(`/admin/interviews/${id}`);
      setInterviews((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the interview.');
    }
  };

  const filteredInterviews = interviews.filter((i) => {
    return (
      i.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.job_role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading mock session logs..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Video}
        title="Mock Sessions Auditor"
        subtitle="Audit candidate performances, scores, and proctoring logs."
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card padding={false} className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by candidate name, role, or prep type..."
        />
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 font-bold">Candidate Details</th>
                <th className="py-3 font-bold">Job Role & Focus</th>
                <th className="py-3 font-bold">Status & Score</th>
                <th className="py-3 font-bold text-center">Proctor Warnings</th>
                <th className="py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredInterviews.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                    No mock session records found.
                  </td>
                </tr>
              ) : (
                filteredInterviews.map((item) => (
                  <tr key={item.id} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-4">
                      <div className="font-bold text-slate-900 dark:text-slate-200">{item.user_name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.user_email}</div>
                    </td>

                    <td className="py-4">
                      <div className="font-bold text-slate-800 dark:text-slate-300 capitalize">{item.job_role}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="capitalize">{item.type} Prep</span>
                        <span>&bull;</span>
                        <span>{item.difficulty}</span>
                      </div>
                    </td>

                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <Badge variant={item.status === 'completed' ? 'success' : 'warning'}>
                          {item.status}
                        </Badge>
                        {item.status === 'completed' && (
                          <span className={`font-mono font-bold ${item.overall_score >= 80 ? 'text-emerald-500 dark:text-emerald-400' : item.overall_score >= 60 ? 'text-primary-500 dark:text-primary-400' : 'text-amber-500 dark:text-amber-400'}`}>
                            {item.overall_score}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                        <Calendar size={10} />
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                    </td>

                    <td className="py-4 text-center">
                      {item.is_proctor_failed ? (
                        <Badge variant="error" className="mx-auto max-w-[100px] justify-center">
                          <ShieldAlert size={10} /> Terminated
                        </Badge>
                      ) : item.proctor_violations_count > 0 ? (
                        <span className="font-bold text-amber-500 dark:text-amber-400 text-xs">
                          {item.proctor_violations_count} warning(s)
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">Clean</span>
                      )}
                    </td>

                    <td className="py-4">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === 'completed' ? (
                          <Link
                            to={`/interview/report/${item.id}`}
                            className="p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white text-slate-500 dark:text-slate-400 rounded-lg transition inline-flex items-center"
                            title="Inspect Report Card"
                          >
                            <ArrowRight size={14} />
                          </Link>
                        ) : (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">Awaiting</span>
                        )}
                        <DeleteButton
                          onConfirm={() => handleDelete(item.id)}
                          confirmMessage={`Permanently delete ${item.user_name}'s ${item.job_role} interview and its report? This cannot be undone.`}
                          title="Delete Interview"
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
    </div>
  );
};

export default AdminInterviewsPage;
