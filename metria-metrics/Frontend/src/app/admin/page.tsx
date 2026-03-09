export default function AdminOverviewPage() {
    return (
        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">SaaS Overview</h1>
                <p className="text-muted-foreground mt-1 text-sm">Visión global de todos los clientes y operaciones del sistema.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl border border-destructive/20 bg-card/60 backdrop-blur-md shadow-lg shadow-destructive/5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-destructive/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <h3 className="text-sm font-medium text-destructive mb-2 uppercase tracking-wider">Métricas en construcción</h3>
                    <p className="text-muted-foreground text-sm">
                        Dirijase a la pestaña de Workspaces para gestionar sus clientes.
                    </p>
                </div>
            </div>
        </div>
    )
}
