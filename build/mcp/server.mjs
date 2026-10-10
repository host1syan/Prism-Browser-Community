#!/usr/bin/env node
/**
 * Yk 指纹浏览器 MCP server (stdio).
 *
 * A local AI client spawns this script through the Electron binary in Node mode
 * (`ELECTRON_RUN_AS_NODE=1`), so the app does not ship a second executable. The
 * script only speaks MCP on stdio and forwards every tool call to the running
 * Yk 指纹浏览器 process over its loopback HTTP API, which owns profile permissions and
 * the audit log. Nothing is written to stdout except JSON-RPC frames.
 */
import { createInterface } from 'node:readline'

const PROTOCOL_VERSION = '2025-06-18'
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18'])
const SERVER_INFO = { name: 'prism-browser', version: '1.0.0' }
const REQUEST_TIMEOUT_MS = 120_000

const endpoint = (process.env.PRISM_MCP_ENDPOINT ?? '').replace(/\/$/, '')
const token = process.env.PRISM_MCP_TOKEN ?? ''

const PROFILE_ID = { type: 'string', description: '浏览器环境 ID，取自 prism_profiles_list' }
const TOOLS = [
  {
    name: 'prism_profiles_list',
    description: '列出已授权给本地 AI 控制的浏览器环境。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    method: 'mcp.profiles.list'
  },
  {
    name: 'prism_profile_status',
    description: '读取单个环境的运行状态。',
    inputSchema: { type: 'object', properties: { profileId: PROFILE_ID }, required: ['profileId'], additionalProperties: false },
    method: 'mcp.profiles.status'
  },
  {
    name: 'prism_profile_launch',
    description: '启动一个浏览器环境。',
    inputSchema: { type: 'object', properties: { profileId: PROFILE_ID }, required: ['profileId'], additionalProperties: false },
    method: 'mcp.profiles.launch'
  },
  {
    name: 'prism_profile_close',
    description: '关闭一个浏览器环境。',
    inputSchema: { type: 'object', properties: { profileId: PROFILE_ID }, required: ['profileId'], additionalProperties: false },
    method: 'mcp.profiles.close'
  },
  {
    name: 'prism_page_open',
    description: '在指定环境中打开一个 HTTP 或 HTTPS 网页。',
    inputSchema: {
      type: 'object',
      properties: { profileId: PROFILE_ID, url: { type: 'string', description: '要打开的网页地址' } },
      required: ['profileId', 'url'],
      additionalProperties: false
    },
    method: 'mcp.pages.open'
  },
  {
    name: 'prism_page_read',
    description: '读取当前页面，返回可交互元素及其 ref 引用。',
    inputSchema: { type: 'object', properties: { profileId: PROFILE_ID }, required: ['profileId'], additionalProperties: false },
    method: 'mcp.pages.read'
  },
  {
    name: 'prism_page_click',
    description: '点击当前页面中由 prism_page_read 返回的 ref 元素。',
    inputSchema: {
      type: 'object',
      properties: { profileId: PROFILE_ID, ref: { type: 'string', description: '形如 p1-e3 的元素引用' } },
      required: ['profileId', 'ref'],
      additionalProperties: false
    },
    method: 'mcp.pages.click'
  },
  {
    name: 'prism_page_type',
    description: '在输入框中填写文本，默认先清空原有内容。',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: PROFILE_ID,
        ref: { type: 'string', description: '形如 p1-e3 的可编辑元素引用' },
        text: { type: 'string', description: '要填写的文本' },
        clear: { type: 'boolean', description: '是否先清空输入框，默认 true' }
      },
      required: ['profileId', 'ref', 'text'],
      additionalProperties: false
    },
    method: 'mcp.pages.type'
  }
]

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function respond(id, result) { write({ jsonrpc: '2.0', id, result }) }
function respondError(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }) }

async function callPrism(method, params) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${endpoint}/v1/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: crypto.randomUUID(), method, params }),
      signal: controller.signal
    })
    if (response.status === 401) throw new Error('Yk 指纹浏览器 访问令牌已失效，请在 Yk 指纹浏览器 中重新生成 MCP 配置')
    if (!response.ok) throw new Error(`Yk 指纹浏览器 返回 HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.error) throw new Error(payload.error.message ?? 'Yk 指纹浏览器 拒绝了该请求')
    return payload?.result
  } finally {
    clearTimeout(timer)
  }
}

async function handle(message) {
  const { id, method, params } = message
  if (method === 'initialize') {
    const requested = params?.protocolVersion
    return respond(id, {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO
    })
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return
  if (method === 'ping') return respond(id, {})
  if (method === 'tools/list') {
    return respond(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
    })
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find((item) => item.name === params?.name)
    if (!tool) return respondError(id, -32602, `未知工具：${String(params?.name)}`)
    try {
      const result = await callPrism(tool.method, params?.arguments ?? {})
      return respond(id, { content: [{ type: 'text', text: JSON.stringify(result ?? null, null, 2) }] })
    } catch (error) {
      return respond(id, {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true
      })
    }
  }
  if (id !== undefined) respondError(id, -32601, `不支持的方法：${String(method)}`)
}

if (!endpoint || !token) {
  process.stderr.write('缺少 PRISM_MCP_ENDPOINT 或 PRISM_MCP_TOKEN，请在 Yk 指纹浏览器 中重新生成 MCP 配置\n')
  process.exit(1)
}

const lines = createInterface({ input: process.stdin, terminal: false })
lines.on('line', (line) => {
  const text = line.trim()
  if (!text) return
  let message
  try {
    message = JSON.parse(text)
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } })
    return
  }
  void handle(message).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  })
})
lines.on('close', () => process.exit(0))
