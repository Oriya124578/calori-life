import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

const localApiPlugin = () => ({
  name: 'local-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // 1. Scan directory API
      if (req.url.startsWith('/api/scan') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const courseName = url.searchParams.get('folder'); // Now expects just the course folder name
        
        if (!courseName) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Missing folder parameter' }));
        }

        const courseFolder = path.join(process.cwd(), 'public', 'files', courseName);

        if (!fs.existsSync(courseFolder)) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Folder not found' }));
        }

        const result = {};
        
        try {
          const subdirs = fs.readdirSync(courseFolder, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

          for (const subdir of subdirs) {
            result[subdir] = {};
            const subDirPath = path.join(courseFolder, subdir);
            const files = fs.readdirSync(subDirPath);
            
            for (const file of files) {
              const match = file.match(/\d+/g);
              if (match) {
                const num = parseInt(match[match.length - 1], 10);
                if (num > 0 && num <= 20) {
                  // Return a web-accessible URL relative to the public root
                  result[subdir][num] = `/files/${encodeURIComponent(courseName)}/${encodeURIComponent(subdir)}/${encodeURIComponent(file)}`;
                }
              }
            }
          }
          
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      // 2. Open file API
      if (req.url === '/api/open' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { filePath } = JSON.parse(body);
            if (fs.existsSync(filePath)) {
              exec(`start "" "${filePath}"`, (err) => {
                if(err) console.error("Error opening file:", err);
              });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'File not found' }));
            }
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // 3. Upload file API
      if (req.url === '/api/upload' && req.method === 'POST') {
        const courseFolder = decodeURIComponent(req.headers['x-course-folder'] || '');
        const taskFolder = decodeURIComponent(req.headers['x-task-folder'] || '');
        const week = req.headers['x-week'];
        const fileName = decodeURIComponent(req.headers['x-file-name'] || '');

        if (!courseFolder || !taskFolder || !week || !fileName) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Missing headers' }));
        }

        const ext = path.extname(fileName) || '.pdf';
        let finalFileName;
        if (week === 'global') {
          finalFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.\\-_א-ת ]/g, '_')}`;
        } else {
          finalFileName = `${taskFolder}_${week}${ext}`;
        }
        const destDir = path.join(process.cwd(), 'public', 'files', courseFolder, taskFolder);
        
        fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, finalFileName);
        
        const writeStream = fs.createWriteStream(destPath);
        req.pipe(writeStream);
        
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            success: true, 
            path: `/files/${encodeURIComponent(courseFolder)}/${encodeURIComponent(taskFolder)}/${encodeURIComponent(finalFileName)}` 
          }));
        });
        
        req.on('error', (err) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }
      
      next();
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    localApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // We'll manage manifest.json in public/ manually
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // The SPA navigation fallback serves index.html for client navigations.
        // Exclude the Cloud Function routes (/auth/** OAuth redirect, /api/**) so
        // those navigations reach the server instead of being hijacked by the SW.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/auth\//, /^\/api\//],
      }
    })
  ],
  server: {
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:5001/calori1300/us-central1/api',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5001/calori1300/us-central1/api',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 uses rolldown as its bundler. Use the native `codeSplitting.groups`
        // API to peel heavy vendor libs into their own chunks. Higher priority groups
        // are matched first; their modules are removed from lower-priority groups.
        codeSplitting: {
          groups: [
            { name: 'recharts', test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap)[\\/]/, priority: 40 },
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 30 },
            { name: 'framer-motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
})
