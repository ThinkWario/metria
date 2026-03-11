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
    let num = Number(amount)
    if (isNaN(num)) num = 0
    if (num === -0) num = 0 // prevent -$0
    if (Math.abs(num) < 0.01) num = 0 // round effectively zero values to absolute 0

    // Remove cents for large numbers to reduce visual noise
    const hideDecimals = Math.abs(num) >= 1000
    const formattedNum = formatNumber(Math.abs(num), hideDecimals ? 0 : 2, true)

    if (num < 0) {
        return `-${symbol}${formattedNum}`
    }
    return `${symbol}${formattedNum}`
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
