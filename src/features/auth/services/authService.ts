import { createClient } from '@/lib/supabase/client'
import { User, Session, AuthError } from '../types'

export const authService = {
    /**
     * Sign in with email and password
     */
    async signIn(email: string, password: string): Promise<{ user: User | null; session: Session | null; error: AuthError | null }> {
        const supabase = createClient()

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            return {
                user: null,
                session: null,
                error: { message: error.message, status: error.status },
            }
        }

        return {
            user: data.user as unknown as User,
            session: data.session as unknown as Session,
            error: null,
        }
    },

    /**
     * Sign up with email and password
     */
    async signUp(email: string, password: string): Promise<{ user: User | null; session: Session | null; error: AuthError | null }> {
        const supabase = createClient()

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        })

        if (error) {
            return {
                user: null,
                session: null,
                error: { message: error.message, status: error.status },
            }
        }

        return {
            user: data.user as unknown as User,
            session: data.session as unknown as Session,
            error: null,
        }
    },

    /**
     * Sign out
     */
    async signOut(): Promise<{ error: AuthError | null }> {
        const supabase = createClient()

        const { error } = await supabase.auth.signOut()

        if (error) {
            return { error: { message: error.message, status: error.status } }
        }

        return { error: null }
    },

    /**
     * Get current session
     */
    async getSession(): Promise<{ session: Session | null; error: AuthError | null }> {
        const supabase = createClient()

        const { data, error } = await supabase.auth.getSession()

        if (error) {
            return {
                session: null,
                error: { message: error.message, status: error.status },
            }
        }

        return {
            session: data.session as unknown as Session,
            error: null,
        }
    },

    /**
     * Get current user
     */
    async getUser(): Promise<{ user: User | null; error: AuthError | null }> {
        const supabase = createClient()

        const { data, error } = await supabase.auth.getUser()

        if (error) {
            return {
                user: null,
                error: { message: error.message, status: error.status },
            }
        }

        return {
            user: data.user as unknown as User,
            error: null,
        }
    },
}
