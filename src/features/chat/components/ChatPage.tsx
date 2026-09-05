'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useMemo, useState } from 'react'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { ChatSourceToggle } from './ChatSourceToggle'
import type { ChatSource } from '../types'
import { DEFAULT_CHAT_SOURCE } from '../types'

const SUGGESTIONS: Record<ChatSource, string[]> = {
  machu: [
    'Que roturas de stock hay esta semana?',
    'Hay 200 sillas disponibles para el 15 de marzo?',
    'Que eventos hay manana?',
    'Que material necesito comprar para febrero?',
  ],
  odoo: [
    'Que pedidos de alquiler hay para manana?',
    'Busca el cliente Delfin Delicatessen',
    'Que articulos lleva el pedido S00048?',
    'Que clientes tienen pedidos pendientes de entrega esta semana?',
  ],
}

const SOURCE_LABELS: Record<ChatSource, string> = {
  machu: 'Machu (datos historicos, sistema antiguo)',
  odoo: 'Odoo 19 (sistema actual)',
}

export function ChatPage() {
  const [source, setSource] = useState<ChatSource>(DEFAULT_CHAT_SOURCE)
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])

  const { messages, sendMessage, status, setMessages } = useChat({ transport })

  const isLoading = status === 'streaming' || status === 'submitted'

  const handleSend = (text: string) => {
    sendMessage({ text }, { body: { source } })
  }

  const handleSourceChange = (nextSource: ChatSource) => {
    if (nextSource === source) return
    setSource(nextSource)
    setMessages([])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 rounded-t-lg space-y-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Asistente IA</h1>
          <p className="text-sm text-gray-500">
            Consulta disponibilidad, eventos, entregas y mas en lenguaje natural
          </p>
        </div>
        <ChatSourceToggle source={source} onChange={handleSourceChange} disabled={isLoading} />
        <p className="text-xs text-gray-400">{SOURCE_LABELS[source]}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        <ChatMessageList messages={messages} isLoading={isLoading} />

        {/* Suggestions */}
        {messages.length === 0 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS[source].map((suggestion) => (
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
