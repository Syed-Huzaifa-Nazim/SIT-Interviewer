import React, { useState, useEffect } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import SearchBar from '../components/ui/SearchBar';
import Spinner from '../components/ui/Spinner';
import DeleteButton from '../components/ui/DeleteButton';
import {
  Coins,
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

  const handleDelete = async (id) => {
    setError('');
    try {
      await api.delete(`/admin/transactions/${id}`);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the transaction.');
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    return (
      t.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.transaction_type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getTypeConfig = (type) => {
    switch (type) {
      case 'purchase':
        return { variant: 'success', Icon: TrendingUp };
      case 'consumption':
        return { variant: 'error', Icon: TrendingDown };
      case 'admin_adjustment':
        return { variant: 'warning', Icon: AlertTriangle };
      default:
        return { variant: 'default', Icon: Gift };
    }
  };

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading transactions log..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Coins}
        title="Transactions Auditor"
        subtitle="Track token additions, deductions, purchases, and manual overrides."
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card padding={false} className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by candidate name, email, or transaction type..."
        />
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 font-bold">Candidate Details</th>
                <th className="py-3 font-bold">Transaction Type</th>
                <th className="py-3 font-bold text-center">Amount (USD)</th>
                <th className="py-3 font-bold text-center">Tokens Delta</th>
                <th className="py-3 font-bold text-right">Timestamp</th>
                <th className="py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                    No token transaction records found.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((item) => {
                  const { variant, Icon: TypeIcon } = getTypeConfig(item.transaction_type);
                  const isAddition = item.tokens_added > 0;

                  return (
                    <tr key={item.id} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="py-4">
                        <div className="font-bold text-slate-900 dark:text-slate-200">{item.user_name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.user_email}</div>
                      </td>

                      <td className="py-4">
                        <Badge variant={variant}>
                          <TypeIcon size={10} />
                          {item.transaction_type.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="py-4 text-center font-mono font-bold text-slate-900 dark:text-slate-200">
                        {item.amount > 0 ? `$${item.amount.toFixed(2)}` : '—'}
                      </td>

                      <td className="py-4 text-center font-mono font-bold">
                        <span className={isAddition ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                          {isAddition ? `+${item.tokens_added}` : item.tokens_added}
                        </span>
                      </td>

                      <td className="py-4 text-right text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                        {new Date(item.created_at).toLocaleString()}
                      </td>

                      <td className="py-4">
                        <div className="flex justify-end">
                          <DeleteButton
                            onConfirm={() => handleDelete(item.id)}
                            confirmMessage={`Delete this ${item.transaction_type.replace('_', ' ')} transaction record permanently?`}
                            title="Delete Transaction"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminTransactionsPage;
