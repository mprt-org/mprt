const ch = require('chokidar')
const express = require('express')

const app = express()

app.use('/', express.static('.', {etag: false}))

const t = {}

const clients = new Set()

app.get('/__mprt__', (req, res) => {
    req.setTimeout(0)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    })
    res.write("data: " + JSON.stringify({type: 'initial', data: t}) + "\n\n")
    clients.add(res)
    res.on('close', () => clients.delete(res))
})

app.get('/*', (req, res) => {
    res.sendFile(process.cwd() + '/index.html')
})

function sendAll(t) {
    for (const c of clients)
        c.write("data: " + JSON.stringify({type: 'update', data: t}) + "\n\n")
}

function reg(path, s) {
    path = '/' + path
    console.log(s.mtime, path)
    t[path] = s.mtime
    sendAll({[path]: s.mtime})
}

ch.watch('.', {recursive: true}).on('add', reg).on('change', reg).on('unlink', path => {
    path = '/' + path
    console.log('Remove', path)
    delete t[path]
    sendAll({[path]: null})
})

module.exports.serve = function serve(port) {
    app.listen(port)
}
