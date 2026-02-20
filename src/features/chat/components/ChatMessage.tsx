'use client'

import { type UIMessage } from 'ai'

interface ChatMessageProps {
  message: UIMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.parts?.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={i} className="whitespace-pre-wrap prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-table:my-2">
                <FormattedText text={part.text} isUser={isUser} />
              </div>
            )
          }
          if (part.type.startsWith('tool-')) {
            const toolName = 'toolName' in part ? String(part.toolName) : ''
            const isComplete = part.type === 'tool-result' || ('state' in part && part.state === 'output-available')
            return (
              <div key={i} className="my-1.5 text-xs text-gray-500 italic flex items-center gap-1.5">
                <svg className={`w-3.5 h-3.5 ${isComplete ? 'text-green-500' : 'text-blue-500 animate-spin'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isComplete ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  ) : (
                    <>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </>
                  )}
                </svg>
                {getToolLabel(toolName)}
              </div>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchArticles: 'Buscando articulos...',
    searchCustomers: 'Buscando clientes...',
    checkAvailability: 'Consultando disponibilidad...',
    getStockBreakages: 'Consultando roturas de stock...',
    getArticleReservations: 'Consultando reservas...',
    getRentalsByDate: 'Consultando eventos...',
    getDeliveriesByDate: 'Consultando entregas...',
    getPickupsByDate: 'Consultando recogidas...',
    getDemandForecast: 'Analizando demanda...',
    getPurchaseNeeds: 'Calculando necesidades de compra...',
  }
  return labels[toolName] ?? `Ejecutando ${toolName}...`
}

function FormattedText({ text, isUser }: { text: string; isUser: boolean }) {
  if (!text) return null

  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let tableLines: string[] = []
  let inTable = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isTableLine = line.trim().startsWith('|') && line.trim().endsWith('|')

    if (isTableLine) {
      if (!inTable) inTable = true
      tableLines.push(line)
    } else {
      if (inTable) {
        elements.push(<MarkdownTable key={`table-${i}`} lines={tableLines} />)
        tableLines = []
        inTable = false
      }
      if (line.trim()) {
        elements.push(
          <p key={i} className={`my-0.5 ${isUser ? 'text-white' : ''}`}>
            {formatInlineMarkdown(line)}
          </p>
        )
      } else {
        elements.push(<br key={i} />)
      }
    }
  }

  if (inTable && tableLines.length > 0) {
    elements.push(<MarkdownTable key="table-end" lines={tableLines} />)
  }

  return <>{elements}</>
}

function formatInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function MarkdownTable({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null

  const parseRow = (line: string) =>
    line.split('|').slice(1, -1).map(cell => cell.trim())

  const headers = parseRow(lines[0])
  const isSeparator = (line: string) => /^\|[\s\-:|]+\|$/.test(line.trim())
  const dataLines = lines.slice(isSeparator(lines[1]) ? 2 : 1)

  return (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="border border-gray-300 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataLines.map((line, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {parseRow(line).map((cell, j) => (
                <td key={j} className="border border-gray-300 px-2 py-1 text-gray-600">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
