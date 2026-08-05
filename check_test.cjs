const fs = require('fs');
const src = fs.readFileSync('public/api/mollie-lib.php', 'utf8');

// Check if the return statement includes mirror_ok
const hasMirrorOk = src.includes("'mirror_ok' => \$mirrorOk");
console.log('Has mirror_ok => \$mirrorOk:', hasMirrorOk);

// Check the return statement
const idx = src.indexOf("return ['granted' => true, 'pass' => \$pass");
if (idx >= 0) {
    console.log('Found return statement at index:', idx);
    console.log(src.substring(idx, idx + 200));
} else {
    console.log('Return statement not found with expected pattern');
}

// Check for mirror_ok in return
const mirrorOkInReturn = src.includes("'mirror_ok' =>");
console.log('mirror_ok in return:', mirrorOkInReturn);

// Find the return statement in mol_b2c_pass_grant
const fnStart = src.indexOf('function mol_b2c_pass_grant');
const fnEnd = src.indexOf('function', src.indexOf('function mol_b2c_pass_grant') + 1);
const fnBody = src.substring(fnStart, fnEnd);
console.log('Function body length:', fnBody.length);
console.log('Function body ends with:', fnBody.substring(fnBody.length - 200));