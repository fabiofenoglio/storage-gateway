module.exports = {
  apps: [
    {
      name: 'storagegateway',
      script: './dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2048M',
      cwd: '/app/pm2/storage-gateway',
      env_local: {
        NODE_ENV: 'local',
      },
      env_production: {
        NODE_ENV: 'production',
        STORAGEGATEWAY_TOKEN_SECRET: 'your-token-secret-here',
      },
    },
  ],
};
