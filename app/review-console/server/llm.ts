type ChatMessage = {
  role: 'system' | 'user'
  content: string
}

type LlmConfig = {
  provider: 'groq' | 'openrouter'
  apiKey?: string
  model: string
}

export function getLlmConfig(): LlmConfig {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase()
  if (provider !== 'groq' && provider !== 'openrouter') {
    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
  }

  return {
    provider,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'openai/gpt-4o-mini'),
  }
}

export function publicLlmStatus() {
  const config = getLlmConfig()
  return {
    provider: config.provider,
    model: config.model,
    configured: Boolean(config.apiKey),
  }
}

export async function completeJson(prompt: string) {
  const config = getLlmConfig()
  if (!config.apiKey) {
    throw new Error('LLM_API_KEY is not configured. Set it in app/review-console/.env')
  }

  const url = config.provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions'

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }

  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:5173'
    headers['X-Title'] = 'Traceability Agent Review Console'
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a constrained extraction assistant. Return only valid JSON. Do not use markdown fences.',
    },
    { role: 'user', content: prompt },
  ]

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`LLM request failed (${response.status}): ${body}`)
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM response did not contain message content')
  }

  return JSON.parse(content) as unknown
}
