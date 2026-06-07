const http = require('http');
const code = `// ==UserScript==
// @name         My Awesome Script
// @namespace    http://localhost/
// @version      2.0.0
// @description  Updated via webhook!
// @author       tester
// @match        https://example.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    console.log('v2.0.0 loaded!');
})();`;
http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/javascript' });
    r.end(code);
}).listen(19999, () => console.log('Download server ready on :19999'));
