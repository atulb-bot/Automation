// npm run continue  ->  tells a test that is waiting on a manual step to carry on
const fs = require('fs');
const path = require('path');
const flag = path.resolve(__dirname, '..', 'state', 'continue.flag');
fs.mkdirSync(path.dirname(flag), { recursive: true });
fs.writeFileSync(flag, new Date().toISOString());
console.log('>>> Continue signal sent. The waiting test will carry on within a few seconds.');
