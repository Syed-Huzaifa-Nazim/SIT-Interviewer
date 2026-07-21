import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import {
  Play,
  History,
  TrendingUp,
  Award,
  Clock,
  Target,
  Code,
  FileCheck,
} from "lucide-react";

const Dashboard = () => {
  const { user, tokens } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total_interviews: 0,
    average_score: 0,
    top_skills: [],
  });
  const [recentInterviews, setRecentInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const statsRes = await api.get("/interviews/stats/summary");
        setStats(statsRes.data);
        const historyRes = await api.get("/interviews/history?limit=3");
        setRecentInterviews(
          Array.isArray(historyRes.data)
            ? historyRes.data
            : historyRes.data?.items || [],
        );
      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 animate-fade-in">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] || "Student"}!`}
        subtitle="Review your academic progress and start new evaluations below."
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Total Assessments"
          value={stats.total_interviews}
          icon={Target}
          color="primary"
        />
        <StatCard
          title="Average Technical Score"
          value={`${Math.round(stats.average_score)}%`}
          icon={Award}
          color="accent"
        />
        <StatCard
          title="Tokens Remaining"
          value={tokens?.tokens_available || 0}
          icon={TrendingUp}
          color={(tokens?.tokens_available || 0) > 2 ? "success" : "warning"}
        />
      </div>

      {/* Module Selection */}
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-8 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
        Academic Modules
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          hover
          className="flex flex-col h-full border-l-4 border-primary-500"
        >
          <div className="flex-1">
            <div className="w-10 h-10 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center mb-4">
              <Play size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Technical Interview
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Simulate a real technical screening with AI using voice or text.
            </p>
          </div>
          <Button fullWidth onClick={() => navigate("/interview/start")}>
            Initialize Module
          </Button>
        </Card>

        <Card
          hover
          className="flex flex-col h-full border-l-4 border-accent-500"
        >
          <div className="flex-1">
            <div className="w-10 h-10 rounded-lg bg-accent-100 text-accent-700 flex items-center justify-center mb-4">
              <Code size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Company Interview Sandbox
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Take a live coding assessment for a company with recruiter-style
              prompts and submission flow.
            </p>
          </div>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate("/coding")}
          >
            Start Assessment
          </Button>
        </Card>

        <Card
          hover
          className="flex flex-col h-full border-l-4 border-slate-500"
        >
          <div className="flex-1">
            <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center mb-4 dark:bg-slate-800 dark:text-slate-400">
              <FileCheck size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Resume Matching
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Upload your CV to see how well it maps to specific job
              requirements.
            </p>
          </div>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate("/resume-match")}
          >
            Upload Document
          </Button>
        </Card>
      </div>

      {/* Recent History */}
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-10 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center justify-between">
        <span>Recent Evaluations</span>
        <Link
          to="/history"
          className="text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          View Transcript
        </Link>
      </h3>

      <div className="space-y-4">
        {recentInterviews.length > 0 ? (
          recentInterviews.map((interview) => (
            <Card
              hover
              key={interview.id}
              padding={false}
              className="p-0 overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between p-5 gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                    {interview.type === "coding" ? (
                      <Code size={20} />
                    ) : (
                      <Target size={20} />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white capitalize truncate max-w-[200px] sm:max-w-xs">
                      {interview.job_role || interview.type} Assessment
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />{" "}
                        {new Date(interview.created_at).toLocaleDateString()}
                      </span>
                      <Badge
                        variant={
                          interview.status === "completed"
                            ? "success"
                            : "warning"
                        }
                      >
                        {interview.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                  {interview.status === "completed" &&
                    interview.overall_score !== null &&
                    interview.overall_score !== undefined && (
                      <div className="text-right">
                        <span className="text-xs font-semibold text-slate-500 uppercase block">
                          Score
                        </span>
                        <span className="text-lg font-extrabold text-primary-600 dark:text-primary-400">
                          {Math.round(interview.overall_score)}%
                        </span>
                      </div>
                    )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(`/interview/report/${interview.id}`)
                    }
                  >
                    {interview.status === "completed"
                      ? "View Report"
                      : "Resume"}
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState
            icon={History}
            message="You haven't completed any assessments yet. Start a module to generate your first report."
            actionLabel="Start Interview"
            onAction={() => navigate("/interview/start")}
          />
        )}
      </div>
    </div>
  );
};

export default Dashboard;
