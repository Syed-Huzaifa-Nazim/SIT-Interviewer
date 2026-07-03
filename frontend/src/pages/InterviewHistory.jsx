import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { History, Search, Filter, ArrowUpRight, Award, AlertCircle } from 'lucide-react';

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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-2.5">
          <History className="text-primary-500" />
          Mock Assessment History
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Review all mock interview sessions, check scores, and review granular speech/text answers.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar - Search, Filter, Sort */}
      <div className="glass-panel p-4 rounded-xl flex flex-col md:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            className="w-full glass-input pl-10 py-2 text-xs"
            placeholder="Search by job role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={14} className="text-slate-500" />
          <select
            className="glass-input py-2 px-3 text-xs w-full md:w-40 cursor-pointer bg-slate-900"
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
          className="glass-input py-2 px-3 text-xs w-full md:w-40 cursor-pointer bg-slate-900"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="newest">Sort: Newest First</option>
          <option value="oldest">Sort: Oldest First</option>
          <option value="highest_score">Sort: Highest Score</option>
        </select>
      </div>

      {/* History Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading history logs...</div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-sm bg-slate-950/20">
          <History className="mx-auto text-slate-750 mb-3" size={32} />
          <p>No interview records matched your criteria.</p>
          <Link to="/interview/start" className="text-xs text-primary-400 hover:text-primary-300 font-semibold underline mt-2 block">
            Launch a new session
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredHistory.map((mock) => (
            <div key={mock.id} className="glass-panel p-6 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition duration-200">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] bg-primary-500/10 border border-primary-500/20 text-primary-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    {mock.type}
                  </span>
                  <span className="text-xs text-slate-550">
                    {new Date(mock.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <h3 className="font-extrabold text-lg text-white capitalize">{mock.job_role}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>{mock.experience_level} Level</span>
                    <span>&bull;</span>
                    <span>{mock.difficulty} Difficulty</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-900 flex items-center justify-between gap-4">
                {/* Score */}
                <div className="flex items-center gap-1.5">
                  <Award size={16} className="text-primary-400" />
                  <span className={`font-bold text-sm ${mock.overall_score >= 80 ? 'text-emerald-400' : mock.overall_score >= 60 ? 'text-primary-400' : 'text-amber-400'}`}>
                    {mock.overall_score ? `${mock.overall_score}%` : 'Incomplete'}
                  </span>
                </div>

                {/* CTA */}
                {mock.status === 'completed' ? (
                  <Link
                    to={`/interview/report/${mock.id}`}
                    className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition"
                  >
                    <span>View Evaluation Card</span>
                    <ArrowUpRight size={14} />
                  </Link>
                ) : (
                  <Link
                    to={`/interview/setup/${mock.id}`}
                    className="px-3.5 py-2 bg-primary-600/20 border border-primary-500/35 hover:bg-primary-600 hover:text-white text-xs font-semibold text-primary-400 rounded-lg transition"
                  >
                    Resume Mock Session
                  </Link>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InterviewHistory;
