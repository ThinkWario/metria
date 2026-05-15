"use client"

import { Component, ReactNode } from 'react'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback ?? (
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-muted-foreground">
                    <p className="text-sm">Algo salió mal al cargar esta sección.</p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="text-xs underline hover:text-foreground transition-colors"
                    >
                        Reintentar
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
