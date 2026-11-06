import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { ApiError, setUnauthorizedHandler } from './api/client'
import { K, useMe } from './api/hooks'
import { Shell } from './components/Shell'
import { Spinner } from './components/ui'
import { ApartmentDetail } from './pages/ApartmentDetail'
import { Apartments } from './pages/Apartments'
import { Archive } from './pages/Archive'
import { Board } from './pages/Board'
import { ClientDetail } from './pages/ClientDetail'
import { Clients } from './pages/Clients'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { Tasks } from './pages/Tasks'
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
          <Route path="requests" element={<Board />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="apartments" element={<Apartments />} />
          <Route path="apartments/:id" element={<ApartmentDetail />} />
          <Route path="tasks" element={<Tasks />} />
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
