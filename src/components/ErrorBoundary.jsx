import { Component } from 'react'

// Catches a crash anywhere below it and shows a recoverable message
// instead of leaving the screen blank. Without this, any unhandled
// error in a child component unmounts the whole React tree and the
// person sees nothing — no message, nothing to tap, just white.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Caught by ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-4">
          <p className="text-lg font-bold">Something went wrong.</p>
          <p className="text-dim max-w-xs">
            The screen hit an error and couldn't continue. Reloading usually
            fixes it — nothing you entered before this should be lost.
          </p>
          <button onClick={() => window.location.reload()}
            className="h-14 px-6 rounded-2xl bg-amber text-bg font-bold">
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
