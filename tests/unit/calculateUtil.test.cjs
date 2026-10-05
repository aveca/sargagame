// Real project test: addDays utility
const { addDays, formatDate } = require('../../src/utils/calculateUtil.js');

// Test: addDays with positive offset
const d1 = addDays('2024-01-01', 5);
if (d1 !== '2024-01-06') throw new Error(`Expected 2024-01-06, got ${d1}`);

// Test: addDays with negative offset
const d2 = addDays('2024-01-01', -3);
if (d2 !== '2023-12-29') throw new Error(`Expected 2023-12-29, got ${d2}`);

// Test: addDays with zero offset
const d3 = addDays('2024-06-15', 0);
if (d3 !== '2024-06-15') throw new Error(`Expected 2024-06-15, got ${d3}`);

// Test: addDays with Date object
const d4 = addDays(new Date('2024-07-01'), 10);
if (d4 !== '2024-07-11') throw new Error(`Expected 2024-07-11, got ${d4}`);

// Test: addDays crosses month boundary
const d5 = addDays('2024-01-31', 1);
if (d5 !== '2024-02-01') throw new Error(`Expected 2024-02-01, got ${d5}`);

// Test: addDays crosses year boundary
const d6 = addDays('2024-12-31', 1);
if (d6 !== '2025-01-01') throw new Error(`Expected 2025-01-01, got ${d6}`);

// Test: addDays with large negative offset
const d7 = addDays('2024-03-15', -30);
if (d7 !== '2024-02-14') throw new Error(`Expected 2024-02-14, got ${d7}`);

console.log('All addDays tests passed!');