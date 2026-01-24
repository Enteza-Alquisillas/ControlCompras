'use client'

import { useState, useEffect, useCallback } from 'react'
import { authService } from '../services/authService'
import { User } from '../types'

interface UseAuthReturn {
    user: User | null
    isLoading: boolean
    error: string | null
    signIn: (email: string, password: string) => Promise<void>
    signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const checkUser = useCallback(async () => {
        setIsLoading(true)
        const { user: currentUser, error: getUserError } = await authService.getUser()

        if (getUserError) {
            setError(getUserError.message)
            setUser(null)
        } else {
            setUser(currentUser)
            setError(null)
        }

        setIsLoading(false)
    }, [])

    useEffect(() => {
        checkUser()
    }, [checkUser])

    const signIn = async (email: string, password: string) => {
        setIsLoading(true)
        setError(null)

        const { user: signedInUser, error: signInError } = await authService.signIn(email, password)

        if (signInError) {
            setError(signInError.message)
            setUser(null)
        } else {
            setUser(signedInUser)
            setError(null)
        }

        setIsLoading(false)
    }

    const signOut = async () => {
        setIsLoading(true)
        setError(null)

        const { error: signOutError } = await authService.signOut()

        if (signOutError) {
            setError(signOutError.message)
        } else {
            setUser(null)
            setError(null)
        }

        setIsLoading(false)
    }

    return {
        user,
        isLoading,
        error,
        signIn,
        signOut,
    }
}
