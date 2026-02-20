'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useMemo } from 'react'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'

const SUGGESTIONS = [
  'Que roturas de stock hay esta semana?',
  'Hay 200 sillas disponibles para el 15 de marzo?',
  'Que eventos hay manana?',
  'Que material necesito comprar para febrero?',
]

export function ChatPage() {
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])

  const { messages, sendMessage, status } = useChat({ transport })

  const isLoading = status === 'streaming' || status === 'submitted'

  const handleSend = (text: string) => {
    sendMessage({ text })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 rounded-t-lg">
        <h1 className="text-lg font-semibold text-gray-900">Asistente IA</h1>
        <p className="text-sm text-gray-500">
          Consulta disponibilidad, eventos, entregas y mas en lenguaje natural
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        <ChatMessageList messages={messages} isLoading={isLoading} />

        {/* Suggestions */}
        {messages.length === 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSend(suggestion)}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  )
}
