import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [react()],
    server: {
      open: mode !== 'noopen',
      configureServer: ({ app }) => {
        app.get('/examples/', (_, res) => {
          const examplesPath = path.resolve(__dirname, 'examples');
          fs.readdir(examplesPath, (err, files) => {
            if (err) {
              res.status(500).json({ error: 'Failed to read examples' });
            } else {
              res.json(files.filter(file => file.endsWith('.json')));
            }
          });
        });

        app.use('/examples', (req, res, next) => {
          const filePath = path.resolve(__dirname, 'examples', req.path);
          res.sendFile(filePath, (err) => {
            if (err) next();
          });
        });
      }
    }
  };
});