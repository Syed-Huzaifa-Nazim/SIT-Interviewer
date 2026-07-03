import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { 
  User, 
  Coins, 
  Sparkles, 
  Award, 
  History, 
  CreditCard, 
  AlertCircle, 
  CheckCircle,
  ShieldCheck,
  Globe,
  Briefcase
} from 'lucide-react';

const ProfilePage = () => {
  const { user, tokens, fetchProfile, setTokens } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [country, setCountry] = useState(user?.country || '');
  const [experienceLevel, setExperienceLevel] = useState(user?.experience_level || 'Mid');
  const [jobRole, setJobRole] = useState(user?.job_role || 'React Developer');

  const [badges, setBadges] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [checkoutTokens, setCheckoutTokens] = useState(5);
  
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
      const res = await api.put('/users/profile', {
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

  const pricingTiers = [
    { qty: 5, price: 9.99, popular: false },
    { qty: 10, price: 17.99, popular: true },
    { qty: 25, price: 39.99, popular: false }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-2.5">
          <User className="text-primary-500" />
          Profile & Account Management
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Adjust interview criteria, purchase mock tokens, and view achievements unlocked during mock trials.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-start gap-2.5">
          <CheckCircle className="shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Grid Column: Profile Forms */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleUpdateProfile} className="glass-panel p-6 rounded-2xl space-y-5">
            <h3 className="font-bold text-lg text-white border-b border-slate-850 pb-3">Update Interview Settings</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Full Name</label>
                <input
                  type="text"
                  className="w-full glass-input text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Country</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    className="w-full glass-input pl-9 text-sm"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Experience Level</label>
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
                <label className="text-xs font-semibold text-slate-400">Target Role</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    className="w-full glass-input pl-9 text-sm"
                    value={jobRole}
                    onChange={(e) => setJobRole(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
              >
                {loading ? 'Saving details...' : 'Save Settings'}
              </button>
            </div>
          </form>

          {/* Gamified Achievements badges */}
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <h3 className="font-bold text-lg text-white">Achievements & Badges</h3>
              <span className="text-xs text-primary-400 font-semibold flex items-center gap-1">
                <Award size={14} />
                <span>{badges.filter(b => b.unlocked).length} / {badges.length} Unlocked</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {badges.map((badge) => (
                <div 
                  key={badge.id} 
                  className={`p-4 rounded-xl border flex items-center gap-4 transition ${badge.unlocked ? 'bg-primary-500/5 border-primary-500/25' : 'bg-slate-900/30 border-slate-850 opacity-60'}`}
                >
                  <div className={`p-3 rounded-full ${badge.unlocked ? 'bg-primary-500/10 text-primary-400' : 'bg-slate-800 text-slate-600'} shrink-0`}>
                    <Award size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-200">{badge.title}</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-normal">{badge.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Grid Column: Token Purchase checkout widget & Transaction log */}
        <div className="space-y-6">
          
          {/* Purchase tokens */}
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
              <Coins className="text-yellow-400" />
              <h3 className="font-bold text-lg text-white">Purchase Mock Tokens</h3>
            </div>

            <div className="space-y-3">
              {pricingTiers.map((tier, idx) => (
                <button
                  key={idx}
                  onClick={() => handleBuyTokens(tier.qty, tier.price)}
                  disabled={buyLoading}
                  className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-4 transition relative group overflow-hidden ${tier.popular ? 'border-primary-500 bg-primary-500/5' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
                >
                  {tier.popular && (
                    <div className="absolute top-0 right-0 bg-primary-500 text-white text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-bl">
                      Best Value
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-bold text-slate-200 block">{tier.qty} Interview Tokens</span>
                    <span className="text-[10px] text-slate-500">Fast checkout verification</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-base font-extrabold text-white block">${tier.price}</span>
                    <span className="text-[9px] text-primary-400 font-bold group-hover:underline">Buy Now</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Transactions history */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
              <History className="text-slate-400" size={18} />
              <h3 className="font-bold text-base text-white">Transaction Logs</h3>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-3.5 pr-1 divide-y divide-slate-900">
              {transactions.length === 0 ? (
                <div className="text-center py-6 text-slate-650 text-xs font-sans">
                  No transaction records loaded.
                </div>
              ) : (
                transactions.map((tx, idx) => (
                  <div key={tx.id} className={`flex items-center justify-between text-xs pt-3 ${idx === 0 ? 'pt-0' : ''}`}>
                    <div>
                      <span className="font-bold text-slate-350 block capitalize">
                        {tx.transaction_type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-550">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono font-bold block ${tx.tokens_added > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
          </div>

        </div>

      </div>
    </div>
  );
};

export default ProfilePage;
