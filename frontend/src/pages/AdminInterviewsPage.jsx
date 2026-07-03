import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { 
  Video, 
  Search, 
  AlertCircle, 
  ArrowRight,
  ShieldAlert,
  Calendar
} from 'lucide-react';

const AdminInterviewsPage = () => {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
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
    fetchInterviews();
  }, []);

  const filteredInterviews = interviews.filter((i) => {
    return (
      i.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.job_role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto my-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading mock session logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Mock Sessions Auditor</h1>
        <p className="text-sm text-slate-400">Audit candidate performances, scores, and proctoring logs.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="glass-panel p-4 rounded-xl flex items-center">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            className="w-full glass-input pl-10 py-2.5 text-xs"
            placeholder="Search by candidate name, role, or prep type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Interviews Audit Table */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 border-b border-slate-900 pb-3">
                <th className="py-3 font-bold">Candidate Details</th>
                <th className="py-3 font-bold">Job Role & Focus</th>
                <th className="py-3 font-bold">Status & Score</th>
                <th className="py-3 font-bold text-center">Proctor Warnings</th>
                <th className="py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredInterviews.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-xs">
                    No mock session records found.
                  </td>
                </tr>
              ) : (
                filteredInterviews.map((item) => (
                  <tr key={item.id} className="text-slate-350 hover:bg-slate-900/10 transition-colors">
                    {/* Candidate Details */}
                    <td className="py-4">
                      <div className="font-bold text-slate-200">{item.user_name}</div>
                      <div className="text-[10px] text-slate-500">{item.user_email}</div>
                    </td>

                    {/* Job / Focus Type */}
                    <td className="py-4">
                      <div className="font-bold text-slate-300 capitalize">{item.job_role}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="capitalize">{item.type} Prep</span>
                        <span>&bull;</span>
                        <span>{item.difficulty}</span>
                      </div>
                    </td>

                    {/* Status & Score */}
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                          {item.status}
                        </span>
                        {item.status === 'completed' && (
                          <span className={`font-mono font-bold ${item.overall_score >= 80 ? 'text-emerald-400' : item.overall_score >= 60 ? 'text-primary-400' : 'text-amber-400'}`}>
                            {item.overall_score}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-550 pt-0.5">
                        <Calendar size={10} />
                        <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                    </td>

                    {/* Proctor violations count */}
                    <td className="py-4 text-center">
                      {item.is_proctor_failed ? (
                        <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-extrabold rounded-full uppercase flex items-center justify-center gap-1 max-w-[100px] mx-auto">
                          <ShieldAlert size={10} /> Terminated
                        </span>
                      ) : item.proctor_violations_count > 0 ? (
                        <span className="font-bold text-amber-500 text-xs">
                          {item.proctor_violations_count} warning(s)
                        </span>
                      ) : (
                        <span className="text-slate-500 font-semibold">Clean</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 text-right">
                      {item.status === 'completed' ? (
                        <Link
                          to={`/interview/report/${item.id}`}
                          className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white rounded-lg transition inline-flex items-center"
                          title="Inspect Report Card"
                        >
                          <ArrowRight size={14} />
                        </Link>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic pr-2">Awaiting Completion</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminInterviewsPage;
