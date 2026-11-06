import { Link } from 'react-router'
import { useDuplicates, useMerge } from '../api/hooks'
import { Button, Card, Empty, PageHeader, Spinner } from '../components/ui'
import { phoneLabel, shortDate } from '../lib/format'

type Side = { id: number; name: string; phones: string[]; created_at: string }

/** Same-person suggestions (first + family name match). Merge keeps one card with everything. */
export function Duplicates() {
  const q = useDuplicates()
  const merge = useMerge()
  const pairs = (q.data ?? []) as unknown as { a: Side; b: Side; score: number }[]
  return (
    <div className="mx-auto max-w-[900px] pb-24" data-section="clients">
      <PageHeader title="مكررات محتملة" sub="نفس الاسم (أو قريب جداً) بأرقام مختلفة. الدمج بيجمع كل الأرقام والطلبات والسجل بكرت واحد" />
      <div className="px-4 md:px-6">
        {q.isLoading ? <Spinner /> : pairs.length === 0 ? <Empty title="ما في مكررات" hint="الرقم نفسه ما بيتكرر أبداً — النظام بيمنعه" /> : (
          <div className="flex flex-col gap-3">
            {pairs.map(({ a, b, score }) => (
              <Card key={`${a.id}-${b.id}`} className="p-3.5">
                <div className="mb-2 text-[12px] text-faint">تشابه <span className="num">{Math.round(score * 100)}%</span></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[[a, b], [b, a]].map(([keep, other]) => (
                    <div key={keep.id} className="rounded-md border border-line p-3">
                      <Link to={`/contacts/${keep.id}`} className="font-medium">{keep.name}</Link>
                      <div className="num text-[13px] text-muted">{keep.phones.map(phoneLabel).join(' · ') || 'بلا رقم'}</div>
                      <div className="text-[12px] text-faint">أُضيف <span className="num">{shortDate(keep.created_at)}</span></div>
                      <Button size="sm" className="mt-2" disabled={merge.isPending}
                        onClick={() => confirm(`دمج «${other.name}» داخل هالكرت؟`) && merge.mutate({ primary: keep.id, other: other.id })}>
                        اعتمد هالكرت وادمج التاني فيه
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
