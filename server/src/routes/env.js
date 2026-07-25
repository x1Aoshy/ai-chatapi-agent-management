import { Router } from 'express';

import { config, EDITABLE_ENV_KEYS, SECRET_ENV_KEYS } from '../config.js';
import { maskSecret, readEnvFile, updateEnvFile } from '../lib/dotenv-file.js';

export const envRouter = Router();

/** Variables que el panel muestra, en el orden en que las pinta. */
const DISPLAY_KEYS = [
  'DEEPSEEK_MODEL',
  'DEEPSEEK_API_KEY',
  'CHATWOOT_ACCESS_TOKEN',
  'CHATWOOT_BASE_URL',
];

envRouter.get('/env', async (_req, res, next) => {
  try {
    const values = await readEnvFile(config.bot.envPath);

    const vars = DISPLAY_KEYS.map((key) => {
      const raw = values.get(key) ?? '';
      const secret = SECRET_ENV_KEYS.has(key);

      return {
        key,
        // Los secretos salen enmascarados: el panel jamás recibe la clave
        // completa, ni siquiera con sesión válida.
        value: secret ? maskSecret(raw) : raw,
        secret,
        isSet: raw.length > 0,
        editable: EDITABLE_ENV_KEYS.has(key),
      };
    });

    res.json({ vars });
  } catch (error) {
    next(error);
  }
});

envRouter.put('/env', async (req, res, next) => {
  const { updates } = req.body ?? {};

  if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
    return res.status(400).json({ error: "El campo 'updates' debe ser un objeto." });
  }

  const entries = Object.entries(updates);

  if (entries.length === 0) {
    return res.status(400).json({ error: 'No se ha enviado ninguna variable.' });
  }

  const accepted = {};

  for (const [key, value] of entries) {
    if (!EDITABLE_ENV_KEYS.has(key)) {
      return res.status(403).json({ error: `La variable '${key}' no es editable.` });
    }

    if (typeof value !== 'string') {
      return res.status(400).json({ error: `El valor de '${key}' debe ser una cadena.` });
    }

    // Un salto de línea partiría el .env y permitiría declarar una variable
    // extra a continuación del valor.
    if (/[\r\n]/.test(value)) {
      return res.status(400).json({ error: `El valor de '${key}' no puede tener saltos de línea.` });
    }

    /*
     * Un valor enmascarado significa "no lo toques": es lo que devuelve GET
     * para los secretos, y el panel reenvía el campo tal cual si el operador
     * no lo editó. Sin esto, guardar cualquier cambio sobrescribiría la API
     * key real con la cadena "sk-1…ab12".
     */
    if (SECRET_ENV_KEYS.has(key) && value.includes('…')) continue;

    accepted[key] = value;
  }

  if (Object.keys(accepted).length === 0) {
    return res.status(400).json({ error: 'No hay ningún cambio que aplicar.' });
  }

  try {
    await updateEnvFile(config.bot.envPath, accepted);
    console.log(`[env] actualizadas: ${Object.keys(accepted).join(', ')}`);

    const values = await readEnvFile(config.bot.envPath);
    res.json({
      vars: DISPLAY_KEYS.map((key) => {
        const raw = values.get(key) ?? '';
        const secret = SECRET_ENV_KEYS.has(key);
        return {
          key,
          value: secret ? maskSecret(raw) : raw,
          secret,
          isSet: raw.length > 0,
          editable: EDITABLE_ENV_KEYS.has(key),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});
