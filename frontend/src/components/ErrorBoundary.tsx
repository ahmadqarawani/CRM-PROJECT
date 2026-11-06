import { Component, type ReactNode } from 'react'

/** A crash in one page shows a message instead of blanking the whole app. Keyed by route, so navigating away resets it. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-6 card rounded-[14px] p-5 text-sm">
        <div className="font-medium text-danger">صار خطأ بعرض هالصفحة</div>
        <div className="mt-1 text-muted">جرّب تحدّث الصفحة. إذا تكرر، ابعت هالرسالة للدعم:</div>
        <pre dir="ltr" className="mt-2 overflow-auto rounded bg-bg p-2 text-[12px] text-faint">{this.state.error.message}</pre>
        <button onClick={() => location.reload()} className="mt-3 text-primary">تحديث الصفحة</button>
      </div>
    )
  }
}
