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

  const providerApiKey = provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY

  return {
    provider,
    apiKey: process.env.LLM_API_KEY || providerApiKey,
    model: process.env.LLM_MODEL || (provider === 'groq' ? 'qwen/qwen3.6-27b' : 'openai/gpt-4o-mini'),
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

  const requestBody = {
    model: config.model,
    messages,
    temperature: 0,
    response_format: { type: 'json_object' },
  }

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const body = await response.text()
    if (response.status === 400 && body.includes('json_validate_failed')) {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...requestBody, response_format: undefined }),
      })
      if (response.ok) return parseChatCompletionJson(response)
    }
    throw new Error(`LLM request failed (${response.status}): ${body}`)
  }

  return parseChatCompletionJson(response)
}

async function parseChatCompletionJson(response: Response) {
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM response did not contain message content')
  }

  return parseJsonObject(content)
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content) as unknown
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]
    if (fenced) return JSON.parse(fenced) as unknown

    const object = bestJsonObject(content)
    if (object) return object

    throw new Error('LLM response was not valid JSON')
  }
}

function bestJsonObject(content: string) {
  const objects = jsonObjects(content)
    .map((object) => {
      try {
        return JSON.parse(object) as unknown
      } catch {
        return null
      }
    })
    .filter((object): object is Record<string, unknown> => Boolean(object) && typeof object === 'object' && !Array.isArray(object))

  return objects.sort((a, b) => scoreResponseObject(b) - scoreResponseObject(a))[0] ?? null
}

function scoreResponseObject(value: Record<string, unknown>) {
  let score = 0
  if (typeof value.sourceId === 'string' && Array.isArray(value.claims)) score += 100
  if (typeof value.ruleId === 'string') score += 40
  if (Array.isArray(value.conditions)) score += 25
  if (Array.isArray(value.conclusions)) score += 25
  if (typeof value.reviewStatus === 'string') score += 10
  if (typeof value.answer === 'string' && Array.isArray(value.usedSources)) score += 100
  return score
}

function jsonObjects(content: string) {
  const objects: string[] = []
  const start = content.indexOf('{')
  if (start === -1) return objects

  let depth = 0
  let inString = false
  let escaped = false
  let objectStart = -1

  for (let index = start; index < content.length; index += 1) {
    const char = content[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') {
      if (depth === 0) objectStart = index
      depth += 1
    }
    if (char === '}') depth -= 1

    if (depth === 0 && objectStart !== -1) {
      objects.push(content.slice(objectStart, index + 1))
      objectStart = -1
    }
  }

  return objects
}
