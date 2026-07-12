import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
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
  Camera
} from 'lucide-react';

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

  const pricingTiers = [
    { qty: 5, price: 9.99, popular: false },
    { qty: 10, price: 17.99, popular: true },
    { qty: 25, price: 39.99, popular: false }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <PageHeader
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

              <div className="flex justify-end pt-3">
                <Button type="submit" size="sm" loading={loading}>
                  {loading ? 'Saving details...' : 'Save Settings'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Badges and achievements */}
          <Card className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <CardTitle className="mb-0">Achievements & Badges</CardTitle>
              <span className="text-xs text-primary-500 dark:text-primary-400 font-semibold flex items-center gap-1">
                <Award size={14} />
                <span>{badges.filter(b => b.unlocked).length} / {badges.length} Unlocked</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {badges.map((badge) => (
                <div 
                  key={badge.id} 
                  className={`p-4 rounded-xl border flex items-center gap-4 transition ${badge.unlocked ? 'bg-primary-500/5 border-primary-500/25' : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-65'}`}
                >
                  <div className={`p-3 rounded-full ${badge.unlocked ? 'bg-primary-500/10 text-primary-500 dark:text-primary-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600'} shrink-0`}>
                    <Award size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{badge.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">{badge.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Grid Column: Rank badge card, Top up tokens, Transaction history */}
        <div className="space-y-6">
          
          {/* Dynamic Rank Badge Display Card */}
          <Card className="border border-slate-200 dark:border-slate-800 relative overflow-hidden flex flex-col items-center text-center space-y-4">
            <div className={`absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full blur-2xl bg-gradient-to-tr ${rank.gradient}`}></div>
            
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${rank.color} border shadow-lg flex items-center justify-center`}>
              <RankIcon size={28} />
            </div>

            <div className="space-y-1">
              <Badge className={rank.badgeClass} size="lg">
                {rank.name}
              </Badge>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 pt-1">Rank Evaluation</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal max-w-[200px] mx-auto">
                {rank.desc}
              </p>
            </div>
            
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
                      <span className="text-[10px] text-slate-500">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </span>
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
