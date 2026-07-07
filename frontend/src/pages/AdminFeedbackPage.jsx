import React, { useState, useEffect } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import SearchBar from '../components/ui/SearchBar';
import Spinner from '../components/ui/Spinner';
import {
  MessageSquare,
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
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading platform feedbacks..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageSquare}
        title="Candidate Feedbacks"
        subtitle="Review candidate experiences, star ratings, and reported bugs."
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card padding={false} className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by candidate, content keywords, or issues..."
        />
      </Card>

      <div className="space-y-4">
        {filteredFeedbacks.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400 text-xs">No mock feedbacks found matching your search.</p>
          </Card>
        ) : (
          filteredFeedbacks.map((item) => (
            <Card key={item.id} variant="interactive" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-200">{item.user_name}</h4>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{item.user_email}</span>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-0.5 text-yellow-500">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={12}
                        fill={i < item.rating ? 'currentColor' : 'none'}
                        className={i < item.rating ? 'text-yellow-500' : 'text-slate-300 dark:text-slate-700'}
                      />
                    ))}
                  </div>

                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                    <Calendar size={10} />
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {item.issues_reported && (
                <Alert variant="error" className="max-w-lg">
                  <span className="font-bold">Reported Technical Glitch:</span> {item.issues_reported}
                </Alert>
              )}

              <div className="space-y-1.5">
                <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest block font-bold">Review Comment</span>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                  &ldquo;{item.feedback_text || 'No review remarks provided.'}&rdquo;
                </p>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">Target Prep focus:</span>
                <Badge variant="default" className="capitalize">
                  {item.job_role}
                </Badge>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminFeedbackPage;
