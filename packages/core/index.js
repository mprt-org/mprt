async function connect() {
    console.log('Connect to page...')
}

function getAppName() {
    return new URL(location.href).searchParams.get('app')
}

async function getAppCache() {
    return await caches.open(getAppName())
}

async function getCacheString(cache, name) {
    const resp = await cache.match(name)
    if (!resp)
        return null
    return await resp.text()
}

async function getFiles() {
    const c = await getAppCache()
    return (await getCacheString(c, '__files__'))?.split('\n') ?? []
}

function checkRequest(req) {
    if (req.mode === 'navigate')
        return 'navigate'
    const u = new URL(req.url)
    if (u.origin !== origin)
        return 'origin'
    return null
}

async function handleRequest(req, typeHandlers={}) {
    const err = checkRequest(req)
    if (err)
        throw new Error(err)

    const url = new URL(req.url)
    let type = url.searchParams.get('mprt') ?? 'raw'
    if (type !== 'raw' && !typeHandlers[type])
        throw new Error('Unknown type: ' + type)

    const handler = typeHandlers[type] ?? {}

    const app = getAppName()
    const c = await caches.open(app)
    let res = await c.match(req.url)
    if (res) {
        if (handler.delayResponse)
            await handler.delayResponse(req, res)
        return res
    }

    if (handler.fetch)
        res = await handler.fetch(req)
    else
        res = await fetch(req)

    if (handler.transform)
        res = await handler.transform(req, res)

    if (handler.cache)
        await handler.cache(c, req, res)
    else if (res.ok)
        await c.put(req.url, res.clone())

    if (handler.delayResponse)
        await handler.delayResponse(req, res)

    return res
}
