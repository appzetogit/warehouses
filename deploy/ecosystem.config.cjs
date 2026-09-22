/**
 * PM2 process layout for production (see deploy/README.md).
 *
 *   pm2 start deploy/ecosystem.config.cjs      # first start
 *   pm2 reload deploy/ecosystem.config.cjs     # zero-downtime update (API is clustered)
 *   pm2 save && pm2 startup                    # survive reboots
 *
 * This is the recommended layout and it NEEDS Redis (REDIS_ENABLED=true,
 * BULLMQ_ENABLED=true in Backend/.env):
 *   - the API runs as a cluster and the websocket server is a separate process,
 *     so API processes reach sockets only through the Socket.IO Redis adapter;
 *   - dispatch/acceptance timeouts, coin expiry and daily metrics run only as
 *     BullMQ jobs.
 * Without Redis, use the single-process layout in deploy/README.md instead.
 *
 * Every process reads Backend/.env (dotenv, relative to cwd). The env blocks
 * below only set the per-process role; secrets never go in this file.
 */
const path = require('path');

// With release directories (deploy/README.md) point this at the `current`
// symlink, e.g. WAREHOUSES_BACKEND_DIR=/srv/warehouses/current/Backend, so a
// reload after switching the symlink starts the new release. __dirname would
// resolve to one fixed release.
const backend = process.env.WAREHOUSES_BACKEND_DIR || path.resolve(__dirname, '..', 'Backend');

const common = {
  cwd: backend,
  autorestart: true,
  // The Node processes allow themselves 10s to drain before forcing exit.
  kill_timeout: 12000,
  time: true,
  merge_logs: true,
};

const worker = (name, script, maxMemory) => ({
  ...common,
  name,
  script,
  instances: 1,
  exec_mode: 'fork',
  max_memory_restart: maxMemory,
  env: { NODE_ENV: 'production' },
});

module.exports = {
  apps: [
    {
      ...common,
      name: 'warehouses-api',
      script: 'server.js',
      // Leave a core or two for Mongo/Redis/nginx on a small box; e.g. 2 on a 4-core VPS.
      instances: process.env.API_INSTANCES || 'max',
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      listen_timeout: 15000,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        SOCKET_PORT: 5001,
        // Interval jobs run once, in warehouses-scheduler, not in every API process.
        SERVER_BACKGROUND_JOBS_ENABLED: 'false',
        SERVER_QUEUE_BOOTSTRAP_ENABLED: 'false',
      },
    },
    {
      ...common,
      name: 'warehouses-socket',
      script: 'socket-server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '350M',
      env: { NODE_ENV: 'production', SOCKET_PORT: 5001 },
    },
    // Interval jobs: offer expiry, FSSAI expiry, seller subscription billing,
    // auto-deliver sweep, stuck-order watchdog, push campaigns, recommendations.
    worker('warehouses-scheduler', 'scripts/run-scheduled-jobs.js', '300M'),

    // BullMQ workers. Only these three queues have producers in the code today;
    // otp, notification and payment workers exist (npm run worker:*) but nothing
    // enqueues to them, so they are not started.
    worker('warehouses-worker-order', 'src/queues/workers/order.worker.js', '350M'),
    worker('warehouses-worker-tracking', 'src/queues/workers/tracking.worker.js', '350M'),
    worker('warehouses-worker-maintenance', 'src/queues/workers/maintenance.worker.js', '250M'),
  ],
};
