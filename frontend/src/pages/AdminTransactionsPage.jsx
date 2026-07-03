import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Coins, 
  Search, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Gift,
  AlertTriangle
} from 'lucide-react';

const AdminTransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await api.get('/admin/transactions');
        setTransactions(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch system transaction logs.');
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  const filteredTransactions = transactions.filter((t) => {
    return (
      t.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.transaction_type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto my-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading transactions log...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Transactions Auditor</h1>
        <p className="text-sm text-slate-400">Track token additions, deductions, purchases, and manual overrides.</p>
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
            placeholder="Search by candidate name, email, or transaction type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Transactions list Table */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 border-b border-slate-900 pb-3">
                <th className="py-3 font-bold">Candidate Details</th>
                <th className="py-3 font-bold">Transaction Type</th>
                <th className="py-3 font-bold text-center">Amount (USD)</th>
                <th className="py-3 font-bold text-center">Tokens Delta</th>
                <th className="py-3 font-bold text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-xs">
                    No token transaction records found.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((item) => {
                  let typeBadgeColor = 'bg-slate-800 text-slate-400 border border-slate-700';
                  let TypeIcon = Gift;
                  if (item.transaction_type === 'purchase') {
                    typeBadgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                    TypeIcon = TrendingUp;
                  } else if (item.transaction_type === 'consumption') {
                    typeBadgeColor = 'bg-red-500/10 text-red-400 border border-red-500/20';
                    TypeIcon = TrendingDown;
                  } else if (item.transaction_type === 'admin_adjustment') {
                    typeBadgeColor = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
                    TypeIcon = AlertTriangle;
                  }

                  const isAddition = item.tokens_added > 0;

                  return (
                    <tr key={item.id} className="text-slate-350 hover:bg-slate-900/10 transition-colors">
                      {/* Candidate */}
                      <td className="py-4">
                        <div className="font-bold text-slate-200">{item.user_name}</div>
                        <div className="text-[10px] text-slate-500">{item.user_email}</div>
                      </td>

                      {/* Transaction Type */}
                      <td className="py-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase inline-flex items-center gap-1 ${typeBadgeColor}`}>
                          <TypeIcon size={10} />
                          {item.transaction_type.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-4 text-center font-mono font-bold text-slate-200">
                        {item.amount > 0 ? `$${item.amount.toFixed(2)}` : '—'}
                      </td>

                      {/* Tokens Delta */}
                      <td className="py-4 text-center font-mono font-bold">
                        <span className={isAddition ? 'text-emerald-400' : 'text-red-400'}>
                          {isAddition ? `+${item.tokens_added}` : item.tokens_added}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-4 text-right text-slate-500 font-mono text-[10px]">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminTransactionsPage;
