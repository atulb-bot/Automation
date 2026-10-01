// npm run finish  ->  ends a test that is keeping its browser open at the end (recorded as passed)
const fs = require('fs');
const path = require('path');
const flag = path.resolve(__dirname, '..', 'state', 'finish.flag');
fs.mkdirSync(path.dirname(flag), { recursive: true });
fs.writeFileSync(flag, new Date().toISOString());
console.log('>>> Finish signal sent. The test closes its browser and ends within a few seconds.');
