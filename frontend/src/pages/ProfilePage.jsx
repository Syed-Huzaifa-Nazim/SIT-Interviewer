import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { timeAgo, formatDateTime, formatDate } from '../utils/datetime';
import { AdminPageHeader } from '@/components/shadcn/page';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { 
  User, 
  Coins, 
  Award, 
  History, 
  Globe,
  Briefcase,
  Crown,
  Shield,
  Camera,
  Lock,
  UserCheck,
  ShieldCheck,
  FileText,
  TrendingUp
} from 'lucide-react';

/**
 * Badge tiers.
 *
 * The backend's /users/achievements endpoint returns each badge with nothing but an
 * `unlocked` flag — it has no concept of tiers. The five rank tiers already exist here in
 * the frontend (see getRankBadge below), so a badge's tier is decided here too, mapped by
 * badge id. That keeps one vocabulary across the page with no backend change.
 *
 * A badge whose id is not listed falls back to bronze rather than rendering untiered.
 */
const BADGE_TIERS = {
  welcome: 'bronze',
  first_interview: 'bronze',
  resume_analyzed: 'silver',
  five_interviews: 'gold',
  high_performer: 'platinum',
};

const TIER_STYLES = {
  bronze: {
    label: 'Bronze',
    medal: 'bg-gradient-to-br from-orange-300 to-orange-700 text-white',
    pill: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/25',
    dot: 'bg-orange-600',
  },
  silver: {
    label: 'Silver',
    medal: 'bg-gradient-to-br from-slate-100 to-slate-400 text-slate-700',
    pill: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-400/30',
    dot: 'bg-slate-400',
  },
  gold: {
    label: 'Gold',
    medal: 'bg-gradient-to-br from-amber-200 to-amber-600 text-white',
    pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
    dot: 'bg-amber-500',
  },
  platinum: {
    label: 'Platinum',
    medal: 'bg-gradient-to-br from-cyan-200 to-cyan-600 text-white',
    pill: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/25',
    dot: 'bg-cyan-500',
  },
};

// Maps the icon name the API sends to the actual lucide component.
//
// The API's own names are kept as the keys so no backend change is needed, but two of them
// are deliberately re-pointed: 'Sparkles' and 'Zap' read as generic AI-slide decoration
// rather than an assessment product, so they resolve to icons that say what the badge
// actually means — verified profile, and an upward score trend.
const BADGE_ICONS = {
  Sparkles: UserCheck,
  Award,
  ShieldCheck,
  FileText,
  Zap: TrendingUp,
};

/**
 * One line of the Account Activity card.
 *
 * `absolute` picks the calendar date over a relative reading — "member since" is a fact
 * about a date, whereas "last active" is about recency, and "312d ago" is a worse answer to
 * the first question than "12 Oct 2025". Renders a dash rather than being omitted when the
 * timestamp is missing, so the rows stay aligned and the absence is visible.
 */
const TimelineRow = ({ label, value, absolute = false }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="text-xs font-semibold text-slate-700 dark:text-slate-300">
      {value ? (
        <time dateTime={value} title={formatDateTime(value)}>
          {absolute ? formatDate(value) : timeAgo(value)}
        </time>
      ) : (
        <span className="text-slate-400">—</span>
      )}
    </dd>
  </div>
);

const ProfilePage = () => {
  const { user, tokens, fetchProfile, setTokens } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [country, setCountry] = useState(user?.country || '');
  const [experienceLevel, setExperienceLevel] = useState(user?.experience_level || 'Mid');
  const [jobRole, setJobRole] = useState(user?.job_role || 'React Developer');

  const [badges, setBadges] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [averageScore, setAverageScore] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const achRes = await api.get('/users/achievements');
        setBadges(achRes.data.badges || []);
        
        const txRes = await api.get('/tokens/transactions');
        setTransactions(txRes.data || []);

        const historyRes = await api.get('/interviews/history');
        const completed = historyRes.data.filter(i => i.status === 'completed');
        setCompletedCount(completed.length);
        const total = completed.reduce((sum, item) => sum + item.overall_score, 0);
        setAverageScore(completed.length > 0 ? Math.round(total / completed.length) : 0);
      } catch (err) {
        console.error('Failed to load achievements and transactions:', err);
      }
    };
    loadProfileData();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.put('/users/profile', {
        name,
        country,
        experience_level: experienceLevel,
        job_role: jobRole
      });
      setSuccess('Profile details updated successfully!');
      fetchProfile();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleBuyTokens = async (qty, price) => {
    setBuyLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.post('/tokens/purchase', {
        tokens: qty,
        amount: price
      });
      setSuccess(`Successfully purchased ${qty} tokens!`);
      
      // Update global context state
      setTokens(res.data.tokens);
      
      // Reload transactions log
      const txRes = await api.get('/tokens/transactions');
      setTransactions(txRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Token purchase failed.');
    } finally {
      setBuyLoading(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be under 5MB.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/users/profile/picture', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setSuccess('Profile picture uploaded successfully!');
      fetchProfile();
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to upload profile picture.');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic Rank Badge System mapping
  const getRankBadge = (count, avgScore) => {
    if (count >= 10 || avgScore >= 90) {
      return {
        name: 'Platinum Elite',
        color: 'from-slate-400 via-cyan-400 to-slate-200 text-cyan-400 border-cyan-500/30 shadow-cyan-500/10',
        badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
        icon: Crown,
        gradient: 'from-cyan-400 to-indigo-500',
        desc: 'Master level technical score. Zero compliance infractions.'
      };
    } else if (count >= 6 || avgScore >= 75) {
      return {
        name: 'Gold Professional',
        color: 'from-amber-500 via-yellow-400 to-amber-600 text-amber-400 border-amber-500/35 shadow-amber-500/10',
        badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        icon: Crown,
        gradient: 'from-amber-400 to-yellow-500',
        desc: 'Solid technical depth with structured speech feedback.'
      };
    } else if (count >= 3 || avgScore >= 60) {
      return {
        name: 'Silver Practitioner',
        color: 'from-slate-400 via-slate-200 to-slate-400 text-slate-300 border-slate-400/20 shadow-slate-500/5',
        badgeClass: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
        icon: Award,
        gradient: 'from-slate-300 to-slate-500',
        desc: 'Steady practitioner showing consistent mock upgrades.'
      };
    } else if (count >= 1) {
      return {
        name: 'Bronze Aspirant',
        color: 'from-orange-700 via-amber-800 to-orange-900 text-orange-400 border-orange-800/20 shadow-orange-500/5',
        badgeClass: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
        icon: Award,
        gradient: 'from-orange-500 to-amber-700',
        desc: 'Completed initial assessments. Ready to scale.'
      };
    } else {
      return {
        name: 'Basic Member',
        color: 'from-slate-800 to-slate-900 text-slate-500 border-slate-900/60 shadow-none',
        badgeClass: 'bg-slate-900/40 text-slate-500 border-slate-800',
        icon: Shield,
        gradient: 'from-slate-700 to-slate-800',
        desc: 'Complete mock assessment trials to unlock rank achievements.'
      };
    }
  };

  const rank = getRankBadge(completedCount, averageScore);
  const RankIcon = rank.icon;

  // How far along the candidate is toward the next rank, using the SAME thresholds
  // getRankBadge applies above so the two can never drift apart.
  const nextRank = (() => {
    const ladder = [
      { name: 'Bronze Aspirant', needCount: 1, needScore: null },
      { name: 'Silver Practitioner', needCount: 3, needScore: 60 },
      { name: 'Gold Professional', needCount: 6, needScore: 75 },
      { name: 'Platinum Elite', needCount: 10, needScore: 90 },
    ];
    const next = ladder.find(
      (step) => completedCount < step.needCount && (step.needScore === null || averageScore < step.needScore)
    );
    if (!next) return null;

    const pct = Math.min(100, Math.round((completedCount / next.needCount) * 100));
    const remaining = Math.max(0, next.needCount - completedCount);
    return { ...next, pct, remaining };
  })();

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  const pricingTiers = [
    { qty: 5, price: 9.99, popular: false },
    { qty: 10, price: 17.99, popular: true },
    { qty: 25, price: 39.99, popular: false }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Medallion + badge animations. Scoped to this page and kept out of index.css so the
          global stylesheet stays untouched. Everything stops under prefers-reduced-motion. */}
      <style>{`
        @keyframes rank-halo-spin { to { transform: rotate(360deg); } }
        @keyframes rank-core-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes rank-shine-sweep { 0% { left: -60%; } 55%, 100% { left: 130%; } }
        @keyframes badge-shine-sweep { 0%, 72% { transform: translateX(-100%) skewX(-18deg); }
                                       88%, 100% { transform: translateX(220%) skewX(-18deg); } }

        .rank-halo {
          background: conic-gradient(from 0deg, transparent, currentColor, transparent 42%,
                                     currentColor, transparent 78%);
          color: rgb(148 163 184 / 0.85);
          animation: rank-halo-spin 7s linear infinite;
        }
        .rank-core { animation: rank-core-bob 3.4s ease-in-out infinite; }
        .rank-shine {
          position: absolute; top: 0; left: -60%; width: 45%; height: 100%;
          background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.55), transparent);
          transform: skewX(-18deg);
          animation: rank-shine-sweep 3.6s ease-in-out infinite;
        }
        .badge-medal .badge-shine {
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.5), transparent);
          transform: translateX(-100%) skewX(-18deg);
          animation: badge-shine-sweep 4.5s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .rank-halo, .rank-core, .rank-shine, .badge-medal .badge-shine { animation: none; }
          .rank-shine, .badge-medal .badge-shine { display: none; }
        }
      `}</style>

      {/* Same header treatment as the rest of the portal (aurora backdrop, icon tile) rather
          than this page's own older PageHeader, so Profile stops looking like a different app. */}
      <AdminPageHeader
        icon={User}
        title="Profile & Account Management"
        subtitle="Adjust interview parameters, purchase mock tokens, and review candidate ranking scores."
      />

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Grid: Profile Forms & Achievements */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <CardHeader>
                <CardTitle>Update Interview Settings</CardTitle>
              </CardHeader>
            
              <div className="flex flex-col sm:flex-row items-center gap-6 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="relative group w-20 h-20 shrink-0 rounded-full overflow-hidden border border-slate-300 dark:border-slate-800 hover:border-primary-500 transition shadow-lg bg-slate-100 dark:bg-slate-950">
                  {user?.profile_pic_url ? (
                    <img 
                      src={user.profile_pic_url} 
                      alt={user.name} 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-primary-500 to-indigo-600 flex items-center justify-center font-bold text-white text-2xl">
                      {user ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[9px] font-bold cursor-pointer transition duration-250 select-none">
                    <Camera size={18} className="mb-1" />
                    <span>Upload Pic</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleAvatarChange} 
                      className="hidden" 
                    />
                  </label>
                </div>
                <div className="text-center sm:text-left space-y-1">
                  <h4 className="font-bold text-base text-slate-800 dark:text-slate-200">{user?.name}</h4>
                  <p className="text-xs text-primary-500 dark:text-primary-400 font-semibold uppercase tracking-wider">{user?.role} Profile</p>
                  <p className="text-[10px] text-slate-500">Supports PNG, JPG, JPEG, WEBP, or GIF (max 5MB).</p>
                </div>
              </div>
            
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Full Name</label>
                  <input
                    type="text"
                    className="w-full glass-input text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Country</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                    <input
                      type="text"
                      className="w-full glass-input !pl-9 text-sm"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Experience Level</label>
                  <select
                    className="w-full glass-input text-sm cursor-pointer"
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                  >
                    <option value="Entry">Entry Level</option>
                    <option value="Mid">Mid Level</option>
                    <option value="Senior">Senior Level</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Target Role</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                    <input
                      type="text"
                      className="w-full glass-input !pl-9 text-sm"
                      value={jobRole}
                      onChange={(e) => setJobRole(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Enrollment record — set once at signup, editable only by the
                  administration (§2.2). Shown read-only for transparency. */}
              {(user?.cnic || user?.course_category || user?.course_status) && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Enrollment Record (managed by administration)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="block text-slate-400 dark:text-slate-500">CNIC</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{user?.cnic || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400 dark:text-slate-500">Course Category</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{user?.course_category || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-slate-400 dark:text-slate-500">Course Status</span>
                      <span className={`font-bold capitalize ${user?.course_status === 'completed' ? 'text-accent-600 dark:text-accent-400' : 'text-primary-600 dark:text-primary-400'}`}>
                        {user?.course_status || '—'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
                    Completed your course? Contact the administration to update your status and unlock the official interview.
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-3">
                <Button type="submit" size="sm" loading={loading}>
                  {loading ? 'Saving details...' : 'Save Settings'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Badges and achievements */}
          <Card className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-3">
              <CardTitle className="mb-0">Achievements & Badges</CardTitle>
              <span className="text-xs text-primary-500 dark:text-primary-400 font-semibold flex items-center gap-1">
                <Award size={14} />
                <span>{unlockedCount} / {badges.length} Unlocked</span>
              </span>
            </div>

            {/* Tier legend, so the colour on each medal means something. */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TIER_STYLES).map(([key, tier]) => (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${tier.pill}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${tier.dot}`} />
                  {tier.label}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {badges.map((badge) => {
                const tier = TIER_STYLES[BADGE_TIERS[badge.id] || 'bronze'];
                const BadgeIcon = BADGE_ICONS[badge.icon] || Award;
                return (
                  <div
                    key={badge.id}
                    className={`relative p-4 rounded-xl border flex items-start gap-4 overflow-hidden transition ${
                      badge.unlocked
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:-translate-y-0.5 hover:shadow-md'
                        : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    {!badge.unlocked && (
                      <Lock size={12} className="absolute top-3 right-3 text-slate-400 dark:text-slate-600" />
                    )}

                    <div
                      className={`relative w-11 h-11 rounded-xl shrink-0 flex items-center justify-center overflow-hidden ${
                        badge.unlocked
                          ? `${tier.medal} shadow-inner badge-medal`
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      <BadgeIcon size={19} />
                      {badge.unlocked && <span className="badge-shine" />}
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                        {badge.title}
                        <span
                          className={`text-[8.5px] font-black tracking-wider px-1.5 py-0.5 rounded-full border uppercase ${tier.pill}`}
                        >
                          {tier.label}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">{badge.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Grid Column: Rank badge card, Top up tokens, Transaction history */}
        <div className="space-y-6">
          
          {/* Dynamic Rank Badge Display Card */}
          <Card className="border border-slate-200 dark:border-slate-800 relative overflow-hidden flex flex-col items-center text-center space-y-4">
            <div className={`absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 opacity-15 rounded-full blur-3xl bg-gradient-to-tr ${rank.gradient}`}></div>

            {/* Animated rank medallion. All CSS — no library, no canvas, and the whole thing
                stops moving under prefers-reduced-motion (see the style block below). */}
            <div className="relative w-[124px] h-[124px] rank-medal">
              {/* Rotating conic halo, masked into a ring by the panel-coloured disc on top. */}
              <div className="absolute -inset-1.5 rounded-full rank-halo" />
              <div className="absolute inset-0 rounded-full bg-white dark:bg-slate-900" />

              {/* Progress ring: how far into the current rank the candidate is. */}
              <svg className="absolute inset-1.5 -rotate-90" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="50" fill="none" strokeWidth="5" className="stroke-slate-200 dark:stroke-slate-800" />
                <circle
                  cx="56"
                  cy="56"
                  r="50"
                  fill="none"
                  strokeWidth="5"
                  strokeLinecap="round"
                  className={`${rank.color.split(' ').find((c) => c.startsWith('text-')) || 'text-primary-500'} transition-[stroke-dashoffset] duration-1000`}
                  stroke="currentColor"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={(2 * Math.PI * 50) * (1 - (nextRank ? nextRank.pct : 100) / 100)}
                />
              </svg>

              {/* Medallion core */}
              <div
                className={`absolute inset-[17px] rounded-full bg-gradient-to-br ${rank.gradient} flex flex-col items-center justify-center overflow-hidden rank-core shadow-lg`}
              >
                <RankIcon size={30} className="text-white drop-shadow" />
                <span className="text-[8px] font-black tracking-[0.14em] text-white/85 mt-0.5 uppercase">
                  {rank.name.split(' ')[0]}
                </span>
                <span className="rank-shine" />
              </div>

              {nextRank && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                  {nextRank.pct}% to {nextRank.name.split(' ')[0]}
                </span>
              )}
            </div>

            <div className="space-y-1 pt-2">
              <Badge className={rank.badgeClass} size="lg">
                {rank.name}
              </Badge>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 pt-1">Rank Evaluation</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal max-w-[200px] mx-auto">
                {rank.desc}
              </p>
            </div>

            {/* Progress to the next rank */}
            {nextRank && (
              <div className="w-full rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  <span>Progress to {nextRank.name}</span>
                  <span className="font-mono">{completedCount} / {nextRank.needCount}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${rank.gradient} transition-[width] duration-1000`}
                    style={{ width: `${nextRank.pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {nextRank.remaining} more completed {nextRank.remaining === 1 ? 'interview' : 'interviews'}
                  {nextRank.needScore ? `, or a ${nextRank.needScore}% average.` : '.'}
                </p>
              </div>
            )}

            <div className="w-full pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-around text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">Completed</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{completedCount}</span>
              </div>
              <div className="border-r border-slate-200 dark:border-slate-800" />
              <div>
                <span className="text-[10px] text-slate-500 block">Avg Rating</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{averageScore}%</span>
              </div>
              <div className="border-r border-slate-200 dark:border-slate-800" />
              <div>
                <span className="text-[10px] text-slate-500 block">Badges</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{unlockedCount}</span>
              </div>
            </div>
          </Card>

          {/* Top up tokens */}
          <Card className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Coins className="text-yellow-500 dark:text-yellow-400" />
              <CardTitle className="mb-0">Purchase Mock Tokens</CardTitle>
            </div>

            <div className="space-y-3">
              {pricingTiers.map((tier, idx) => (
                <button
                  key={idx}
                  onClick={() => handleBuyTokens(tier.qty, tier.price)}
                  disabled={buyLoading}
                  className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-4 transition relative group overflow-hidden cursor-pointer ${tier.popular ? 'border-primary-500 bg-primary-500/5' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
                >
                  {tier.popular && (
                    <Badge variant="primary" className="absolute top-0 right-0 rounded-none rounded-bl-lg rounded-tr-xl">
                      Best Value
                    </Badge>
                  )}
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">{tier.qty} Interview Tokens</span>
                    <span className="text-[10px] text-slate-500">Fast checkout verification</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-base font-extrabold text-slate-900 dark:text-white block">${tier.price}</span>
                    <span className="text-[9px] text-primary-500 dark:text-primary-400 font-bold group-hover:underline">Buy Now</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Account activity. The profile carried no time information at all beyond a bare
              date on each transaction — no sense of how long the account had existed or when
              it was last touched. Each row pairs a relative reading with the exact timestamp
              on hover, which is the pattern used everywhere else now. */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <UserCheck className="text-slate-400" size={18} />
              <CardTitle className="text-base mb-0">Account Activity</CardTitle>
            </div>
            <dl className="space-y-2.5">
              <TimelineRow label="Member since" value={user?.created_at} absolute />
              <TimelineRow label="Last active" value={user?.last_seen_at} />
              <TimelineRow label="Profile updated" value={user?.updated_at} />
            </dl>
          </Card>

          {/* Transactions Log */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <History className="text-slate-400" size={18} />
              <CardTitle className="text-base mb-0">Transaction Logs</CardTitle>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-3.5 pr-1 divide-y divide-slate-200 dark:divide-slate-800">
              {transactions.length === 0 ? (
                <EmptyState
                  icon={History}
                  message="No transaction records loaded."
                />
              ) : (
                transactions.map((tx, idx) => (
                  <div key={tx.id} className={`flex items-center justify-between text-xs pt-3 ${idx === 0 ? 'pt-0' : ''}`}>
                    <div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 block capitalize">
                        {tx.transaction_type.replace('_', ' ')}
                      </span>
                      {/* Relative, with the exact moment on hover — a bare date gave no
                          sense of whether a purchase was an hour or a year ago. */}
                      <time
                        className="text-[10px] text-slate-500"
                        dateTime={tx.created_at}
                        title={formatDateTime(tx.created_at)}
                      >
                        {timeAgo(tx.created_at)}
                      </time>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono font-bold block ${tx.tokens_added > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {tx.tokens_added > 0 ? `+${tx.tokens_added}` : tx.tokens_added} tokens
                      </span>
                      {tx.amount > 0 && (
                        <span className="text-[9px] text-slate-500">${tx.amount} Paid</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

        </div>

      </div>
    </div>
  );
};

export default ProfilePage;
