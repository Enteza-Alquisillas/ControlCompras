export type SeatEstimate = { seats: number; source: 'plaza' | 'silla' } | null

export function estimateSeats(
    items: Array<{ quantity: number; article: { description: string } | null }>
): SeatEstimate {
    // Priority 1: explicit "PRECIO POR PLAZA" article — quantity is the exact seat count
    const plazaItem = items.find(item =>
        item.article?.description?.toUpperCase() === 'PRECIO POR PLAZA'
    )
    if (plazaItem) return { seats: plazaItem.quantity, source: 'plaza' }

    // Priority 2: chair articles — sum of quantities approximates seat count
    const sillaItems = items.filter(item =>
        item.article?.description?.toLowerCase().includes('silla')
    )
    if (sillaItems.length > 0) {
        return { seats: sillaItems.reduce((sum, item) => sum + item.quantity, 0), source: 'silla' }
    }

    return null
}
