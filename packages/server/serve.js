#!/usr/bin/env node

const ch = require('chokidar')
const express = require('express')

const app = express()
const port = 8000

require('express-ws')(app)

app.use('/', express.static('.', {etag: false}))

const t = {}

const clients = new Set()

app.ws('/__files__', ws => {
    ws.send(JSON.stringify({type: 'initial', data: t}))
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
})

app.get('/__files__', (req, res) => {
    res.send(JSON.stringify(t))
})

app.get('/*', (req, res) => {
    res.sendFile(process.cwd() + '/index.html')
})

function sendAll(t) {
    for (const c of clients)
        c.send(JSON.stringify({type: 'update', data: t}))
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

app.listen(port)
