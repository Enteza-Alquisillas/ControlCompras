import { ImportWizard, ConnectionTest } from '@/features/import'

export default function ImportPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold text-gray-900">Sincronización Legacy</h1>
                <p className="text-sm text-gray-500">
                    Importa datos desde el sistema SQL Server on-premise a la nube de Supabase.
                </p>
            </div>

            <ConnectionTest />

            <ImportWizard />
        </div>
    )
}
