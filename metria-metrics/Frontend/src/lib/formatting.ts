// Shared formatting helpers — single source of truth for display utilities

export function getCurrencySymbol(currency?: string): string {
    const c = currency?.toLowerCase()
    if (c === 'eur') return '€'
    if (c === 'gbp') return '£'
    if (c === 'clp') return '$'
    return '$'
}

export function formatNumber(value: number | string, decimals = 2, hideZeroDecimals = true): string {
    const num = Number(value)
    if (isNaN(num)) return "0"
    
    return num.toLocaleString('es-ES', {
        minimumFractionDigits: (hideZeroDecimals && num % 1 === 0) ? 0 : decimals,
        maximumFractionDigits: decimals,
        useGrouping: true
    })
}

export function formatCurrency(amount: number | string, currency?: string): string {
    const symbol = getCurrencySymbol(currency)
    return `${symbol}${formatNumber(amount)}`
}

export function formatPercent(value: number | string, decimals = 1): string {
    return `${formatNumber(value, decimals)}%`
}

/** Decode JWT payload WITHOUT validating the signature — read-only for display purposes */
export function decodeJwtPayload(token: string): Record<string, any> | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const payload = JSON.parse(atob(parts[1]))
        return payload
    } catch {
        return null
    }
}
