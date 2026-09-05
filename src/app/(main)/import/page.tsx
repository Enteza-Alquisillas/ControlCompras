import { ImportWizard, ConnectionTest } from '@/features/import'

// Un import historico amplio (miles de eventos con sus lineas) puede tardar
// mas que el timeout por defecto de una Server Action.
export const maxDuration = 300

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
