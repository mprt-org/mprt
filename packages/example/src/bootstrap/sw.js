importScripts('https://unpkg.com/@mprt/core@0.0.6/index.js')
importScripts('https://unpkg.com/@babel/standalone@7.11.6/babel.min.js')

process = {env: {NODE_ENV: 'development'}}

importScripts('https://unpkg.com/@mprt/postcss-standalone@0.0.5/postcss.js')
importScripts('https://unpkg.com/@mprt/postcss-standalone@0.0.5/plugins/nested.js')
importScripts('https://unpkg.com/@mprt/postcss-standalone@0.0.5/plugins/modules.js')

const exts = ['.js', '.jsx', '.ts', '.tsx']
const fullExts = exts.concat(exts.map(e => '/index' + e))

async function getImportMap() {
    return (await handleRequest(new Request('/web_modules/import-map.json'))).json()
}

function resolveType(filePath) {
    if (filePath.startsWith('/web_modules/') && filePath.endsWith('.js')) {
        return null //library
    }
    else if (filePath.match(/\.[jt]sx?$/)) {
        return 'js'
    }
    else if (filePath.endsWith('.module.css')) {
        return 'module.css'
    }
    else if (filePath.endsWith('.css')) {
        return 'css'
    }
    else if (filePath.endsWith('.json')) {
        return 'json'
    }
    return 'url'
}

function resolve(path, imp, fn, {files, importMap}) {
    console.log('Import', imp, 'from', fn)
    if (imp.startsWith('.')) {
        const u = new URL(imp, origin.toString() + fn)
        imp = u.pathname
        console.log('Absolute', imp)
    }
    if (imp.endsWith('/'))
        imp = imp.slice(0, imp.length - 1)
    let res
    if (imp.startsWith('/')) {
        if (!files.includes(imp)) {
            for (const ext of fullExts) {
                if (files.includes(imp + ext)) {
                    res = imp + ext
                    break
                }
            }
            if (!res)
                console.warn('Cannot resolve relative import!')
        } else {
            res = imp
        }
    }
    else {
        const i = importMap[imp]
        if (i)
            res = '/web_modules' + i.slice(1)
        else
            console.warn('Cannot resolve bare import!')
    }
    if (res) {
        const u = new URL(res, origin.toString())
        if (!u.searchParams.get('mprt')) {
            const type = resolveType(res)
            if (type) {
                u.searchParams.set('mprt', resolveType(res))
                res = u.pathname + u.search
            }
        }
        console.log('Rewrite to', res)
    }
    return res || imp
}

function rewriteImports({types: t}, opts) {
    return {
        visitor: {
            'CallExpression'(path, {file}) {
                if (path.node.callee.type !== 'Import') {
                    return;
                }

                const [source] = path.get('arguments');
                if (source.type !== 'StringLiteral') {
                    /* Should never happen */
                    console.warn('Dynamic import with non-static string in', file.opts.parserOpts.sourceFileName)
                    return;
                }
                source.replaceWith(t.stringLiteral(resolve(path, source.node.value, file.opts.parserOpts.sourceFileName, opts)))
            },
            'ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration'(path, {file}) {
                const source = path.get('source');

                // An export without a 'from' clause
                if (source.node === null) {
                    return;
                }
                source.replaceWith(t.stringLiteral(resolve(path, source.node.value, file.opts.parserOpts.sourceFileName, opts)))
            }
        }
    }
}

Babel.registerPlugin('rewriteImports', rewriteImports)

self.addEventListener('install', e => {
    e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', e => {
    e.waitUntil(async function () {
        const promises = []
        const c = await caches.open(getAppName())
        for (const k of await c.keys())
            promises.push(c.delete(k))
        await Promise.all(promises)
        await clients.claim()
    }())
})

self.addEventListener('message', e => {
    if (e.data?.type === 'unload')
        removeClient(e.source.id) //TODO: http://crbug.com/638494
})

self.addEventListener('fetch', e => {
    const {request} = e
    if (!checkRequest(request)) {
        console.log('Local', request.url)
        e.respondWith(handleEvent(e, {
            js: {
                async transform(req, res) {
                    const name = new URL(req.url).pathname
                    const text = await res.text()
                    const presets = ['typescript', 'react']
                    const plugins = [
                        ['rewriteImports', {files: await getFiles(), importMap: (await getImportMap()).imports}],
                        ['proposal-decorators', { legacy: true }],
                        ['proposal-class-properties', { loose: true }],
                    ]
                    const t = Babel.transform(text, {presets, plugins, filename: name}).code
                    return new Response(t, {
                        headers: {
                            'Content-Type': 'text/javascript',
                            'Last-Modified': res.headers.get('Last-Modified')
                        }
                    })
                },
            },
            postcss: {
                async transform(req, res) {
                    const u = new URL(req.url)
                    const useModules = u.searchParams.get('modules')
                    const raw = await res.text()
                    const plugins = [postcssNested]
                    if (useModules)
                        plugins.push(postcssBrowserModules)
                    const t = (await postcss(plugins).process(raw, {from: u.pathname})).css

                    return new Response(t, {
                        headers: {'Content-Type': 'text/css; charset=utf-8', 'Last-Modified': res.headers.get('Last-Modified')}
                    })
                }
            },
            'module.css': {
                async transform(req, res) {
                    const u = new URL(req.url)
                    u.searchParams.set('mprt', 'postcss')
                    u.searchParams.set('modules', '1')
                    const url = u.pathname + u.search

                    const raw = await res.text()
                    const cn = {}
                    await postcss([postcssNested, postcssBrowserModules({json: cn})]).process(raw, {from: u.pathname})

                    return new Response(`
                    const link = document.createElement('link')
                    link.rel = 'stylesheet'
                    link.href = ${JSON.stringify(url)}
                    document.head.appendChild(link)
                    export default ${JSON.stringify(cn)}`, {
                        headers: {'Content-Type': 'text/javascript', 'Last-Modified': res.headers.get('Last-Modified')}
                    })
                }
            },
            css: {
                async transform(req, res) {
                    const u = new URL(req.url)
                    u.searchParams.set('mprt', 'postcss')
                    const url = u.pathname + u.search
                    return new Response(`
                    const link = document.createElement('link')
                    link.rel = 'stylesheet'
                    link.href = ${JSON.stringify(url)}
                    document.head.appendChild(link)`, {
                        headers: {'Content-Type': 'text/javascript', 'Last-Modified': res.headers.get('Last-Modified')}
                    })
                }
            },
            json: {
                async transform(req, res) {
                    return new Response('export default ' + JSON.stringify(await res.json()), {
                        headers: {'Content-Type': 'text/javascript', 'Last-Modified': res.headers.get('Last-Modified')}
                    })
                }
            },
            url: {
                fetch(req) {
                    const u = new URL(req.url)
                    return new Response('export default ' + JSON.stringify(u.pathname), {
                        headers: {'Content-Type': 'text/javascript'}
                    })
                },
                cache() {/*noop*/}
            },
        }))
    }
})
