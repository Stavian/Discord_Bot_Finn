module.exports = {
  apps: [{
    name: 'FinnWegbier',
    script: './index.js',

    // Instances
    instances: 1,
    exec_mode: 'fork',

    // Auto-restart policies
    watch: false,
    max_memory_restart: '500M',

    // Restart behavior
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,

    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Environment variables
    env: {
      NODE_ENV: 'production'
    },

    // Advanced features
    kill_timeout: 5000,
    listen_timeout: 3000,
    shutdown_with_message: true
  }]
};
