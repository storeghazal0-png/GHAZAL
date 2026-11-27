const https = require('https');

const BASE_URL = 'https://ghazal-1.storeghazal0.workers.dev';

function requestUrl(path, method = 'GET') {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    const startTime = performance.now();
    let ttfb = null;

    const req = https.request(url, { method, headers: { 'User-Agent': 'Ghazal-Benchmarker/1.0' } }, (res) => {
      ttfb = performance.now() - startTime;
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const totalTime = performance.now() - startTime;
        const bodyLen = Buffer.concat(chunks).length;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          ttfb: Math.round(ttfb),
          totalTime: Math.round(totalTime),
          bodyLen,
          ok: res.statusCode >= 200 && res.statusCode < 400
        });
      });
    });

    req.on('error', (err) => {
      const totalTime = performance.now() - startTime;
      resolve({
        status: 0,
        error: err.message,
        ttfb: Math.round(totalTime),
        totalTime: Math.round(totalTime),
        bodyLen: 0,
        ok: false
      });
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout'));
    });

    req.end();
  });
}

function calcStats(runs) {
  const successful = runs.filter(r => r.ok);
  const errorRate = ((runs.length - successful.length) / runs.length) * 100;
  
  if (successful.length === 0) {
    return { count: runs.length, errorRate: 100, min: 0, max: 0, avg: 0, p50: 0, p95: 0, minTTFB: 0, maxTTFB: 0, avgTTFB: 0, p50TTFB: 0, p95TTFB: 0 };
  }

  const times = successful.map(r => r.totalTime).sort((a, b) => a - b);
  const ttfbs = successful.map(r => r.ttfb).sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];

  const minTTFB = ttfbs[0];
  const maxTTFB = ttfbs[ttfbs.length - 1];
  const avgTTFB = Math.round(ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length);
  const p50TTFB = ttfbs[Math.floor(ttfbs.length * 0.5)];
  const p95TTFB = ttfbs[Math.floor(ttfbs.length * 0.95)];

  return {
    count: runs.length,
    successCount: successful.length,
    errorRate: Math.round(errorRate * 10) / 10,
    min, max, avg, p50, p95,
    minTTFB, maxTTFB, avgTTFB, p50TTFB, p95TTFB
  };
}

async function runSequential(path, n = 20) {
  console.log(`\n============================================================`);
  console.log(`Running ${n} sequential requests for ${path}`);
  console.log(`============================================================`);
  const runs = [];
  for (let i = 0; i < n; i++) {
    const res = await requestUrl(path);
    runs.push(res);
    process.stdout.write(`Run ${i + 1}: ${res.status} (Total: ${res.totalTime}ms, TTFB: ${res.ttfb}ms, Size: ${res.bodyLen}B) | `);
    if ((i + 1) % 2 === 0) console.log();
    // 250ms spacing to represent realistic navigation
    await new Promise(r => setTimeout(r, 250));
  }
  const stats = calcStats(runs);
  console.log(`\nSummary for ${path}:`, JSON.stringify(stats, null, 2));
  return stats;
}

async function runConcurrent(path, count = 5) {
  console.log(`\n============================================================`);
  console.log(`Running ${count} CONCURRENT requests for ${path}`);
  console.log(`============================================================`);
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(requestUrl(path));
  }
  const results = await Promise.all(promises);
  results.forEach((res, i) => {
    console.log(`Parallel #${i + 1}: Status ${res.status} (Total: ${res.totalTime}ms, TTFB: ${res.ttfb}ms, Size: ${res.bodyLen}B)`);
  });
  const successful = results.filter(r => r.ok).length;
  const errorRate = ((count - successful) / count) * 100;
  console.log(`Concurrency Result: ${successful}/${count} succeeded (${errorRate}% error rate)`);
  return {
    total: count,
    successful,
    errorRate,
    details: results.map(r => ({ status: r.status, ttfb: r.ttfb, totalTime: r.totalTime }))
  };
}

async function main() {
  console.log('STARTING PHASE 7 POST-OPTIMIZATION BENCHMARK');
  console.log('Target Worker: ' + BASE_URL);

  const endpoints = [
    '/logo.png',
    '/ar',
    '/ar/shop',
    '/ar/products/online-ghaz-boutique-scrub-600-347'
  ];

  const allStats = {};
  for (const ep of endpoints) {
    allStats[ep] = await runSequential(ep, 20);
  }

  console.log('\n============================================================');
  console.log('STARTING CONCURRENCY BENCHMARK (5 PARALLEL REQUESTS)');
  console.log('============================================================');
  const concurrencyStats = {};
  for (const ep of ['/ar', '/ar/shop', '/ar/products/online-ghaz-boutique-scrub-600-347']) {
    concurrencyStats[ep] = await runConcurrent(ep, 5);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n============================================================');
  console.log('FINAL BENCHMARK REPORT DATA');
  console.log('============================================================');
  console.log(JSON.stringify({ sequential: allStats, concurrent: concurrencyStats }, null, 2));
}

main().catch(console.error);
