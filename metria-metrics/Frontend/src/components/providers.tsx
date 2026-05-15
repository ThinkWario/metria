"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                retry: 1,
                gcTime: 5 * 60_000,
            }
        }
    }))

    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '316551700315-qno3ktv53mkhe0rtm83gbhrn42eisrfm.apps.googleusercontent.com'

    return (
        <GoogleOAuthProvider clientId={googleClientId}>
            <QueryClientProvider client={queryClient}>
                {children}
                <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
        </GoogleOAuthProvider>
    )
}
