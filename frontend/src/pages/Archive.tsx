import { useState } from 'react'
import { Link } from 'react-router'
import { useApartments, useClients, useRequests, useSaveApartment, useSaveClient, useSaveRequest } from '../api/hooks'
import { Button, Card, Chip, Empty, PageHeader, Spinner } from '../components/ui'
import { shortDate } from '../lib/format'

type T = 'clients' | 'requests' | 'apartments'

/** Archived = hidden from daily work, never deleted. Restore with one click. */
export function Archive() {
  const [t, setT] = useState<T>('clients')
  const clients = useClients({ archived: true, page_size: 100 })
  const requests = useRequests({ archived: true, page_size: 100 }, t === 'requests')
  const apartments = useApartments({ archived: true, page_size: 100 }, t === 'apartments')
  const saveC = useSaveClient()
  const saveR = useSaveRequest()
  const saveA = useSaveApartment()

  const rows =
    t === 'clients' ? clients.data?.results.map((c) => ({ id: c.id, title: c.name, sub: c.phone ?? '', at: c.updated_at, to: `/clients/${c.id}`,
      restore: () => saveC.mutate({ id: c.id, body: { is_archived: false } }) }))
    : t === 'requests' ? requests.data?.results.map((r) => ({ id: r.id, title: r.title, sub: r.client.name, at: r.updated_at, to: `/requests?open=${r.id}`,
      restore: () => saveR.mutate({ id: r.id, body: { is_archived: false } }) }))
    : apartments.data?.results.map((a) => ({ id: a.id, title: a.title, sub: a.client.name, at: a.updated_at, to: `/apartments/${a.id}`,
      restore: () => saveA.mutate({ id: a.id, body: { is_archived: false } }) }))

  const loading = (t === 'clients' && clients.isLoading) || (t === 'requests' && requests.isLoading) || (t === 'apartments' && apartments.isLoading)

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader title="الأرشيف" sub="كل شي مأرشف بيضل محفوظ، وبترجعه بكبسة" />
      <div className="flex gap-2 border-b border-line px-6 pb-3.5">
        <Chip on={t === 'clients'} onClick={() => setT('clients')}>العملاء</Chip>
        <Chip on={t === 'requests'} onClick={() => setT('requests')}>الطلبات</Chip>
        <Chip on={t === 'apartments'} onClick={() => setT('apartments')}>الشقق</Chip>
      </div>
      <div className="px-6 py-4">
        {loading ? <Spinner /> : !rows?.length ? <Empty title="الأرشيف فاضي" /> : (
          <Card>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <Link to={r.to} className="flex-1 text-ink no-underline hover:text-primary">
                  <span className="block">{r.title}</span>
                  <span className="text-[12.5px] text-faint">{r.sub}</span>
                </Link>
                <span className="num text-[12px] text-faint">{shortDate(r.at)}</span>
                <Button size="sm" onClick={r.restore}>استرجاع</Button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
