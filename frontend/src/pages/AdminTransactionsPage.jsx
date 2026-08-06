import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import DeleteButton from '../components/ui/DeleteButton';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { StaggerRow } from '@/components/shadcn/motion';
import { StatCard, StatGrid } from '@/components/shadcn/stat-card';
import {
  AdminPageHeader,
  AdminSearch,
  AdminEmpty,
  AdminPageSkeleton,
  AdminTableCard,
} from '@/components/shadcn/page';
import { AdminFilter, facetOptions, applyFacets, hasActiveFilters } from '@/components/shadcn/filter';
import { Coins, TrendingUp, TrendingDown, Gift, AlertTriangle, Wallet } from 'lucide-react';

const PAGE_SIZE = 10;

const TYPE_CONFIG = {
  purchase: { variant: 'success', Icon: TrendingUp },
  consumption: { variant: 'destructive', Icon: TrendingDown },
  admin_adjustment: { variant: 'warning', Icon: AlertTriangle },
};
const typeConfig = (type) => TYPE_CONFIG[type] || { variant: 'secondary', Icon: Gift };

const AdminTransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filters]);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await api.get('/admin/transactions');
        setTransactions(res.data || []);
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

  const FACETS = { transaction_type: (t) => t.transaction_type };

  const filterGroups = useMemo(
    () => [
      {
        key: 'transaction_type',
        label: 'Transaction type',
        options: facetOptions(transactions, FACETS.transaction_type, {
          labels: { purchase: 'Purchase', consumption: 'Consumption', admin_adjustment: 'Admin adjustment' },
          order: ['purchase', 'consumption', 'admin_adjustment'],
        }),
      },
    ],
    [transactions]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const bySearch = !q
      ? transactions
      : transactions.filter((t) =>
          [t.user_name, t.user_email, t.transaction_type]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        );
    return applyFacets(bySearch, filters, FACETS);
  }, [transactions, searchTerm, filters]);

  const totals = useMemo(
    () =>
      transactions.reduce(
        (acc, t) => {
          if (t.transaction_type === 'purchase') acc.revenue += t.amount || 0;
          const delta = t.tokens_added || 0;
          if (delta > 0) acc.granted += delta;
          else acc.consumed += Math.abs(delta);
          return acc;
        },
        { revenue: 0, granted: 0, consumed: 0 }
      ),
    [transactions]
  );

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <AdminPageSkeleton rows={6} cols={6} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Coins}
        title="Transactions Auditor"
        subtitle="Token grants, deductions, purchases and manual overrides."
      >
        <AdminSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by candidate name, email, or transaction type…"
        >
          <AdminFilter groups={filterGroups} value={filters} onChange={setFilters} />
        </AdminSearch>
      </AdminPageHeader>

      {error && <Alert variant="error">{error}</Alert>}

      <StatGrid cols={3}>
        <StatCard index={0} label="Gross Revenue" value={totals.revenue} prefix="$" decimals={2} icon={Wallet} tone="success" />
        <StatCard index={1} label="Tokens Granted" value={totals.granted} icon={TrendingUp} tone="primary" />
        <StatCard index={2} label="Tokens Consumed" value={totals.consumed} icon={TrendingDown} tone="warning" />
      </StatGrid>

      <AdminTableCard>
        {filtered.length === 0 ? (
          <AdminEmpty
            icon={Coins}
            title={searchTerm ? 'No transactions match your search' : 'No transactions recorded'}
            message={
              searchTerm
                ? 'Try a different candidate name, email or type.'
                : 'Token purchases and adjustments will appear here.'
            }
            filtered={!!searchTerm || hasActiveFilters(filters)}
            onClear={() => {
              setSearchTerm('');
              setFilters({});
            }}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">Tokens</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Timestamp</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((item, i) => {
                  const { variant, Icon } = typeConfig(item.transaction_type);
                  const delta = item.tokens_added || 0;
                  const isAddition = delta > 0;
                  return (
                    <StaggerRow
                      key={item.id}
                      index={i}
                      className="border-b border-border transition-colors hover:bg-accent/60"
                    >
                      <TableCell>
                        <div className="font-semibold text-foreground">{item.user_name}</div>
                        <div className="text-[11px] text-muted-foreground">{item.user_email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant} size="sm" className="capitalize">
                          <Icon />
                          {String(item.transaction_type).replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-foreground">
                        {item.amount > 0 ? `$${item.amount.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold">
                        <span className={isAddition ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                          {isAddition ? `+${delta}` : delta}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-[11px] text-muted-foreground md:table-cell">
                        {new Date(item.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <DeleteButton
                            onConfirm={() => handleDelete(item.id)}
                            confirmMessage={`Delete this ${String(item.transaction_type).replace(/_/g, ' ')} record permanently?`}
                            title="Delete Transaction"
                          />
                        </div>
                      </TableCell>
                    </StaggerRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className={cn('border-t border-border px-3')}>
              <Pagination page={page} total={filtered.length} onChange={setPage} />
            </div>
          </>
        )}
      </AdminTableCard>
    </div>
  );
};

export default AdminTransactionsPage;
