import type { Context } from '@deepseek-ai/cordis'
import type { WorkBuddyCredentialStore } from './auth.ts'
import { oauthPoll, oauthStart } from './oauth.ts'
import type { WorkBuddyRegion } from './upstream.ts'
import { WorkBuddyUpstreamClient } from './upstream.ts'

type Region = WorkBuddyRegion
type GoBridge = {
  panel: (id: string, options: unknown) => void
  strip: (id: string, data: (...args: any[]) => (() => void)) => void
  refresh: (id: string) => void
}

/** DSH Go only loads this half when its native bridge is present. */
export function registerDshGo(
  ctx: Context,
  client: WorkBuddyUpstreamClient,
  stores: Record<Region, WorkBuddyCredentialStore>,
  onAccountAdded?: (region: Region) => Promise<void>,
): void {
  ctx.inject(['dshGo'], (goCtx: any) => {
    const go = goCtx.dshGo as GoBridge
    const regions: Region[] = ['cn', 'global']
    const state = Object.fromEntries(regions.map(region => [region, {
      status: '未登录', account: '', balance: '—', models: '—', packages: [] as { title: string, trailing: string }[],
      charges: [] as { title: string, subtitle: string, trailing: string }[],
      authUrl: '', loginId: '', qr: '', error: '', updated: '',
    }])) as Record<Region, {
      status: string, account: string, balance: string, models: string,
      packages: { title: string, trailing: string }[],
      charges: { title: string, subtitle: string, trailing: string }[],
      authUrl: string, loginId: string, qr: string, error: string, updated: string
    }>
    const listeners = new Map<Region, Set<() => void>>(regions.map(region => [region, new Set()]))
    const publish = (region: Region): void => { for (const listener of listeners.get(region)!) listener() }
    const busy = new Set<Region>()
    const inspectModels = async (region: Region): Promise<void> => {
      const route = region === 'cn' ? 'workbuddy' : 'workbuddy-global'
      try {
        const llm = (ctx as any).llm
        const registered = llm.listProviders().some((provider: { id: string }) => provider.id === route)
        state[region].models = registered ? `${(await llm.listModels(route)).length} 个` : '渠道未注册'
      } catch (error) {
        state[region].models = `读取失败：${error instanceof Error ? error.message.slice(0, 60) : String(error).slice(0, 60)}`
      }
      publish(region)
    }
    const read = async (region: Region): Promise<void> => {
      if (busy.has(region)) return
      busy.add(region)
      try {
        const credential = await stores[region].resolve()
        const credits = await client.fetchCredits(credential)
        const item = state[region]
        item.status = '已连接'
        item.account = credential.nickname || credential.uid || '已登录账号'
        item.balance = credits.total.toFixed(2)
        item.packages = credits.packages.slice(0, 10).map(pack => ({
          title: pack.packageName, trailing: pack.remain.toFixed(2),
        }))
        item.charges = []
        item.error = ''
        item.updated = new Date().toLocaleTimeString('zh-CN')
        publish(region)
        try {
          const charges = await client.fetchRequestCharges(credential)
          item.charges = charges.map(charge => ({
            title: charge.model || '模型请求', subtitle: charge.requestTime,
            trailing: `−${charge.credit.toFixed(2)}`,
          }))
          publish(region)
        } catch (error) {
          item.charges = []
          item.error = `消耗明细暂不可用：${error instanceof Error ? error.message : String(error)}`
          publish(region)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        state[region].error = message.includes('no signed-in WorkBuddy account found')
          ? '尚未登录，请点“登录 WorkBuddy”'
          : `余额读取失败：${message.slice(0, 160)}`
        publish(region)
      } finally {
        busy.delete(region)
        void inspectModels(region)
      }
    }
    const poll = async (region: Region): Promise<void> => {
      const item = state[region]
      if (!item.loginId || busy.has(region)) return
      busy.add(region)
      try {
        const answer = await oauthPoll(item.loginId, region)
        if (!answer.done) return
        item.loginId = ''
        item.qr = ''
        if ('error' in answer) {
          item.error = answer.error
          item.status = '授权失败'
        } else {
          await stores[region].addOAuthAccount(answer.account)
          item.status = '已连接'
          item.authUrl = ''
          item.error = ''
          try { await onAccountAdded?.(region) }
          catch (error) { ctx.logger.warn('dsh-connect-workbuddy: mobile model refresh failed', error) }
        }
        go.refresh(region)
        publish(region)
      } catch (error) {
        item.error = error instanceof Error ? error.message : String(error)
        item.loginId = ''
        go.refresh(region)
        publish(region)
      } finally {
        busy.delete(region)
      }
      if (item.status === '已连接') void read(region)
    }
    let ticks = 0
    const timer = setInterval(() => {
      ticks++
      for (const region of regions) {
        void poll(region)
        if (ticks % 20 === 0) void read(region)
      }
    }, 3000)
    ctx.effect(() => () => clearInterval(timer))

    for (const region of regions) {
      go.panel(region, {
        view: () => ({
          type: 'stack',
          children: [
            { type: 'metric', label: '积分余额', value: { $: 'data.balance' } },
            { type: 'keyValue', items: [
              ['账号', { $: 'data.account' }], ['状态', { $: 'data.status' }],
              ['模型', { $: 'data.models' }], ['更新', { $: 'data.updated' }],
            ] },
            { type: 'actions', items: [
              { label: '登录 WorkBuddy', action: 'login', icon: 'qr', style: 'primary' },
              { label: '刷新', action: 'refresh', icon: 'refresh' },
            ] },
            { type: 'callout', text: { $: 'data.error' }, tone: 'warn' },
            ...(state[region].qr ? [{ type: 'image', src: state[region].qr, alt: 'WorkBuddy 授权二维码' }] : []),
            ...(state[region].authUrl ? [{ type: 'actions', items: [
              { label: '打开授权页', action: 'open', icon: 'external' },
              { label: '复制授权链接', action: 'copy', icon: 'copy' },
            ] }] : []),
            { type: 'text', text: '积分包', tone: 'muted' },
            { type: 'list', items: { $: 'data.packages' } },
            { type: 'text', text: '最近 7 天消耗（最多 50 条）', tone: 'muted' },
            { type: 'list', items: { $: 'data.charges' } },
          ],
        }),
        data: (_scope: unknown, emit: (value: unknown) => void) => {
          const send = () => {
            const { qr: _qr, loginId: _loginId, authUrl: _authUrl, ...publicData } = state[region]
            emit(publicData)
          }
          listeners.get(region)!.add(send)
          send()
          void read(region)
          return () => listeners.get(region)!.delete(send)
        },
        actions: {
          login: () => ({
            pending: { label: '正在申请授权', timeoutMs: 45_000 },
            result: async () => {
              const answer = await oauthStart(region)
              if ('error' in answer) return { toast: answer.error.slice(0, 40) }
              const url = new URL(answer.verificationUri)
              const trusted = ['codebuddy.cn', 'workbuddy.cn', 'workbuddy.ai', 'codebuddy.ai', 'tencent.com']
              if (url.protocol !== 'https:' || url.username || url.password
                || !trusted.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
                return { toast: '授权链接域名不受信任' }
              }
              const item = state[region]
              item.loginId = answer.loginId
              item.authUrl = url.href
              item.status = '等待授权'
              item.error = ''
              // Generate locally; never send the OAuth state to a QR service.
              const QRCode = await import('qrcode')
              item.qr = await QRCode.toDataURL(url.href, { width: 240, margin: 1 })
              go.refresh(region)
              publish(region)
              return { toast: '授权二维码已显示' }
            },
          }),
          refresh: () => ({ pending: { label: '正在刷新', timeoutMs: 45_000 }, result: async () => {
            let modelError: unknown
            try { await onAccountAdded?.(region) }
            catch (error) { modelError = error }
            await read(region)
            if (modelError !== undefined) {
              state[region].error = `模型目录刷新失败：${modelError instanceof Error ? modelError.message.slice(0, 120) : String(modelError).slice(0, 120)}`
              publish(region)
              return { toast: '余额已刷新，模型目录失败' }
            }
            return { toast: '已刷新' }
          } }),
          open: () => state[region].authUrl ? { link: state[region].authUrl } : { toast: '请先发起登录' },
          copy: () => state[region].authUrl ? { copy: state[region].authUrl, toast: '授权链接已复制' } : { toast: '请先发起登录' },
        },
      })
    }
    go.strip('credits', (_scope: unknown, emit: (value: unknown) => void) => {
      const send = () => emit({ text: `WorkBuddy ${state.cn.balance} 积分`, icon: 'coin' })
      listeners.get('cn')!.add(send)
      send()
      void read('cn')
      return () => listeners.get('cn')!.delete(send)
    })
  })
}
