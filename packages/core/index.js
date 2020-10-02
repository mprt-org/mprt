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

async function getFilesMap() {
    return files
}

async function getFiles() {
    return Object.keys(await getFilesMap())
}

function checkRequest(req) {
    if (req.mode === 'navigate')
        return 'navigate'
    const u = new URL(req.url)
    if (u.origin !== origin)
        return 'origin'
    return null
}

function isStaled(resp, lastUpd) {
    if (!lastUpd)
        return true
    const lastMod = resp.headers.get('Last-Modified')
    if (!lastMod)
        return true
    if (Date.parse(lastUpd) - Date.parse(lastMod) > 1000)
        return true
    return false
}

let files = {}
let conn = null
let clients = {}

async function ensureConnection() {
    if (!conn) {
        conn = new EventSource('/__mprt__')
        await new Promise(ok => conn.addEventListener('message', e => {
            const d = JSON.parse(e.data)
            if (d.type === 'initial') {
                files = d.data
                ok()
            }
            else if (d.type === 'update') {
                for (const [file, updTime] of Object.entries(d.data)) {
                    if (!updTime)
                        delete files[file]
                    else
                        files[file] = updTime
                }
            }
        }))
    }
}

async function addClient(clientId, onMessage, onClose) {
    if (!conn)
        throw new Error('Has no connection!')
    clients[clientId] = [onMessage, onClose]
    conn.addEventListener('message', onMessage)
}

function removeClient(clientId) {
    if (!conn) {
        clients = {}
        files = {}
        return
    }
    if (!clients[clientId])
        return
    const [onMessage, onClose] = clients[clientId]
    conn.removeEventListener('message', onMessage)
    delete clients[clientId]
    onClose()
    if (Object.keys(clients).length > 0)
        return
    conn.close()
    conn = null
    files = {}
}

// Function formatting data for SSE
function sseChunkData(data, event, retry, id) {
    return Object.entries({event, id, data, retry})
        .filter(([, value]) => ![undefined, null].includes(value))
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n') + '\n\n'
}

// Response Headers for SSE
const sseHeaders = {
    'content-type': 'text/event-stream',
    'Transfer-Encoding': 'chunked',
    'Connection': 'keep-alive',
};

// When we receive a message from the server, we forward it to the browser
function onServerMessage(controller, {data, type, retry, lastEventId}={}) {
    const responseText = sseChunkData(data, type, retry, lastEventId)
    const responseData = Uint8Array.from(responseText, x => x.charCodeAt(0))
    controller.enqueue(responseData)
}

async function interceptMprt(event) {
    await ensureConnection()
    const stream = new ReadableStream({
        start: controller => addClient(event.clientId, onServerMessage.bind(null, controller), () => controller.close()),
        cancel: () => removeClient(event.clientId), //TODO: http://crbug.com/638494
    })
    return new Response(stream, {headers: sseHeaders});
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
    if (res && !isStaled(res, files[url.pathname])) {
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

async function handleEvent(event, handlers) {
    const url = new URL(event.request.url)
    if (url.pathname === '/__mprt__')
        return await interceptMprt(event)
    return await handleRequest(event.request, handlers)
}
