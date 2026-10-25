const asar = require('../.tools/rea/node_modules/@electron/asar/lib/asar.js');
const fs = require('fs');
const target='/Applications/Termius.app/Contents/Resources/app.asar';
const list=asar.listPackage(target);
fs.writeFileSync('logs/termius-asar-inventory.json',JSON.stringify(list,null,2));
const p=JSON.parse(asar.extractFile(target,'package.json').toString());
const summary={fileEntries:list.length,package:{name:p.name,version:p.version,main:p.main,dependencies:p.dependencies},topLevel:[...new Set(list.map(x=>x.split('/')[1]))],sourceMaps:list.filter(x=>x.endsWith('.map')),javascript:list.filter(x=>x.endsWith('.js')).map(x=>({path:x,size:asar.statFile(target,x.replace(/^\//,'')).size}))};
fs.writeFileSync('logs/termius-asar-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
