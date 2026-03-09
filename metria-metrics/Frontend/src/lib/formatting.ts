// Shared formatting helpers — single source of truth for display utilities

export function getCurrencySymbol(currency?: string): string {
    const c = currency?.toLowerCase()
    if (c === 'eur') return '€'
    if (c === 'gbp') return '£'
    if (c === 'clp') return '$'
    return '$'
}

export function formatCurrency(amount: number | string, currency?: string): string {
    const symbol = getCurrencySymbol(currency)
    return `${symbol}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(value: number | string, decimals = 1): string {
    return `${Number(value).toFixed(decimals)}%`
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
