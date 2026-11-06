import { useState } from 'react'
import { Link } from 'react-router'
import { useApartments } from '../api/hooks'
import { ApartmentDialog } from '../components/forms'
import { Button, Empty, Input, PageHeader, Spinner } from '../components/ui'

export function Apartments() {
  const [search, setSearch] = useState('')
  const apts = useApartments({ search: search || undefined, page_size: 60 })
  const [adding, setAdding] = useState(false)
  return (
    <div>
      <PageHeader title="الشقق" sub={apts.data && <><span className="num">{apts.data.count}</span> شقة</>}
        actions={<Button variant="primary" onClick={() => setAdding(true)}>+ شقة جديدة</Button>} />
      <div className="border-b border-line px-6 pb-3.5">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الشقة أو العنوان…" className="w-72" />
      </div>
      <div className="px-6 py-4">
        {apts.isLoading ? <Spinner /> : apts.data?.results.length === 0 ? (
          <Empty title="ما في شقق" hint="كل شقة إلها أرشيف ملفات (عقود، مخططات، عروض أسعار)" />
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-start">
              <thead>
                <tr className="border-b border-line bg-bg text-[12.5px] text-muted">
                  <th className="px-4 py-2 text-start font-medium">الشقة</th>
                  <th className="px-4 py-2 text-start font-medium">العميل</th>
                  <th className="px-4 py-2 text-start font-medium">العنوان</th>
                  <th className="px-4 py-2 text-start font-medium">المساحة</th>
                  <th className="px-4 py-2 text-start font-medium">الغرف</th>
                </tr>
              </thead>
              <tbody>
                {apts.data?.results.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0 hover:bg-bg">
                    <td className="px-4 py-2.5"><Link to={`/apartments/${a.id}`} className="font-medium text-ink no-underline hover:text-primary">{a.title}</Link></td>
                    <td className="px-4 py-2.5"><Link to={`/clients/${a.client.id}`} className="text-muted no-underline hover:text-primary">{a.client.name}</Link></td>
                    <td className="px-4 py-2.5 text-muted">{a.address || '—'}</td>
                    <td className="px-4 py-2.5">{a.area_m2 ? <><span className="num">{Number(a.area_m2)}</span> م²</> : '—'}</td>
                    <td className="px-4 py-2.5"><span className="num">{a.rooms ?? '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ApartmentDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
