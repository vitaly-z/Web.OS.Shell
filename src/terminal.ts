// build with
// parcel watch --hmr-hostname=localhost src/terminal.ts
import { EventEmitter } from 'events';
import $ from 'jquery';
import { Terminal } from 'xterm';

import { Process } from 'wasi-kernel/src/kernel';
import { WorkerPool, ProcessLoader } from 'wasi-kernel/src/kernel/services/worker-pool';
import { SharedVolume } from 'wasi-kernel/src/kernel/services/shared-fs';

import { Pty } from './pty';



class Shell extends EventEmitter implements ProcessLoader {

    workerScript: string
    mainProcess: Process
    pool: WorkerPool
    files: {[fn: string]: string | Uint8Array}

    constructor() {
        super();
        this.workerScript = '../node_modules/wasi-kernel/dist/worker.js';
        this.pool = new WorkerPool(this.workerScript);
        this.pool.loader = this;
        this.pool.on('worker:data', (_, x) => this.emit('data', x));
        this.files = {
            '/bin/dash':    '#!/bin/dash.wasm',
            '/bin/ls':      '#!/bin/ls.wasm',
            '/bin/touch':   '#!/bin/touch.wasm'
        };
    }

    start() {
        this.mainProcess = this.spawn('/bin/dash', ['dash']).process;
    }

    spawn(prog: string, argv: string[], env?: {}) {
        var wasm: string, file = this.files[prog];
        if (typeof file == 'string' && file.startsWith('#!'))
            wasm = file.substring(2);
        else
            wasm = prog;

        var p = this.pool.spawn(wasm, argv, env);
        p.promise
            .then((ev: {code:number}) => console.log(`${name} - exit ${ev.code}`))
            .catch((e: Error) => console.error(`${name} - error;`, e));

        (<any>p.process).worker.postMessage({upload: this.files});

        return p;
    }

    write(data: string | Uint8Array) {
        if (typeof data === 'string')
            data = Buffer.from(data);
        for (let i = 0; i < Buffer.length; i++)  // ugh
            if (data[i] == 13) data[i] = 10;
        this.mainProcess.stdin.write(data);
    }
}



$(() => {
    var term = new Terminal({cols: 60, rows: 19});
    term.setOption("convertEol", true)
    term.open(document.getElementById('terminal'));
    term.write(`\nStarting \x1B[1;3;31mdash\x1B[0m \n\n`)
    term.focus();

    var pty = new Pty;
    term.onData((x: string) => pty.termWrite(Buffer.from(x, 'binary')));
    pty.on('term:data', (x: Buffer) => term.write(x));

    var shell = new Shell();
    pty.on('data', (x: Buffer) => shell.write(x))
    shell.on('data', (x: string) => term.write(x))
    Object.assign(shell.files, {
        '/home/e': require('fs').readFileSync('./bin/example.ml.bin'),
        '/bin/ocamlrun': '#!/bin/ocamlrun.wasm'
    });
    shell.start();

    Object.assign(window, {term, shell, dash: shell.mainProcess, SharedVolume});
});

Object.assign(window, {Terminal});
