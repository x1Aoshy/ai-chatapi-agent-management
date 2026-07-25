/**
 * Configuración de PM2 para el middleware.
 *
 * Uso:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'ai-middleware',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // El servidor va justo de RAM: si el proceso se dispara, mejor que PM2
      // lo reinicie a que el OOM killer elija víctima por su cuenta.
      max_memory_restart: '150M',
      // Un bucle de reinicios rápido suele significar configuración inválida;
      // esperar entre intentos evita quemar CPU en una máquina ya cargada.
      restart_delay: 4000,
      env: {
        NODE_ENV: 'production',
      },
      time: true,
    },
  ],
};
