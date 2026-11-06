import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useApartment, useDocuments, useRequests, useSaveApartment } from '../api/hooks'
import { DocumentList, RequestCard } from '../components/bits'
import { ApartmentDialog, RequestDialog, UploadDialog } from '../components/forms'
import { Badge, Button, Chip, Empty, Spinner } from '../components/ui'
import { CATEGORY_LABEL } from '../lib/format'

export function ApartmentDetail() {
  const id = Number(useParams().id)
  const apt = useApartment(id)
  const docs = useDocuments({ apartment: id })
  const requests = useRequests({ apartment: id, page_size: 50 })
  const save = useSaveApartment()
  const navigate = useNavigate()
  const [category, setCategory] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'edit' | 'upload' | 'request'>(null)

  if (apt.isLoading) return <Spinner />
  if (!apt.data) return <div className="p-6"><Empty title="الشقة مش موجودة" /></div>
  const a = apt.data
  const all = docs.data?.results ?? []
  const shown = category ? all.filter((d) => d.category === category) : all
  const counts = all.reduce<Record<string, number>>((m, d) => ({ ...m, [d.category ?? 'OTHER']: (m[d.category ?? 'OTHER'] ?? 0) + 1 }), {})

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-5">
      <div className="mb-1 text-[12.5px] text-faint">
        <Link to="/apartments" className="text-faint">الشقق</Link> / <Link to={`/clients/${a.client.id}`} className="text-faint">{a.client.name}</Link>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="m-0 flex items-center gap-2 text-[22px] font-semibold text-navy">{a.title}{a.is_archived && <Badge>مؤرشفة</Badge>}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 text-muted">
            {a.address && <span>{a.address}</span>}
            {a.floor && <span>طابق {a.floor}</span>}
            {a.area_m2 && <span><span className="num">{Number(a.area_m2)}</span> م²</span>}
            {a.rooms ? <span><span className="num">{a.rooms}</span> غرف</span> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setDialog('upload')}>رفع ملفات</Button>
          <Button onClick={() => setDialog('request')}>+ طلب لهالشقة</Button>
          <Button variant="ghost" onClick={() => setDialog('edit')}>تعديل</Button>
          <Button variant="ghost" onClick={async () => {
            await save.mutateAsync({ id: a.id, body: { is_archived: !a.is_archived } })
            if (!a.is_archived) navigate('/apartments')
          }}>{a.is_archived ? 'استرجاع' : 'أرشفة'}</Button>
        </div>
      </div>
      {a.notes && <p className="mt-3 mb-0 max-w-3xl whitespace-pre-wrap text-[13px] text-muted">{a.notes}</p>}

      <h2 className="mt-6 mb-2.5 text-[15px] font-semibold text-navy">أرشيف الملفات</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip on={!category} onClick={() => setCategory(null)}>الكل <span className="num">{all.length}</span></Chip>
        {Object.entries(CATEGORY_LABEL).filter(([k]) => counts[k]).map(([k, v]) => (
          <Chip key={k} on={category === k} onClick={() => setCategory(k)}>{v} <span className="num">{counts[k]}</span></Chip>
        ))}
      </div>
      <DocumentList docs={shown} />

      <h2 className="mt-7 mb-2.5 text-[15px] font-semibold text-navy">الطلبات على هالشقة</h2>
      {requests.data?.results.length
        ? <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
            {requests.data.results.map((r) => <RequestCard key={r.id} r={r} showStage onClick={() => navigate(`/requests?open=${r.id}`)} />)}
          </div>
        : <Empty title="ما في طلبات على هالشقة" />}

      <ApartmentDialog open={dialog === 'edit'} onClose={() => setDialog(null)} apartment={a} />
      <UploadDialog open={dialog === 'upload'} onClose={() => setDialog(null)} apartmentId={a.id} />
      <RequestDialog open={dialog === 'request'} onClose={() => setDialog(null)} clientId={a.client.id} apartmentId={a.id} />
    </div>
  )
}
