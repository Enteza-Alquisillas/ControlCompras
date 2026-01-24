// Tipos para autenticación
export interface User {
    id: string
    email: string
    created_at: string
}

export interface Session {
    access_token: string
    refresh_token: string
    expires_in: number
    user: User
}

export interface AuthError {
    message: string
    status?: number
}
