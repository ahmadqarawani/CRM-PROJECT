import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { ApiError, setUnauthorizedHandler } from './api/client'
import { K, useMe } from './api/hooks'
import { Shell } from './components/Shell'
import { Spinner } from './components/ui'
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
          <Route path="finishing" element={<Board pipeline="FINISHING" />} />
          <Route path="real-estate" element={<Board pipeline="BROKERAGE" />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/duplicates" element={<Duplicates />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="properties" element={<Properties />} />
          <Route path="properties/:id" element={<PropertyDetail />} />
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
