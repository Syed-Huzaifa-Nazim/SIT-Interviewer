import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import SearchBar from '../components/ui/SearchBar';
import Spinner from '../components/ui/Spinner';
import { History, Filter, ArrowUpRight, Award } from 'lucide-react';

const InterviewHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, technical, HR, behavioral, custom
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, highest_score

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get('/interviews/history');
        setHistory(res.data);
      } catch (err) {
        setError('Failed to fetch interview history logs.');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  // Filter & Sort Logic
  const filteredHistory = history
    .filter((mock) => {
      // 1. Search term match (job role)
      const matchesSearch = mock.job_role.toLowerCase().includes(searchTerm.toLowerCase());
      
      // 2. Type match
      const matchesType = filterType === 'all' || mock.type.toLowerCase() === filterType.toLowerCase();

      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at) - new Date(b.created_at);
      }
      if (sortBy === 'highest_score') {
        return (b.overall_score || 0) - (a.overall_score || 0);
      }
      return 0;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={History}
        title="Mock Assessment History"
        subtitle="Review all mock interview sessions, check scores, and review granular speech/text answers."
      />

      {error && <Alert variant="error">{error}</Alert>}

      {/* Toolbar - Search, Filter, Sort */}
      <Card padding className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <SearchBar
            className="md:flex-1"
            placeholder="Search by job role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {/* Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
            <select
              className="glass-input py-2 px-3 text-xs w-full md:w-40 cursor-pointer bg-white dark:bg-slate-900"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Focus Types</option>
              <option value="technical">Technical</option>
              <option value="hr">HR Assessment</option>
              <option value="behavioral">Behavioral</option>
              <option value="custom">Custom JDs</option>
            </select>
          </div>

          {/* Sort */}
          <select
            className="glass-input py-2 px-3 text-xs w-full md:w-40 cursor-pointer bg-white dark:bg-slate-900"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="highest_score">Sort: Highest Score</option>
          </select>
        </div>
      </Card>

      {/* History Grid */}
      {loading ? (
        <Spinner label="Loading history logs..." className="py-12" />
      ) : filteredHistory.length === 0 ? (
        <EmptyState
          icon={History}
          message="No interview records matched your criteria."
          actionLabel="Launch a new session"
          actionTo="/interview/start"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredHistory.map((mock) => (
            <Card key={mock.id} variant="interactive" className="flex flex-col justify-between">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Badge variant="primary">{mock.type}</Badge>
                  <span className="text-xs text-slate-500">
                    {new Date(mock.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <h3 className="font-extrabold text-lg text-slate-900 dark:text-white capitalize">{mock.job_role}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>{mock.experience_level} Level</span>
                    <span>&bull;</span>
                    <span>{mock.difficulty} Difficulty</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                {/* Score */}
                <div className="flex items-center gap-1.5">
                  <Award size={16} className="text-primary-500 dark:text-primary-400" />
                  <span className={`font-bold text-sm ${mock.overall_score >= 80 ? 'text-emerald-500 dark:text-emerald-400' : mock.overall_score >= 60 ? 'text-primary-500 dark:text-primary-400' : 'text-amber-500 dark:text-amber-400'}`}>
                    {mock.overall_score ? `${mock.overall_score}%` : 'Incomplete'}
                  </span>
                </div>

                {/* CTA */}
                {mock.status === 'completed' ? (
                  <Link
                    to={`/interview/report/${mock.id}`}
                    className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition"
                  >
                    <span>View Evaluation Card</span>
                    <ArrowUpRight size={14} />
                  </Link>
                ) : (
                  <Link to={`/interview/setup/${mock.id}`}>
                    <Button size="sm" variant="secondary">Resume Mock Session</Button>
                  </Link>
                )}
              </div>

            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default InterviewHistory;
