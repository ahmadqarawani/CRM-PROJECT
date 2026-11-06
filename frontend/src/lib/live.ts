import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { K } from '../api/hooks'

/** SSE events are signals (type + ids); data always comes back through the REST API. */
const INVALIDATE: Record<string, (readonly unknown[])[]> = {
  'notification.created': [K.notifications, K.dashboard],
  'request.changed': [K.requests, K.clients, K.dashboard, K.timeline],
  'client.changed': [K.clients, K.apartments],
  'activity.created': [K.timeline, K.requests, K.clients, K.dashboard],
  'document.created': [K.documents, K.timeline],
  'task.changed': [K.tasks, K.dashboard],
}

export function useLiveEvents(onNotification?: () => void) {
  const qc = useQueryClient()
  useEffect(() => {
    const es = new EventSource('/api/v1/events/')
    let opened = false
    const resync = () => qc.invalidateQueries()
    es.onopen = () => {
      if (opened) resync() // reconnected: we may have missed events
      opened = true
    }
    es.addEventListener('resync', resync)
    for (const [name, keys] of Object.entries(INVALIDATE)) {
      es.addEventListener(name, () => {
        keys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
        if (name === 'notification.created') onNotification?.()
      })
    }
    return () => es.close()
  }, [qc, onNotification])
}
