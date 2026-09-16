import { formatMoneyExact } from '../lib/formulas'
import type { MoneyLine, MonthlyRecord, Store } from '../types'
import { SectionHeader } from './ui/PageHeader'

interface Props {
  records: MonthlyRecord[]
  stores: Store[]
}

interface DetailRow extends MoneyLine {
  storeName: string
  month: number
}

function DetailTable({ title, rows, tone, showStore }: { title: string; rows: DetailRow[]; tone: 'income' | 'expense'; showStore: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return (
    <section className="surface min-w-0 overflow-hidden">
      <SectionHeader title={title} tone={tone} count={`${rows.length} 条`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] table-fixed text-left text-sm">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="w-16 px-4 py-2 font-medium">日期</th>
              <th className="px-3 py-2 font-medium">明细</th>
              <th className="w-32 px-4 py-2 text-right font-medium">金额</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line/70 hover:bg-surface-2/60">
                <td className="px-4 py-2 text-ink-3 tnum">{row.month}.{row.day}</td>
                <td className="px-3 py-2">
                  <div className={`break-words ${row.highlight ? 'font-medium text-warn' : 'text-ink'}`}>{row.detail || '未填写说明'}</div>
                  {showStore && <div className="mt-0.5 text-xs text-ink-3">{row.storeName}</div>}
                </td>
                <td className="px-4 py-2 text-right font-medium text-ink tnum">{formatMoneyExact(row.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-ink-3">本月没有{title}</td></tr>
            )}
          </tbody>
          <tfoot className="border-t border-line-strong bg-surface">
            <tr>
              <td colSpan={2} className="px-4 py-2.5 text-sm font-medium text-ink-2">合计</td>
              <td className="px-4 py-2.5 text-right text-base font-semibold text-ink tnum">{formatMoneyExact(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

/**
 * 收支明细：只记录、不参与任何经营指标计算。
 */
export function TransactionDetails({ records, stores }: Props) {
  const storeNames = new Map(stores.map((store) => [store.id, store.name]))
  const showStore = new Set(records.map((record) => record.storeId)).size > 1

  function rowsFor(type: 'income' | 'expense'): DetailRow[] {
    return records
      .flatMap((record) => {
        const items = type === 'income' ? record.incomeItems : record.expenseItems
        return items.map((item) => ({ ...item, storeName: storeNames.get(record.storeId) || record.storeId, month: record.month }))
      })
      .filter((row) => row.detail || row.amount)
      .sort((a, b) => a.day - b.day || a.storeName.localeCompare(b.storeName))
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DetailTable title="收入明细" rows={rowsFor('income')} tone="income" showStore={showStore} />
      <DetailTable title="支出明细" rows={rowsFor('expense')} tone="expense" showStore={showStore} />
    </div>
  )
}
