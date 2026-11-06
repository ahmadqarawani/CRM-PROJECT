import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { ApiError, setUnauthorizedHandler } from './api/client'
import { K, useMe } from './api/hooks'
import { Shell } from './components/Shell'
import { Empty, Spinner } from './components/ui'
import { useAccess } from './lib/access'
import { Archive } from './pages/Archive'
import { Board } from './pages/Board'
import { ContactDetail } from './pages/ContactDetail'
import { Contacts } from './pages/Contacts'
import { Duplicates } from './pages/Duplicates'
import { Login } from './pages/Login'
import { Properties } from './pages/Properties'
import { PropertyDetail } from './pages/PropertyDetail'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'

export default function App() {
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.setQueryData(K.me, undefined)
      qc.invalidateQueries({ queryKey: K.me })
      navigate('/login')
    })
  }, [qc, navigate])

  if (me.isLoading) return <Spinner />
  const loggedIn = !!me.data
  const unauth = me.error instanceof ApiError && me.error.status === 401

  return (
    <Routes>
      <Route path="/login" element={loggedIn ? <Navigate to="/" replace /> : <Login />} />
      {loggedIn ? (
        <Route element={<Shell me={me.data!} />}>
          <Route index element={<Today />} />
          <Route path="finishing" element={<Need perm="deals.view"><Board pipeline="FINISHING" /></Need>} />
          <Route path="real-estate" element={<Need perm="deals.view"><Board pipeline="BROKERAGE" /></Need>} />
          <Route path="contacts" element={<Need perm="contacts.view"><Contacts /></Need>} />
          <Route path="contacts/duplicates" element={<Need perm="contacts.merge"><Duplicates /></Need>} />
          <Route path="contacts/:id" element={<Need perm="contacts.view"><ContactDetail /></Need>} />
          <Route path="properties" element={<Need perm="properties.view"><Properties /></Need>} />
          <Route path="properties/:id" element={<Need perm="properties.view"><PropertyDetail /></Need>} />
          <Route path="archive" element={<Archive />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={unauth || me.isError ? <Navigate to="/login" replace /> : <Spinner />} />
      )}
    </Routes>
  )
}

/** A page the role can't open: say so instead of showing an empty list. */
function Need({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useAccess()
  if (can(perm)) return <>{children}</>
  return <div className="p-6"><Empty title="ما عندك صلاحية تفتح هالصفحة" hint="إذا لازمتك، اطلبها من مدير النظام (الإعدادات ← الأدوار والصلاحيات)" /></div>
}
