const { parse } = require('node-html-parser')
const fs = require('fs')
const path = require('path')
const {install: esinstall} = require('esinstall')

const babel = require('@babel/core')
const presetTs = require('@babel/preset-typescript')
const pluginJsx = require('@babel/plugin-syntax-jsx')
const pluginDecorators = require('@babel/plugin-proposal-decorators')
const pluginProps = require('@babel/plugin-proposal-class-properties')

const base = process.cwd()

const exts = ['.js', '.jsx', '.ts', '.tsx']
const fullExts = exts.concat(exts.map(e => '/index' + e))

function getPath(s, curr) {
    if (path.isAbsolute(s))
        s = base + s
    else
        s = path.resolve(path.dirname(curr), s)
    s = new URL(s, 'http://localhost').pathname
    const vars = [s].concat(fullExts.map(e => s + e))
    for (const v of vars) {
        try {
            if (fs.statSync(v).isFile())
                return v
        } catch {}
    }
    throw new Error('Cannot resolve import: ' + s)
}

function matchImportType(imp) {
    if (imp.match(/^(\/\/|https?:)/))
        return 'EXTERNAL'
    if (imp.match(/^[./]/))
        return 'LOCAL'
    return 'BARE'
}

module.exports.install = async function install() {
    let toProcess = new Set()

    const bareImports = new Set()
    const processed = new Set()

    const index = base + '/index.html'
    const html = parse(fs.readFileSync(index, 'utf-8'))
    for (const s of html.querySelectorAll('script')) {
        if (s.getAttribute('type') === 'mprt/module') {
            toProcess.add(getPath(s.getAttribute('src'), index))
        }
    }

    while (toProcess.size) {
        const nextToProcess = new Set()
        for (const filename of toProcess) {
            const t = fs.readFileSync(filename, 'utf-8')
            const result = []
            babel.transform(t, {
                filename,
                presets: [presetTs],
                plugins: [
                    [extractImports, {result}],
                    pluginJsx,
                    [pluginDecorators, { legacy: true }],
                    [pluginProps, { loose: true }],
                ],
            })
            processed.add(filename)
            for (const imp of result) {
                const t = matchImportType(imp)
                if (t === 'BARE')
                    bareImports.add(imp)
                else if (t === 'LOCAL') {
                    const f = getPath(imp, filename)
                    if (!processed.has(f) && f.match(/[jt]sx?$/))
                        nextToProcess.add(f)
                }
            }
        }
        toProcess = nextToProcess
    }
    console.log('Detected bare imports:', bareImports)
    await esinstall([...bareImports])
}

function extractImports({types: t}, {result}) {
    return {
        visitor: {
            'CallExpression'(path, {file}) {
                if (path.node.callee.type !== 'Import')
                    return
                const [source] = path.get('arguments')
                if (source.type !== 'StringLiteral') {
                    /* Should never happen */
                    console.warn('Dynamic import with non-static string in', file.opts.parserOpts.sourceFileName)
                    return
                }
                result.push(source.node.value)
            },
            'ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration'(path) {
                const source = path.get('source');
                // An export without a 'from' clause
                if (source.node === null)
                    return
                result.push(source.node.value)
            }
        }
    }
}
