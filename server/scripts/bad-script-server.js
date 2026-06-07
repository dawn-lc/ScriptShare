const http = require('http');
// 提供缺少 @namespace、@match、@grant、@version 的脚本
const code = `// ==UserScript==
// @name         Incomplete Script
// ==/UserScript==

(function() {
    'use strict';
    console.log('This script has no metadata!');
})();`;
http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/javascript' });
    r.end(code);
}).listen(19998, () => console.log('Bad script server ready on :19998'));
