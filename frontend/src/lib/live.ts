import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { K } from '../api/hooks'

/** SSE events are signals; data always comes back through the REST API. */
const INVALIDATE: Record<string, (readonly unknown[])[]> = {
  'notification.created': [K.notifications, K.dashboard],
  'request.changed': [K.deals, K.contacts, K.dashboard, K.timeline, K.properties],
  'client.changed': [K.contacts, K.properties, K.duplicates],
  'activity.created': [K.timeline, K.activities, K.deals, K.contacts, K.dashboard],
  'document.created': [K.documents, K.timeline],
  'task.changed': [K.activities, K.dashboard, K.deals, K.timeline],
}

export function useLiveEvents(onNotification?: () => void) {
  const qc = useQueryClient()
  useEffect(() => {
    const es = new EventSource('/api/v1/events/')
    let opened = false
    const resync = () => qc.invalidateQueries()
    es.onopen = () => {
      if (opened) resync()
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
