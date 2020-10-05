export async function start(app, swUrl, scope='/') {
    const u = new URL(swUrl, origin)
    u.searchParams.set('app', app)
    const reg = await navigator.serviceWorker.register(u.toString(), {scope})
    await reg.update()
    if (!navigator.serviceWorker.controller || reg.installing || reg.waiting)
        await new Promise(ok => navigator.serviceWorker.addEventListener('controllerchange', ok))
    const es = new EventSource('/__mprt__')
    addEventListener('beforeunload', () => reg.active?.postMessage({type: 'unload'}))
    await new Promise(ok => es.onopen = ok)
}
