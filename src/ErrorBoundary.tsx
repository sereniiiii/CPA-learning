import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: string
}

/**
 * 全局错误边界。
 *
 * 没有它，任意一个渲染期异常都会让整页白屏 —— 用户只看到空白，
 * 不知道发生了什么，连报错都拿不到。
 * 加了它至少能看到错误信息 + 明确的恢复入口。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? '' })
    console.error('渲染异常:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h1>页面出错了</h1>
          <p className="crash-msg">{this.state.error.message}</p>
          <pre className="crash-stack">{this.state.info.slice(0, 900)}</pre>
          <div className="crash-actions">
            <button
              className="login-btn"
              onClick={() => {
                this.setState({ error: null, info: '' })
              }}
            >
              重试
            </button>
            <button
              className="login-btn is-ghost"
              onClick={() => {
                // 清掉可能损坏的本地缓存后重载
                try {
                  localStorage.removeItem('cpa-learning-state')
                  localStorage.removeItem('cpa-user-data')
                } catch {
                  /* 忽略 */
                }
                location.reload()
              }}
            >
              清缓存并刷新
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 14 }}>
            学习数据存在云端，清缓存不会丢。
          </p>
        </div>
      </div>
    )
  }
}
