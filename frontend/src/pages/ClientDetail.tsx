import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useApartments, useClient, useDocuments, useRequests, useSaveClient, useTasks } from '../api/hooks'
import { DocumentList, RequestCard, Timeline } from '../components/bits'
import { ActivityDialog, ApartmentDialog, ClientDialog, RequestDialog, TaskDialog, UploadDialog } from '../components/forms'
import { Badge, Button, Card, Empty, Freshness, Spinner, cx } from '../components/ui'
import { ago, daysSince, when } from '../lib/format'

type Tab = 'activity' | 'requests' | 'apartments' | 'files'

export function ClientDetail() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'activity'
  const client = useClient(id)
  const requests = useRequests({ client: id, page_size: 100, ordering: '-is_overdue,next_follow_up_at' })
  const apartments = useApartments({ client: id, page_size: 100 })
  const docs = useDocuments({ client: id })
  const tasks = useTasks({ client: id, done: false })
  const save = useSaveClient()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<null | 'edit' | 'activity' | 'request' | 'apartment' | 'task' | 'upload'>(null)

  if (client.isLoading) return <Spinner />
  if (!client.data) return <div className="p-6"><Empty title="العميل مش موجود" /></div>
  const c = client.data
  const open = requests.data?.results.filter((r) => r.status === 'OPEN') ?? []
  const nextSteps = [
    ...open.filter((r) => r.next_follow_up_at || r.is_overdue).map((r) => ({
      key: `r${r.id}`, late: r.is_overdue, title: r.title, sub: r.next_follow_up_at ? when(r.next_follow_up_at) : 'بدها متابعة',
      to: `/requests?open=${r.id}`,
    })),
    ...(tasks.data?.results ?? []).map((t) => ({
      key: `t${t.id}`, late: new Date(t.due_at) < new Date(), title: t.title, sub: when(t.due_at), to: '/tasks',
    })),
  ].sort((a, b) => Number(b.late) - Number(a.late))

  const tabs: [Tab, string, number | undefined][] = [
    ['activity', 'النشاط', undefined],
    ['requests', 'الطلبات', requests.data?.count],
    ['apartments', 'الشقق', apartments.data?.count],
    ['files', 'الملفات', docs.data?.count],
  ]

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-5">
      <div className="mb-1 text-[12.5px] text-faint"><Link to="/clients" className="text-faint">العملاء</Link> / <span className="num">#{c.id}</span></div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 flex items-center gap-2 text-[22px] font-semibold text-navy">
            {c.name}
            {c.is_archived && <Badge>مؤرشف</Badge>}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
            {c.phone && <a href={`tel:${c.phone}`} className="num text-muted no-underline hover:text-primary">{c.phone}</a>}
            {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace('+', '')}`} target="_blank" rel="noreferrer" className="text-muted no-underline hover:text-primary">واتساب</a>}
            {c.email && <span dir="ltr">{c.email}</span>}
            {c.city && <span>{c.city}</span>}
            {c.source && <span>المصدر: {c.source}</span>}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
            آخر تواصل <Freshness days={daysSince(c.last_contact_at)} /> {ago(c.last_contact_at)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setDialog('activity')}>سجّل تواصل</Button>
          <Button onClick={() => setDialog('request')}>+ طلب</Button>
          <Button onClick={() => setDialog('apartment')}>+ شقة</Button>
          <Button onClick={() => setDialog('upload')}>رفع ملف</Button>
          <Button variant="ghost" onClick={() => setDialog('edit')}>تعديل</Button>
          <Button variant="ghost" onClick={async () => {
            if (!c.is_archived && !confirm('أرشفة العميل؟ طلباته المفتوحة رح تتأرشف معه.')) return
            await save.mutateAsync({ id: c.id, body: { is_archived: !c.is_archived } })
            if (!c.is_archived) navigate('/clients')
          }}>{c.is_archived ? 'استرجاع' : 'أرشفة'}</Button>
        </div>
      </div>
      {!!c.tags?.length && <div className="mt-2 flex gap-1.5">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
      {c.notes && <p className="mt-3 mb-0 max-w-3xl whitespace-pre-wrap rounded-md bg-surface p-3 text-[13px] text-muted ring-1 ring-line">{c.notes}</p>}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-4 flex gap-5 border-b border-line">
            {tabs.map(([k, label, n]) => (
              <button key={k} onClick={() => setParams({ tab: k }, { replace: true })}
                className={cx('-mb-px border-b-2 pb-2', tab === k ? 'border-navy font-medium text-navy' : 'border-transparent text-muted hover:text-ink')}>
                {label} {n !== undefined && <span className="num text-faint">{n}</span>}
              </button>
            ))}
          </div>
          {tab === 'activity' && <Timeline client={id} />}
          {tab === 'requests' && (requests.data?.results.length
            ? <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
                {requests.data.results.map((r) => <RequestCard key={r.id} r={r} showStage onClick={() => navigate(`/requests?open=${r.id}`)} />)}
              </div>
            : <Empty title="ما في طلبات" action={<Button variant="primary" onClick={() => setDialog('request')}>+ طلب</Button>} />)}
          {tab === 'apartments' && (apartments.data?.results.length
            ? <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
                {apartments.data.results.map((a) => (
                  <Link key={a.id} to={`/apartments/${a.id}`} className="rounded-card border border-line bg-surface p-3.5 text-ink no-underline hover:border-line-strong">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-[13px] text-muted">{[a.address, a.floor && `طابق ${a.floor}`].filter(Boolean).join(' · ') || '—'}</div>
                    <div className="mt-2 text-[12.5px] text-faint">{a.area_m2 && <><span className="num">{Number(a.area_m2)}</span> م²</>}{a.rooms ? <> · <span className="num">{a.rooms}</span> غرف</> : null}</div>
                  </Link>
                ))}
              </div>
            : <Empty title="ما في شقق" action={<Button variant="primary" onClick={() => setDialog('apartment')}>+ شقة</Button>} />)}
          {tab === 'files' && <DocumentList docs={docs.data?.results ?? []} />}
        </div>

        <aside>
          <h2 className="m-0 mb-2.5 text-[13px] font-medium text-muted">الخطوات الجاية</h2>
          <Card>
            {nextSteps.length === 0 && <div className="px-4 py-5 text-center text-[13px] text-faint">ما في خطوات مجدولة</div>}
            {nextSteps.map((s) => (
              <Link key={s.key} to={s.to} className={cx('block border-b border-line px-3.5 py-2.5 no-underline last:border-0',
                s.late ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-bg')}>
                <div className="font-medium">{s.title}</div>
                <div className={cx('text-[12.5px]', s.late ? 'text-accent-ink' : 'text-muted')}>{s.sub}</div>
              </Link>
            ))}
          </Card>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setDialog('task')}>+ مهمة لهالعميل</Button>
        </aside>
      </div>

      <ClientDialog open={dialog === 'edit'} onClose={() => setDialog(null)} client={c} />
      <ActivityDialog open={dialog === 'activity'} onClose={() => setDialog(null)} clientId={id} />
      <RequestDialog open={dialog === 'request'} onClose={() => setDialog(null)} clientId={id} />
      <ApartmentDialog open={dialog === 'apartment'} onClose={() => setDialog(null)} clientId={id} />
      <TaskDialog open={dialog === 'task'} onClose={() => setDialog(null)} clientId={id} />
      <UploadDialog open={dialog === 'upload'} onClose={() => setDialog(null)} clientId={id} />
    </div>
  )
}
