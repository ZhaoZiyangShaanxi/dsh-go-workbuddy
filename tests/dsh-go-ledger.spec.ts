import { afterEach, expect, it, vi } from 'vitest'
import type { WorkBuddyCredential } from '../src/auth.ts'
import { WorkBuddyUpstreamClient } from '../src/upstream.ts'

afterEach(() => vi.unstubAllGlobals())

it('reads recent CN charges while discarding prompt text from the official response', async () => {
  let sent: Record<string, unknown> = {}
  let requested = ''
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requested = url
    sent = JSON.parse(String(init.body)) as Record<string, unknown>
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, data: { data: [
        { requestId: 'id-1', requestTime: '2026-11-08 10:00:00', model: 'DeepSeek', credit: '1.25', input: 'private prompt' },
        { requestId: 'id-2', requestTime: '2026-11-08 11:00:00', model: 'Kimi', credit: 2 },
      ] } }),
    } as Response
  })
  const credential = {
    accessToken: 'test-token', refreshToken: '', expiresAtMs: 0, domain: 'codebuddy.cn', uid: '100000000001',
    source: 'dsh', filePath: '/tmp/test',
  } as WorkBuddyCredential
  const rows = await new WorkBuddyUpstreamClient(undefined, { profile: 'conservative' }).fetchRequestCharges(credential)
  expect(sent.pageSize).toBe(3000)
  expect(requested).toBe('https://www.workbuddy.cn/billing/meter/get-user-request-usage')
  expect(rows.map(row => row.model)).toEqual(['Kimi', 'DeepSeek'])
  expect(rows[1]?.credit).toBe(1.25)
  expect(JSON.stringify(rows)).not.toContain('private prompt')
})

it('routes international usage to the credential billing domain', async () => {
  let requested = ''
  let origin = ''
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requested = url
    origin = new Headers(init.headers).get('Origin') || ''
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, data: { data: [
        { requestId: 'global-1', requestTime: '2026-11-08 10:00:00', model: 'GLM', credit: 0.5 },
      ] } }),
    } as Response
  })
  const credential = {
    accessToken: 'test-token', refreshToken: '', expiresAtMs: 0, domain: 'workbuddy.ai', uid: '100000000001',
    source: 'dsh', filePath: '/tmp/test',
  } as WorkBuddyCredential
  const rows = await new WorkBuddyUpstreamClient(undefined, { profile: 'conservative' }).fetchRequestCharges(credential)
  expect(requested).toBe('https://www.workbuddy.ai/billing/meter/get-user-request-usage')
  expect(origin).toBe('https://www.workbuddy.ai')
  expect(rows[0]?.credit).toBe(0.5)
})
