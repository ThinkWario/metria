"use client"

import { useUserStore } from "@/store/useUserStore"
import { useEffect } from "react"

export function WorkspaceAvatar() {
    const { user, fetchMe, hasFetched } = useUserStore()

    useEffect(() => {
        if (!hasFetched) fetchMe()
    }, [hasFetched, fetchMe])

    const logoUrl = user?.workspace?.logoUrl
    const workspaceName = user?.workspace?.name || "Workspace"
    const initials = workspaceName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()

    if (logoUrl) {
        return (
            <div className="w-8 h-8 rounded-full overflow-hidden border border-border/50 flex items-center justify-center bg-background/50">
                <img
                    src={logoUrl}
                    alt={workspaceName}
                    className="max-w-full max-h-full object-contain"
                />
            </div>
        )
    }

    return (
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium text-sm">
            {initials}
        </div>
    )
}
