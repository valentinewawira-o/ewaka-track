// PM2 Ecosystem — eWAKA Track
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   (follow the printed command to auto-start on reboot)

module.exports = {
  apps: [
    {
      name:         'ewaka-track',
      script:       'server.js',
      instances:    1,           // single instance is fine; set to 'max' for cluster
      exec_mode:    'fork',
      watch:        false,       // set true only in dev
      autorestart:  true,
      max_memory_restart: '300M',

      env: {
        NODE_ENV:     'production',
        PORT:         3001,
        // DB — override with your real .env values
        DB_HOST:      '64.226.72.183',
        DB_PORT:      5432,
        DB_NAME:      'ekdb',
        DB_USER:      'ekadmin',
        DB_PASSWORD:  'StrongPGPass123'
      },

      // Logging
      out_file:  './logs/out.log',
      error_file:'./logs/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};