import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  MessageSquare, 
  Search, 
  AlertCircle,
  Star,
  Calendar,
  AlertTriangle
} from 'lucide-react';

const AdminFeedbackPage = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        const res = await api.get('/admin/feedback');
        setFeedbacks(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch platform feedbacks.');
      } finally {
        setLoading(false);
      }
    };
    fetchFeedbacks();
  }, []);

  const filteredFeedbacks = feedbacks.filter((f) => {
    return (
      f.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.feedback_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.issues_reported && f.issues_reported.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto my-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading platform feedbacks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Candidate Feedbacks</h1>
        <p className="text-sm text-slate-400">Review candidate experiences, star ratings, and reported bugs.</p>
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
            placeholder="Search by candidate, content keywords, or issues..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Feedback Feed */}
      <div className="space-y-4">
        {filteredFeedbacks.length === 0 ? (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs rounded-2xl">
            No mock feedbacks found matching your search.
          </div>
        ) : (
          filteredFeedbacks.map((item) => (
            <div key={item.id} className="glass-panel p-6 rounded-2xl space-y-4 hover:border-slate-800 transition">
              {/* Header block */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-900 pb-3">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm text-slate-200">{item.user_name}</h4>
                  <span className="text-[10px] text-slate-550 block">{item.user_email}</span>
                </div>
                
                <div className="flex items-center gap-4 shrink-0">
                  {/* Stars */}
                  <div className="flex items-center gap-0.5 text-yellow-500">
                    {[...Array(5)].map((_, i) => (
                      <Star 
                        key={i} 
                        size={12} 
                        fill={i < item.rating ? "currentColor" : "none"} 
                        className={i < item.rating ? "text-yellow-500" : "text-slate-800"}
                      />
                    ))}
                  </div>
                  
                  {/* Date */}
                  <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                    <Calendar size={10} />
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Bug Reports */}
              {item.issues_reported && (
                <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-red-400 text-xs flex items-start gap-2 max-w-lg">
                  <AlertTriangle className="shrink-0 mt-0.5 animate-pulse" size={14} />
                  <div>
                    <span className="font-bold">Reported Technical Glitch:</span> {item.issues_reported}
                  </div>
                </div>
              )}

              {/* Feedback Content */}
              <div className="space-y-1.5">
                <span className="text-[9px] text-slate-550 uppercase tracking-widest block font-bold">Review Comment</span>
                <p className="text-xs text-slate-350 leading-relaxed font-sans font-medium whitespace-pre-wrap">
                  "{item.feedback_text || 'No review remarks provided.'}"
                </p>
              </div>

              {/* Target Interview Metadata */}
              <div className="pt-2 flex items-center gap-2">
                <span className="text-[9px] text-slate-500 font-semibold">Target Prep focus:</span>
                <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-400 text-[9px] font-bold rounded capitalize">
                  {item.job_role}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminFeedbackPage;
