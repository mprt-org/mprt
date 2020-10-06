export async function start(app, swUrl, scope='/') {
    const u = new URL(swUrl, origin)
    u.searchParams.set('app', app)
    const prevController = navigator.serviceWorker.controller
    await navigator.serviceWorker.register(u.toString(), {scope}).then(reg => reg.update())
    const reg = await navigator.serviceWorker.getRegistration()
    if (!prevController || reg.installing || reg.waiting || (reg.active !== prevController)) {
        await new Promise(ok => navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (navigator.serviceWorker.controller.state === 'activating')
                navigator.serviceWorker.controller.addEventListener('statechange', ok)
            else
                ok()
        }))
    }
    const es = new EventSource('/__mprt__')
    addEventListener('beforeunload', () => reg.active?.postMessage({type: 'unload'}))
    await new Promise(ok => es.onopen = ok)
}
