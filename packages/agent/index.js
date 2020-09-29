export async function start(app, swUrl, scope='/') {
    const u = new URL(swUrl, origin)
    u.searchParams.set('app', app)
    navigator.serviceWorker.register(u.toString(), {scope})
    const ws = new WebSocket(new URL('/__files__', location.origin.replace('http', 'ws')).toString())
    await new Promise(ok => {
        ws.addEventListener('message', async e => {
            const d = JSON.parse(e.data)
            const c = await caches.open(app)
            if (d.type === 'initial') {
                await handleInitial(c, d.data)
                ok()
            }
            else
                await handleUpdate(c, d.data)
        })
    })
}

async function handleInitial(c, d) {
    const reqs = await c.keys()
    for (const req of reqs) {
        const u = new URL(req.url)
        const lastUpd = d[u.pathname]
        await deleteIfStaled(c, req, lastUpd)
    }
    await c.put('__files__', new Response(Object.keys(d).join('\n')))
}

async function getCacheString(cache, name) {
    const resp = await cache.match(name)
    if (!resp)
        return null
    return await resp.text()
}

async function handleUpdate(c, d) {
    const files = (await getCacheString(c, '__files__'))?.split('\n') ?? []
    for (const file of Object.keys(d)) {
        const lastUpd = d[file]
        const i = files.indexOf(file)
        if (lastUpd && i === -1)
            files.push(file)
        if (!lastUpd && i > -1)
            files.splice(i, 1)
        const req = new Request(new URL(file, location.origin).toString())
        const resp = await c.match(req, {ignoreSearch: true})
        if (!resp)
            continue
        await deleteIfStaled(c, req, lastUpd)
    }
    await c.put('__files__', new Response(files.join('\n')))
}

async function deleteIfStaled(c, req, lastUpd) {
    if (!lastUpd) {
        console.log('Deleted, remove from cache', req.url)
        await c.delete(req, {ignoreSearch: true})
        return
    }
    const resp = await c.match(req, {ignoreSearch: true})
    const lastMod = resp?.headers.get('Last-Modified')
    if (!lastMod) {
        console.log('Has no Last-Modified, remove from cache', req.url)
        await c.delete(req, {ignoreSearch: true})
    } else if (Date.parse(lastUpd) - Date.parse(lastMod) > 1000) {
        console.log('Staled, remove from cache', req.url)
        await c.delete(req, {ignoreSearch: true})
    }
}

